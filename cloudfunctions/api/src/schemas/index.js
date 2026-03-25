const { createAppError } = require("../utils/app-error");

const makeValidationError = (message) =>
  createAppError({ code: "VALIDATION_FAILED", status: 400, message, expose: true });

const ensureString = (value, field, min, max) => {
  if (typeof value !== "string") {
    throw makeValidationError(`${field} must be a string`);
  }
  if (value.length < min || value.length > max) {
    throw makeValidationError(`${field} length must be between ${min} and ${max}`);
  }
  return value;
};

const parseNumber = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
};

const ensureOptionalString = (value, field, min, max) => {
  if (value === undefined) return undefined;
  if (value === null) {
    throw makeValidationError(`${field} must be a string`);
  }
  if (typeof value !== "string") {
    throw makeValidationError(`${field} must be a string`);
  }
  if (value.length < min || value.length > max) {
    throw makeValidationError(`${field} length must be between ${min} and ${max}`);
  }
  return value;
};

const ensureArrayOfString = (value, field, maxSize, eachMaxLen) => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw makeValidationError(`${field} must be an array`);
  }
  if (value.length > maxSize) {
    throw makeValidationError(`${field} size must be <= ${maxSize}`);
  }
  return value.map((item, idx) => ensureString(item, `${field}[${idx}]`, 1, eachMaxLen));
};

const normalizeOptionalId = (value, field) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return ensureString(value, field, 1, 128);
};

const normalizeLocation = (location) => {
  if (location === undefined) return undefined;
  if (!location || typeof location !== "object") {
    throw makeValidationError("location must be an object");
  }
  const lat = parseNumber(location.lat, NaN);
  const lng = parseNumber(location.lng, NaN);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw makeValidationError("location.lat must be between -90 and 90");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw makeValidationError("location.lng must be between -180 and 180");
  }
  const city = location.city === undefined ? undefined : ensureString(location.city, "location.city", 1, 64);
  return {
    lat,
    lng,
    ...(city ? { city } : {}),
  };
};

const normalizeRoute = (route) => {
  if (route === undefined) return undefined;
  if (!route || typeof route !== "object") {
    throw makeValidationError("route must be an object");
  }
  const start = ensureString(route.start, "route.start", 1, 64);
  const end = ensureString(route.end, "route.end", 1, 64);
  const distanceKm = route.distanceKm === undefined ? undefined : parseNumber(route.distanceKm, NaN);
  const durationMin = route.durationMin === undefined ? undefined : parseNumber(route.durationMin, NaN);
  if (distanceKm !== undefined && (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 10000)) {
    throw makeValidationError("route.distanceKm must be between 0 and 10000");
  }
  if (durationMin !== undefined && (!Number.isFinite(durationMin) || durationMin < 0 || durationMin > 100000)) {
    throw makeValidationError("route.durationMin must be between 0 and 100000");
  }
  const waypoints =
    route.waypoints === undefined ? undefined : ensureArrayOfString(route.waypoints, "route.waypoints", 30, 64);
  return {
    start,
    end,
    ...(distanceKm !== undefined ? { distanceKm } : {}),
    ...(durationMin !== undefined ? { durationMin } : {}),
    ...(waypoints ? { waypoints } : {}),
  };
};

const loginSchema = (payload) => {
  return {
    code: ensureString(payload.code, "code", 1, 128),
  };
};

const refreshTokenSchema = (payload) => {
  if (payload.refreshToken === undefined || payload.refreshToken === null) {
    throw makeValidationError("refreshToken is required");
  }
  const refreshToken = ensureString(payload.refreshToken, "refreshToken", 8, 256).trim();
  if (!refreshToken) {
    throw makeValidationError("refreshToken is required");
  }
  return {
    refreshToken,
  };
};

const itemListSchema = (payload) => {
  const page = parseNumber(payload.page, 1);
  const pageSize = parseNumber(payload.pageSize, 10);
  const lat = parseNumber(payload.lat, undefined);
  const lng = parseNumber(payload.lng, undefined);
  const sort = payload.sort || "hot";
  const type = payload.type;
  const city = payload.city;
  const tag = payload.tag;

  if (!Number.isInteger(page) || page < 1) throw makeValidationError("page must be >= 1");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw makeValidationError("pageSize must be between 1 and 50");
  }
  if (!["hot", "new", "distance"].includes(sort)) {
    throw makeValidationError("sort must be one of hot/new/distance");
  }
  if (sort === "distance" && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
    throw makeValidationError("lat/lng are required when sort=distance");
  }
  if (lat !== undefined && !Number.isFinite(lat)) throw makeValidationError("lat must be a number");
  if (lng !== undefined && !Number.isFinite(lng)) throw makeValidationError("lng must be a number");
  if (city !== undefined) ensureString(city, "city", 1, 64);
  if (type !== undefined && !["route", "spot", "food"].includes(type)) {
    throw makeValidationError("type must be one of route/spot/food");
  }
  if (tag !== undefined) ensureString(tag, "tag", 1, 32);

  return {
    page,
    pageSize,
    sort,
    lat,
    lng,
    city,
    type,
    tag,
  };
};

const itemDetailSchema = (payload) => {
  return {
    id: ensureString(payload.id, "id", 1, 128),
  };
};

const normalizeVisibility = (value, fallback = "public") => {
  const visibility = value === undefined ? fallback : value;
  if (!["public", "group", "private"].includes(visibility)) {
    throw makeValidationError("visibility must be one of public/group/private");
  }
  return visibility;
};

const itemCreateSchema = (payload) => {
  const title = ensureOptionalString(payload.title, "title", 1, 64);
  const content = ensureString(payload.content, "content", 1, 500);
  const type = payload.type;
  if (!["route", "spot", "food"].includes(type)) {
    throw makeValidationError("type must be one of route/spot/food");
  }
  const location = normalizeLocation(payload.location);
  const route = normalizeRoute(payload.route);
  const tags = ensureArrayOfString(payload.tags, "tags", 10, 24);
  const visibility = normalizeVisibility(payload.visibility, "public");
  const groupId = normalizeOptionalId(payload.groupId, "groupId");
  const fuelRecordId = normalizeOptionalId(payload.fuelRecordId, "fuelRecordId");

  if (type === "route" && !route) {
    throw makeValidationError("route is required when type=route");
  }
  if (visibility === "group" && !groupId) {
    throw makeValidationError("groupId is required when visibility=group");
  }
  return {
    ...(title !== undefined ? { title } : {}),
    content,
    type,
    ...(location !== undefined ? { location } : {}),
    ...(route !== undefined ? { route } : {}),
    tags,
    visibility,
    ...(groupId !== undefined ? { groupId } : {}),
    ...(fuelRecordId !== undefined ? { fuelRecordId } : {}),
  };
};

const itemUpdateSchema = (payload) => {
  const id = ensureString(payload.id, "id", 1, 128);
  const hasAnyField = [
    "title",
    "content",
    "type",
    "location",
    "route",
    "tags",
    "visibility",
    "groupId",
    "fuelRecordId",
  ].some((key) => Object.prototype.hasOwnProperty.call(payload, key));
  if (!hasAnyField) {
    throw makeValidationError("at least one updatable field is required");
  }

  const title = ensureOptionalString(payload.title, "title", 1, 64);
  const content = payload.content === undefined ? undefined : ensureString(payload.content, "content", 1, 500);
  const type = payload.type;
  if (type !== undefined && !["route", "spot", "food"].includes(type)) {
    throw makeValidationError("type must be one of route/spot/food");
  }
  const location = normalizeLocation(payload.location);
  const route = normalizeRoute(payload.route);
  const tags =
    payload.tags === undefined ? undefined : ensureArrayOfString(payload.tags, "tags", 10, 24);
  const visibility =
    payload.visibility === undefined ? undefined : normalizeVisibility(payload.visibility, "public");
  const groupId =
    payload.groupId === undefined ? undefined : normalizeOptionalId(payload.groupId, "groupId");
  const hasFuelRecordId = Object.prototype.hasOwnProperty.call(payload, "fuelRecordId");
  let fuelRecordId;
  if (hasFuelRecordId) {
    fuelRecordId =
      payload.fuelRecordId === "" || payload.fuelRecordId === null
        ? ""
        : normalizeOptionalId(payload.fuelRecordId, "fuelRecordId");
  }

  if (visibility === "group" && !groupId) {
    throw makeValidationError("groupId is required when visibility=group");
  }
  return {
    id,
    ...(title !== undefined ? { title } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(route !== undefined ? { route } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(visibility !== undefined ? { visibility } : {}),
    ...(groupId !== undefined ? { groupId } : {}),
    ...(hasFuelRecordId ? { fuelRecordId } : {}),
  };
};

const vehicleCatalogListSchema = (payload) => {
  const brand = payload.brand === undefined ? undefined : ensureString(payload.brand, "brand", 1, 64);
  const keyword = payload.keyword === undefined ? undefined : ensureString(payload.keyword, "keyword", 1, 32);
  const page = parseNumber(payload.page, 1);
  const pageSize = parseNumber(payload.pageSize, 20);

  if (!Number.isInteger(page) || page < 1) {
    throw makeValidationError("page must be >= 1");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw makeValidationError("pageSize must be between 1 and 50");
  }
  if (keyword && !brand && pageSize > 20) {
    throw makeValidationError("pageSize must be <= 20 when keyword search without brand");
  }

  return {
    ...(brand !== undefined ? { brand } : {}),
    ...(keyword !== undefined ? { keyword } : {}),
    page,
    pageSize,
  };
};

const vehicleCatalogBrandsSchema = (payload) => {
  const keyword = payload.keyword === undefined ? undefined : ensureString(payload.keyword, "keyword", 1, 32);
  const page = parseNumber(payload.page, 1);
  const pageSize = parseNumber(payload.pageSize, 50);
  if (!Number.isInteger(page) || page < 1) {
    throw makeValidationError("page must be >= 1");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    throw makeValidationError("pageSize must be between 1 and 200");
  }
  return {
    ...(keyword !== undefined ? { keyword } : {}),
    page,
    pageSize,
  };
};

const vehiclesListSchema = (payload) => {
  const page = parseNumber(payload.page, 1);
  const pageSize = parseNumber(payload.pageSize, 10);
  if (!Number.isInteger(page) || page < 1) {
    throw makeValidationError("page must be >= 1");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw makeValidationError("pageSize must be between 1 and 50");
  }
  return { page, pageSize };
};

const parseTankCapacity = (value, field) => {
  if (value === undefined) return undefined;
  const num = parseNumber(value, NaN);
  if (!Number.isFinite(num) || num <= 0 || num > 200) {
    throw makeValidationError(`${field} must be between 0 and 200`);
  }
  return Number(num.toFixed(2));
};

const vehicleCreateSchema = (payload) => {
  const brand = ensureString(payload.brand, "brand", 1, 64);
  const model = ensureString(payload.model, "model", 1, 64);
  const tankCapacityL = parseTankCapacity(payload.tankCapacityL, "tankCapacityL");
  return {
    brand,
    model,
    ...(tankCapacityL !== undefined ? { tankCapacityL } : {}),
  };
};

const vehicleIdSchema = (payload) => ({
  id: ensureString(payload.id, "id", 1, 128),
});

const vehicleUpdateSchema = (payload) => {
  const id = ensureString(payload.id, "id", 1, 128);
  const hasAnyField = ["brand", "model", "tankCapacityL"].some((key) =>
    Object.prototype.hasOwnProperty.call(payload, key)
  );
  if (!hasAnyField) {
    throw makeValidationError("at least one updatable field is required");
  }

  const brand =
    payload.brand === undefined ? undefined : ensureString(payload.brand, "brand", 1, 64);
  const model =
    payload.model === undefined ? undefined : ensureString(payload.model, "model", 1, 64);
  const tankCapacityL = parseTankCapacity(payload.tankCapacityL, "tankCapacityL");

  return {
    id,
    ...(brand !== undefined ? { brand } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(tankCapacityL !== undefined ? { tankCapacityL } : {}),
  };
};

const parseBool = (value, field) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw makeValidationError(`${field} must be a boolean`);
};

const fuelRecordsListSchema = (payload) => {
  const vehicleId =
    payload.vehicleId === undefined ? undefined : ensureString(payload.vehicleId, "vehicleId", 1, 128);
  const page = parseNumber(payload.page, 1);
  const pageSize = parseNumber(payload.pageSize, 10);

  if (!Number.isInteger(page) || page < 1) {
    throw makeValidationError("page must be >= 1");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw makeValidationError("pageSize must be between 1 and 50");
  }

  return {
    ...(vehicleId ? { vehicleId } : {}),
    page,
    pageSize,
  };
};

const parsePositiveNumber = (value, field, max = Number.MAX_SAFE_INTEGER) => {
  const num = parseNumber(value, NaN);
  if (!Number.isFinite(num) || num <= 0 || num > max) {
    throw makeValidationError(`${field} must be > 0`);
  }
  return num;
};

const fuelRecordCreateSchema = (payload) => {
  const vehicleId = ensureString(payload.vehicleId, "vehicleId", 1, 128);
  const pricePerL = Number(parsePositiveNumber(payload.pricePerL, "pricePerL", 100000).toFixed(2));
  const fuelLiters = Number(parsePositiveNumber(payload.fuelLiters, "fuelLiters", 10000).toFixed(3));
  const amountPaid = Number(parsePositiveNumber(payload.amountPaid, "amountPaid", 1000000).toFixed(2));
  const odometerKm = Number(parsePositiveNumber(payload.odometerKm, "odometerKm", 10000000).toFixed(2));
  const isFull = parseBool(payload.isFull, "isFull");
  const lastOdometerKm =
    payload.lastOdometerKm === undefined
      ? undefined
      : Number(parsePositiveNumber(payload.lastOdometerKm, "lastOdometerKm", 10000000).toFixed(2));
  const note = payload.note === undefined ? undefined : ensureString(payload.note, "note", 1, 140);

  return {
    vehicleId,
    pricePerL,
    fuelLiters,
    amountPaid,
    odometerKm,
    isFull,
    ...(lastOdometerKm !== undefined ? { lastOdometerKm } : {}),
    ...(note !== undefined ? { note } : {}),
  };
};

const fuelRecordIdSchema = (payload) => ({
  id: ensureString(payload.id, "id", 1, 128),
});

const fuelRecordUpdateSchema = (payload) => {
  const id = ensureString(payload.id, "id", 1, 128);
  const hasAnyField = [
    "pricePerL",
    "fuelLiters",
    "amountPaid",
    "odometerKm",
    "isFull",
    "lastOdometerKm",
    "note",
  ].some((key) =>
    Object.prototype.hasOwnProperty.call(payload, key)
  );
  if (!hasAnyField) {
    throw makeValidationError("at least one updatable field is required");
  }

  const pricePerL =
    payload.pricePerL === undefined
      ? undefined
      : Number(parsePositiveNumber(payload.pricePerL, "pricePerL", 100000).toFixed(2));
  const amountPaid =
    payload.amountPaid === undefined
      ? undefined
      : Number(parsePositiveNumber(payload.amountPaid, "amountPaid", 1000000).toFixed(2));
  const fuelLiters =
    payload.fuelLiters === undefined
      ? undefined
      : Number(parsePositiveNumber(payload.fuelLiters, "fuelLiters", 10000).toFixed(3));
  const odometerKm =
    payload.odometerKm === undefined
      ? undefined
      : Number(parsePositiveNumber(payload.odometerKm, "odometerKm", 10000000).toFixed(2));
  const isFull = payload.isFull === undefined ? undefined : parseBool(payload.isFull, "isFull");
  const lastOdometerKm =
    payload.lastOdometerKm === undefined
      ? undefined
      : Number(parsePositiveNumber(payload.lastOdometerKm, "lastOdometerKm", 10000000).toFixed(2));
  const note = payload.note === undefined ? undefined : ensureString(payload.note, "note", 1, 140);

  return {
    id,
    ...(pricePerL !== undefined ? { pricePerL } : {}),
    ...(fuelLiters !== undefined ? { fuelLiters } : {}),
    ...(amountPaid !== undefined ? { amountPaid } : {}),
    ...(odometerKm !== undefined ? { odometerKm } : {}),
    ...(isFull !== undefined ? { isFull } : {}),
    ...(lastOdometerKm !== undefined ? { lastOdometerKm } : {}),
    ...(note !== undefined ? { note } : {}),
  };
};

const usersProfileUpdateSchema = (payload) => {
  const hasAnyField = ["nickname", "nicknameSource", "avatarSource", "avatarUrl"].some((key) =>
    Object.prototype.hasOwnProperty.call(payload, key)
  );
  if (!hasAnyField) {
    throw makeValidationError("at least one profile field is required");
  }

  const nickname = payload.nickname === undefined ? undefined : ensureString(payload.nickname, "nickname", 1, 20);
  const nicknameSource =
    payload.nicknameSource === undefined
      ? undefined
      : ensureString(payload.nicknameSource, "nicknameSource", 1, 16);
  const avatarSource =
    payload.avatarSource === undefined ? undefined : ensureString(payload.avatarSource, "avatarSource", 1, 16);
  const avatarUrl = payload.avatarUrl === undefined ? undefined : ensureString(payload.avatarUrl, "avatarUrl", 1, 1024);

  if (nicknameSource !== undefined && !["manual", "wechat"].includes(nicknameSource)) {
    throw makeValidationError("nicknameSource must be one of manual/wechat");
  }
  if (avatarSource !== undefined && avatarSource !== "wechat") {
    throw makeValidationError("avatarSource only supports wechat");
  }
  if (nicknameSource === "manual" && !nickname) {
    throw makeValidationError("nickname is required when nicknameSource=manual");
  }
  if (nicknameSource === "wechat" && !nickname) {
    throw makeValidationError("nickname is required when nicknameSource=wechat");
  }
  if (avatarSource === "wechat" && !avatarUrl) {
    throw makeValidationError("avatarUrl is required when avatarSource=wechat");
  }
  if (avatarUrl !== undefined && avatarSource !== "wechat") {
    throw makeValidationError("avatarSource=wechat is required when avatarUrl is provided");
  }

  return {
    ...(nickname !== undefined ? { nickname } : {}),
    ...(nicknameSource !== undefined ? { nicknameSource } : {}),
    ...(avatarSource !== undefined ? { avatarSource } : {}),
    ...(avatarUrl !== undefined ? { avatarUrl } : {}),
  };
};

const usersPreferencesUpdateSchema = (payload) => {
  const hasAnyField = ["feedSortDefault", "distanceUnit", "publishVisibilityDefault", "allowNearbyRecommendation"].some(
    (key) => Object.prototype.hasOwnProperty.call(payload, key)
  );
  if (!hasAnyField) {
    throw makeValidationError("at least one preferences field is required");
  }

  const feedSortDefault =
    payload.feedSortDefault === undefined
      ? undefined
      : ensureString(payload.feedSortDefault, "feedSortDefault", 1, 16);
  const distanceUnit =
    payload.distanceUnit === undefined ? undefined : ensureString(payload.distanceUnit, "distanceUnit", 1, 8);
  const publishVisibilityDefault =
    payload.publishVisibilityDefault === undefined
      ? undefined
      : ensureString(payload.publishVisibilityDefault, "publishVisibilityDefault", 1, 16);
  const allowNearbyRecommendation =
    payload.allowNearbyRecommendation === undefined
      ? undefined
      : parseBool(payload.allowNearbyRecommendation, "allowNearbyRecommendation");

  if (feedSortDefault !== undefined && !["hot", "new", "distance"].includes(feedSortDefault)) {
    throw makeValidationError("feedSortDefault must be one of hot/new/distance");
  }
  if (distanceUnit !== undefined && !["km", "mi"].includes(distanceUnit)) {
    throw makeValidationError("distanceUnit must be one of km/mi");
  }
  if (
    publishVisibilityDefault !== undefined &&
    !["public", "group", "private"].includes(publishVisibilityDefault)
  ) {
    throw makeValidationError("publishVisibilityDefault must be one of public/group/private");
  }

  return {
    ...(feedSortDefault !== undefined ? { feedSortDefault } : {}),
    ...(distanceUnit !== undefined ? { distanceUnit } : {}),
    ...(publishVisibilityDefault !== undefined ? { publishVisibilityDefault } : {}),
    ...(allowNearbyRecommendation !== undefined ? { allowNearbyRecommendation } : {}),
  };
};

const feedbackCreateSchema = (payload) => {
  const text = ensureString(payload.text, "text", 1, 500);
  const contact = payload.contact === undefined ? undefined : ensureString(payload.contact, "contact", 1, 100);
  return {
    text,
    ...(contact !== undefined ? { contact } : {}),
  };
};

const groupsListSchema = (payload) => {
  const page = parseNumber(payload.page, 1);
  const pageSize = parseNumber(payload.pageSize, 10);
  if (!Number.isInteger(page) || page < 1) {
    throw makeValidationError("page must be >= 1");
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw makeValidationError("pageSize must be between 1 and 50");
  }
  return { page, pageSize };
};

const groupCreateSchema = (payload) => {
  const name = ensureString(payload.name, "name", 1, 40);
  const description =
    payload.description === undefined ? undefined : ensureString(payload.description, "description", 1, 200);
  const privacy = payload.privacy === undefined ? "public" : ensureString(payload.privacy, "privacy", 1, 16);
  if (!["public", "private"].includes(privacy)) {
    throw makeValidationError("privacy must be one of public/private");
  }
  return {
    name,
    ...(description !== undefined ? { description } : {}),
    privacy,
  };
};

const groupIdSchema = (payload) => ({
  id: ensureString(payload.id, "id", 1, 128),
});

const groupTransferSchema = (payload) => ({
  id: ensureString(payload.id, "id", 1, 128),
  toUserId: ensureString(payload.toUserId, "toUserId", 1, 128),
});

const groupPrivacySchema = (payload) => {
  const id = ensureString(payload.id, "id", 1, 128);
  const privacy = ensureString(payload.privacy, "privacy", 1, 16);
  if (!["public", "private"].includes(privacy)) {
    throw makeValidationError("privacy must be one of public/private");
  }
  return { id, privacy };
};

const groupKickSchema = (payload) => ({
  id: ensureString(payload.id, "id", 1, 128),
  userId: ensureString(payload.userId, "userId", 1, 128),
});

module.exports = {
  loginSchema,
  refreshTokenSchema,
  itemListSchema,
  itemDetailSchema,
  itemCreateSchema,
  itemUpdateSchema,
  vehicleCatalogListSchema,
  vehicleCatalogBrandsSchema,
  vehiclesListSchema,
  vehicleCreateSchema,
  vehicleIdSchema,
  vehicleUpdateSchema,
  fuelRecordsListSchema,
  fuelRecordCreateSchema,
  fuelRecordIdSchema,
  fuelRecordUpdateSchema,
  usersProfileUpdateSchema,
  usersPreferencesUpdateSchema,
  feedbackCreateSchema,
  groupsListSchema,
  groupCreateSchema,
  groupIdSchema,
  groupTransferSchema,
  groupPrivacySchema,
  groupKickSchema,
};
