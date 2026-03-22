const { createAppError } = require("../utils/app-error");
const {
  buildListConditions,
  queryItemsByOrder,
  queryItemsForDistanceSort,
  getItemById,
  createItem,
  updateItemById,
  deleteItemById,
} = require("../repositories/items");
const { getFuelRecordById } = require("../repositories/fuel-records");
const { runIdempotent, runIdempotentIfPresent } = require("./idempotency");
const { ensureItemContentSafe } = require("./content-security");
const { getGroupById, isGroupMember } = require("./groups");
const { findInteractionByKey, createInteraction } = require("../repositories/item-interactions");
const { listAllActiveGroups } = require("../repositories/groups");
const { findUsersByUserIds } = require("../repositories/users");

const ITEMS_SCAN_BATCH_SIZE = 100;
const ITEMS_SCAN_MAX_PAGES = 200;

const clamp = (num, min, max) => Math.max(min, Math.min(max, num));

const toRad = (num) => (num * Math.PI) / 180;

const calcDistanceKm = (lat1, lng1, lat2, lng2) => {
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const parseItemLocation = (item) => {
  const location = item && item.location;
  if (!location || typeof location !== "object") return null;

  if (Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    return { lat: Number(location.lat), lng: Number(location.lng) };
  }

  if (
    location.type === "Point" &&
    Array.isArray(location.coordinates) &&
    location.coordinates.length === 2 &&
    Number.isFinite(location.coordinates[0]) &&
    Number.isFinite(location.coordinates[1])
  ) {
    return { lng: Number(location.coordinates[0]), lat: Number(location.coordinates[1]) };
  }

  return null;
};

const toAuthorView = (ownerId, userDoc) => ({
  id: ownerId || "",
  nickname: (userDoc && userDoc.nickname) || "",
  avatar: (userDoc && userDoc.avatar) || "",
  ...(userDoc && userDoc.nicknameSource ? { nicknameSource: userDoc.nicknameSource } : {}),
  ...(userDoc && userDoc.avatarSource ? { avatarSource: userDoc.avatarSource } : {}),
});

const enrichItemsWithAuthor = async (items = []) => {
  if (!Array.isArray(items) || !items.length) return [];
  const ownerIds = Array.from(
    new Set(
      items
        .map((item) => (item && typeof item.ownerId === "string" ? item.ownerId.trim() : ""))
        .filter(Boolean)
    )
  );
  const userDocs = await findUsersByUserIds(ownerIds);
  const userById = new Map();
  userDocs.forEach((doc) => {
    const userId = doc && typeof doc.userId === "string" ? doc.userId : "";
    if (userId) {
      userById.set(userId, doc);
    }
  });

  return items.map((item) => ({
    ...item,
    author: toAuthorView(item && item.ownerId, userById.get(item && item.ownerId)),
  }));
};

const enrichItemWithAuthor = async (item) => {
  if (!item || typeof item !== "object") return item;
  const list = await enrichItemsWithAuthor([item]);
  return list[0] || item;
};

const buildVisibilityScope = async (user) => {
  if (!user) {
    return {
      mode: "anonymous",
      userId: "",
      groupIds: new Set(),
    };
  }

  if (user.role === "admin") {
    return {
      mode: "admin",
      userId: user.id,
      groupIds: new Set(),
    };
  }

  const groups = await listAllActiveGroups();
  const groupIds = new Set();
  groups.forEach((group) => {
    if (!group || !group._id) return;
    if (isGroupMember(group, user.id)) {
      groupIds.add(group._id);
    }
  });

  return {
    mode: "member",
    userId: user.id,
    groupIds,
  };
};

const canReadItemFromScope = (item, scope) => {
  const visibility = item && item.visibility ? item.visibility : "public";
  if (scope.mode === "admin") return true;
  if (visibility === "public") return true;
  if (!scope.userId) return false;
  if (item && item.ownerId && item.ownerId === scope.userId) return true;
  if (visibility === "group" && item && item.groupId && scope.groupIds.has(item.groupId)) return true;
  return false;
};

const queryVisibleItemsByOrder = async ({ conditions, sort, page, pageSize, scope }) => {
  const visible = [];

  for (let queryPage = 1; queryPage <= ITEMS_SCAN_MAX_PAGES; queryPage += 1) {
    const queried = await queryItemsByOrder({
      conditions,
      page: queryPage,
      pageSize: ITEMS_SCAN_BATCH_SIZE,
      sort,
    });
    const rows = Array.isArray(queried && queried.list) ? queried.list : [];
    if (!rows.length) break;
    rows.forEach((item) => {
      if (canReadItemFromScope(item, scope)) {
        visible.push(item);
      }
    });

    const reachedEnd = queryPage * ITEMS_SCAN_BATCH_SIZE >= Number(queried.total || 0);
    if (reachedEnd) break;
  }

  const skip = (page - 1) * pageSize;
  return {
    total: visible.length,
    list: visible.slice(skip, skip + pageSize),
  };
};

const listItems = async ({ user, page, pageSize, sort, lat, lng, city, type, tag }) => {
  const baseConditions = buildListConditions({ city, type, tag });
  const scope = await buildVisibilityScope(user);
  const conditions = { ...baseConditions };
  if (scope.mode === "anonymous") {
    conditions.visibility = "public";
  }

  let result;
  if (sort !== "distance") {
    if (scope.mode === "member") {
      result = await queryVisibleItemsByOrder({
        conditions,
        sort,
        page,
        pageSize,
        scope,
      });
    } else {
      result = await queryItemsByOrder({ conditions, page, pageSize, sort });
    }
  } else {
    const sampleFactor = scope.mode === "member" ? 6 : 3;
    const sampleSize = clamp(page * pageSize * sampleFactor, 60, 1200);
    const sampled = await queryItemsForDistanceSort({
      conditions,
      page,
      pageSize,
      sampleSize,
    });

    const rowsWithDistance = sampled.list
      .map((item) => {
        if (!canReadItemFromScope(item, scope)) return null;
        const point = parseItemLocation(item);
        if (!point) return null;
        return {
          ...item,
          distanceKm: Number(calcDistanceKm(lat, lng, point.lat, point.lng).toFixed(2)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const skip = (page - 1) * pageSize;
    const total = scope.mode === "member" ? rowsWithDistance.length : sampled.total;
    result = {
      total,
      list: rowsWithDistance.slice(skip, skip + pageSize),
    };
  }

  return {
    total: result.total,
    list: await enrichItemsWithAuthor(result.list),
  };
};

const listItemsByIds = async ({ ids = [], user = null }) => {
  const normalized = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    )
  );
  if (!normalized.length) {
    return {
      total: 0,
      list: [],
    };
  }

  const loaded = await Promise.all(normalized.map((id) => getItemById(id)));
  const visible = [];
  for (const item of loaded) {
    if (!item) continue;
    // Keep snapshot order while ensuring visibility rules still apply.
    // eslint-disable-next-line no-await-in-loop
    if (await canReadItem(item, user)) {
      visible.push(item);
    }
  }
  return {
    total: visible.length,
    list: await enrichItemsWithAuthor(visible),
  };
};

const canReadItem = async (item, user) => {
  const visibility = item.visibility || "public";
  if (visibility === "public") return true;
  if (!user) return false;
  if (item.ownerId && item.ownerId === user.id) return true;
  if (user.role === "admin") return true;
  if (visibility === "group" && item.groupId) {
    const group = await getGroupById(item.groupId);
    if (!group) return false;
    return isGroupMember(group, user.id);
  }
  return false;
};

const getItemDetail = async (id, user) => {
  const item = await getItemById(id);
  if (!item) {
    throw createAppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Item not found",
      expose: true,
    });
  }

  if (!(await canReadItem(item, user))) {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "No permission to access this item",
      expose: true,
    });
  }

  return enrichItemWithAuthor(item);
};

const computeHotScore = (stats = {}) => {
  const likes = Number(stats.likes) || 0;
  const shares = Number(stats.shares) || 0;
  const views = Number(stats.views) || 0;
  return Number((likes * 3 + shares * 2 + views * 0.5).toFixed(2));
};

const buildInteractionKey = ({ action, itemId, userId, now = new Date() }) => {
  const dayKey = now.toISOString().slice(0, 10);
  return `${action}:${itemId}:${userId}:${dayKey}`;
};

const isDuplicateInteractionError = (error) => {
  const text = error && error.message ? String(error.message) : "";
  return /DuplicateKey|dup key|E11000/i.test(text);
};

const normalizeCreatePayload = (payload, userId) => {
  const now = new Date().toISOString();
  const stats = { likes: 0, shares: 0, views: 0 };

  return {
    ownerId: userId,
    title: payload.title || "",
    content: payload.content,
    type: payload.type,
    location: payload.location,
    route: payload.route,
    tags: payload.tags || [],
    visibility: payload.visibility,
    groupId: payload.groupId || "",
    fuelRecordId: payload.fuelRecordId || "",
    stats,
    hotScore: computeHotScore(stats),
    createdAt: now,
    updatedAt: now,
  };
};

const normalizeItemFuelRecord = async ({ fuelRecordId, user }) => {
  if (!fuelRecordId) return "";
  const fuelRecord = await getFuelRecordById(fuelRecordId);
  if (!fuelRecord) {
    throw createAppError({
      code: "VALIDATION_FAILED",
      status: 400,
      message: "fuelRecordId not found",
      expose: true,
    });
  }
  const isOwner = fuelRecord.ownerId === user.id;
  const isAdmin = user.role === "admin";
  if (!isOwner && !isAdmin) {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "fuelRecordId does not belong to current user",
      expose: true,
    });
  }
  return fuelRecordId;
};

const ensureWritePermission = (item, user) => {
  if (!item) {
    throw createAppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Item not found",
      expose: true,
    });
  }

  const isOwner = user && item.ownerId && item.ownerId === user.id;
  const isAdmin = user && user.role === "admin";
  if (!isOwner && !isAdmin) {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "No permission to modify this item",
      expose: true,
    });
  }
};

const validateMergedItemShape = (item) => {
  if (item.visibility === "group" && !item.groupId) {
    throw createAppError({
      code: "VALIDATION_FAILED",
      status: 400,
      message: "groupId is required when visibility=group",
      expose: true,
    });
  }
  if (item.type === "route" && !item.route) {
    throw createAppError({
      code: "VALIDATION_FAILED",
      status: 400,
      message: "route is required when type=route",
      expose: true,
    });
  }
};

const normalizeItemVisibilityByGroup = async ({ groupId, visibility, user }) => {
  if (!groupId) return visibility;
  const group = await getGroupById(groupId);
  if (!group || group.status !== "active") {
    throw createAppError({
      code: "VALIDATION_FAILED",
      status: 400,
      message: "group not found or inactive",
      expose: true,
    });
  }
  if (!isGroupMember(group, user.id)) {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "must be a group member to associate group content",
      expose: true,
    });
  }
  if (group.privacy === "private") {
    return "group";
  }
  return visibility;
};

const createItemPost = async ({ ctx, payload }) => {
  const user = ctx.state && ctx.state.user;
  const userId = user && user.id;

  return runIdempotent({
    ctx,
    path: "/api/v1/posts",
    userId,
    payload,
    execute: async () => {
      const doc = normalizeCreatePayload(payload, userId);
      doc.visibility = await normalizeItemVisibilityByGroup({
        groupId: doc.groupId,
        visibility: doc.visibility,
        user,
      });
      doc.fuelRecordId = await normalizeItemFuelRecord({
        fuelRecordId: doc.fuelRecordId,
        user,
      });
      validateMergedItemShape(doc);
      await ensureItemContentSafe({ title: doc.title, content: doc.content });
      const created = await createItem(doc);
      return {
        success: true,
        data: await enrichItemWithAuthor(created),
      };
    },
  });
};

const pickUpdateFields = (payload) => {
  const updates = {};
  const allowed = [
    "title",
    "content",
    "type",
    "location",
    "route",
    "tags",
    "visibility",
    "groupId",
    "fuelRecordId",
  ];

  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      updates[key] = payload[key];
    }
  });
  return updates;
};

const updateItemPost = async ({ ctx, itemId, payload }) => {
  const user = ctx.state && ctx.state.user;
  const userId = user && user.id;
  const existing = await getItemById(itemId);
  ensureWritePermission(existing, user);

  const updates = pickUpdateFields(payload);
  const merged = { ...existing, ...updates };

  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/posts/:id",
    userId,
    payload: { id: itemId, ...payload },
    execute: async () => {
      merged.visibility = await normalizeItemVisibilityByGroup({
        groupId: merged.groupId,
        visibility: merged.visibility,
        user,
      });
      merged.fuelRecordId = await normalizeItemFuelRecord({
        fuelRecordId: merged.fuelRecordId,
        user,
      });
      validateMergedItemShape(merged);
      await ensureItemContentSafe({ title: merged.title, content: merged.content });
      const next = {
        ...updates,
        visibility: merged.visibility,
        fuelRecordId: merged.fuelRecordId,
        updatedAt: new Date().toISOString(),
      };
      if (updates.stats && typeof updates.stats === "object") {
        next.hotScore = computeHotScore(updates.stats);
      }
      const updated = await updateItemById(itemId, next);
      return {
        success: true,
        data: await enrichItemWithAuthor(updated),
      };
    },
  });
};

const deleteItemPost = async ({ ctx, itemId }) => {
  const user = ctx.state && ctx.state.user;
  const existing = await getItemById(itemId);
  ensureWritePermission(existing, user);
  await deleteItemById(itemId);
  return {
    success: true,
    data: { deleted: true },
  };
};

const incrementItemStat = async ({ item, action }) => {
  const stats = item && item.stats && typeof item.stats === "object" ? item.stats : {};
  const field = action === "share" ? "shares" : "likes";
  const nextStats = {
    likes: Number(stats.likes) || 0,
    shares: Number(stats.shares) || 0,
    views: Number(stats.views) || 0,
  };
  nextStats[field] += 1;
  const hotScore = computeHotScore(nextStats);
  const updated = await updateItemById(item._id, {
    stats: nextStats,
    hotScore,
    updatedAt: new Date().toISOString(),
  });
  return updated;
};

const interactItemPost = async ({ itemId, user, action }) => {
  const item = await getItemById(itemId);
  if (!item) {
    throw createAppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Item not found",
      expose: true,
    });
  }
  if (!(await canReadItem(item, user))) {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "No permission to access this item",
      expose: true,
    });
  }

  const key = buildInteractionKey({
    action,
    itemId,
    userId: user.id,
  });
  const existing = await findInteractionByKey(key);
  if (existing) {
    return {
      success: true,
      data: {
        applied: false,
        stats: item.stats || {},
        hotScore: Number(item.hotScore) || 0,
      },
    };
  }

  try {
    await createInteraction({
      key,
      itemId,
      userId: user.id,
      action,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    if (isDuplicateInteractionError(err)) {
      const latest = await getItemById(itemId);
      return {
        success: true,
        data: {
          applied: false,
          stats: (latest && latest.stats) || {},
          hotScore: Number(latest && latest.hotScore) || 0,
        },
      };
    }
    throw err;
  }
  const updated = await incrementItemStat({ item, action });
  return {
    success: true,
    data: {
      applied: true,
      stats: updated && updated.stats ? updated.stats : {},
      hotScore: Number(updated && updated.hotScore) || 0,
    },
  };
};

module.exports = {
  listItems,
  listItemsByIds,
  getItemDetail,
  createItemPost,
  updateItemPost,
  deleteItemPost,
  interactItemPost,
};
