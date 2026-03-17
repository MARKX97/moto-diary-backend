const { createAppError } = require("../utils/app-error");
const {
  buildListConditions,
  queryItemsByOrder,
  queryItemsForDistanceSort,
  getItemById,
  createItem,
  updateItemById,
} = require("../repositories/items");
const { runIdempotent } = require("./idempotency");
const { ensureItemContentSafe } = require("./content-security");

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

const listItems = async ({ page, pageSize, sort, lat, lng, city, type, tag }) => {
  const conditions = buildListConditions({ city, type, tag });

  if (sort !== "distance") {
    return queryItemsByOrder({ conditions, page, pageSize, sort });
  }

  const sampleSize = clamp(page * pageSize * 3, 60, 600);
  const sampled = await queryItemsForDistanceSort({
    conditions,
    page,
    pageSize,
    sampleSize,
  });

  const rowsWithDistance = sampled.list
    .map((item) => {
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
  return {
    total: sampled.total,
    list: rowsWithDistance.slice(skip, skip + pageSize),
  };
};

const canReadItem = (item, userId) => {
  const visibility = item.visibility || "public";
  if (visibility === "public") return true;
  if (!userId) return false;
  if (item.ownerId && item.ownerId === userId) return true;
  return false;
};

const getItemDetail = async (id, userId) => {
  const item = await getItemById(id);
  if (!item) {
    throw createAppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Item not found",
      expose: true,
    });
  }

  if (!canReadItem(item, userId)) {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "No permission to access this item",
      expose: true,
    });
  }

  return item;
};

const computeHotScore = (stats = {}) => {
  const likes = Number(stats.likes) || 0;
  const shares = Number(stats.shares) || 0;
  const views = Number(stats.views) || 0;
  return Number((likes * 3 + shares * 2 + views * 0.5).toFixed(2));
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
    stats,
    hotScore: computeHotScore(stats),
    createdAt: now,
    updatedAt: now,
  };
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
  if (item.groupId && !["group", "private"].includes(item.visibility)) {
    throw createAppError({
      code: "VALIDATION_FAILED",
      status: 400,
      message: "groupId is only allowed when visibility is group/private",
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

const createItemPost = async ({ ctx, payload }) => {
  const user = ctx.state && ctx.state.user;
  const userId = user && user.id;
  const doc = normalizeCreatePayload(payload, userId);
  validateMergedItemShape(doc);

  return runIdempotent({
    ctx,
    path: "/api/v1/items",
    userId,
    payload,
    execute: async () => {
      await ensureItemContentSafe({ title: doc.title, content: doc.content });
      const created = await createItem(doc);
      return {
        success: true,
        data: created,
      };
    },
  });
};

const pickUpdateFields = (payload) => {
  const updates = {};
  const allowed = ["title", "content", "type", "location", "route", "tags", "visibility", "groupId"];

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
  validateMergedItemShape(merged);

  return runIdempotent({
    ctx,
    path: "/api/v1/items/:id",
    userId,
    payload: { id: itemId, ...payload },
    execute: async () => {
      await ensureItemContentSafe({ title: merged.title, content: merged.content });
      const next = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      if (updates.stats && typeof updates.stats === "object") {
        next.hotScore = computeHotScore(updates.stats);
      }
      const updated = await updateItemById(itemId, next);
      return {
        success: true,
        data: updated,
      };
    },
  });
};

module.exports = {
  listItems,
  getItemDetail,
  createItemPost,
  updateItemPost,
};
