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
  if (payload.refreshToken === undefined || payload.refreshToken === null || payload.refreshToken === "") {
    return {};
  }
  return {
    refreshToken: ensureString(payload.refreshToken, "refreshToken", 8, 256),
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
  const groupId = ensureOptionalString(payload.groupId, "groupId", 1, 128);

  if (type === "route" && !route) {
    throw makeValidationError("route is required when type=route");
  }
  if (visibility === "group" && !groupId) {
    throw makeValidationError("groupId is required when visibility=group");
  }
  if (groupId && !["group", "private"].includes(visibility)) {
    throw makeValidationError("groupId is only allowed when visibility is group/private");
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
    payload.groupId === undefined ? undefined : ensureOptionalString(payload.groupId, "groupId", 1, 128);

  if (type === "route" && route === undefined) {
    throw makeValidationError("route is required when type=route");
  }
  if (visibility === "group" && !groupId) {
    throw makeValidationError("groupId is required when visibility=group");
  }
  if (groupId && visibility !== undefined && !["group", "private"].includes(visibility)) {
    throw makeValidationError("groupId is only allowed when visibility is group/private");
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
  };
};

module.exports = {
  loginSchema,
  refreshTokenSchema,
  itemListSchema,
  itemDetailSchema,
  itemCreateSchema,
  itemUpdateSchema,
};
