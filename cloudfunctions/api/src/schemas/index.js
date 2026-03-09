const makeValidationError = (message) => ({ code: "VALIDATION_FAILED", status: 400, message });

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

const loginSchema = (payload) => {
  return {
    code: ensureString(payload.code, "code", 1, 128),
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

module.exports = {
  loginSchema,
  itemListSchema,
};
