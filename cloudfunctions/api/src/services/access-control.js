const crypto = require("crypto");
const { createAppError } = require("../utils/app-error");
const { getClientId } = require("../utils/client-id");
const { consumeWindowCounter, getWindowRecord, upsertWindowRecord } = require("../repositories/rate-limits");

const loginWindows = new Map();
const anonymousSnapshots = new Map();

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CHINA_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const ANON_SNAPSHOT_SCOPE = "anonymous_feed_snapshot_per_day";
const ANON_QUOTA_SCOPE = "anonymous_feed_per_day";
const ANON_LIMIT_HINT = "游客列表按中国自然日固定快照；登录后可查看完整列表";

const nowMs = () => Date.now();

const toPositiveInt = (value, fallback) => {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return fallback;
  return num;
};

const cleanupExpired = (map, now) => {
  for (const [key, value] of map.entries()) {
    if (!value || value.expiresAt <= now) {
      map.delete(key);
    }
  }
};

const loginLimit = () => toPositiveInt(process.env.LOGIN_RATE_LIMIT_PER_HOUR, 30);
const anonymousDailyLimit = () => toPositiveInt(process.env.ANON_FEED_QUOTA_PER_DAY, 10);
const useDbRateLimits = () => String(process.env.RATE_LIMITS_BACKEND || "db").toLowerCase() === "db";

const pickHeaders = (event = {}) => event.headers || event.header || {};

const resolveClientId = (ctx = {}) =>
  getClientId({
    event: (ctx && ctx.event) || {},
    context: (ctx && ctx.state && ctx.state.context) || (ctx && ctx.context) || {},
  });

const normalizeBucketNumber = (value, precision = 1) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num.toFixed(precision);
};

const buildSnapshotQueryFingerprint = (queryShape = {}) => {
  const normalized = {
    sort: typeof queryShape.sort === "string" ? queryShape.sort : "hot",
    city: typeof queryShape.city === "string" ? queryShape.city.trim() : "",
    type: typeof queryShape.type === "string" ? queryShape.type.trim() : "",
    tag: typeof queryShape.tag === "string" ? queryShape.tag.trim() : "",
    latBucket: normalizeBucketNumber(queryShape.lat, 1),
    lngBucket: normalizeBucketNumber(queryShape.lng, 1),
  };
  const raw = JSON.stringify(normalized);
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
};

const buildSnapshotSubject = (ctx, queryShape = {}) => {
  const identifier = resolveClientId(ctx);
  const fingerprint = buildSnapshotQueryFingerprint(queryShape);
  return `${identifier}:${fingerprint}`;
};

const getDayState = (ctx, queryShape = {}) => {
  const now = nowMs();
  const identifier = resolveClientId(ctx);
  const snapshotSubject = buildSnapshotSubject(ctx, queryShape);
  const dayBucket = Math.floor((now + CHINA_TZ_OFFSET_MS) / ONE_DAY_MS);
  const dayStartUtcMs = dayBucket * ONE_DAY_MS - CHINA_TZ_OFFSET_MS;
  const expiresAt = dayStartUtcMs + ONE_DAY_MS;
  return {
    now,
    identifier,
    snapshotSubject,
    dayBucket,
    expiresAt,
    resetAt: new Date(expiresAt).toISOString(),
  };
};

const normalizeItemIds = (itemIds = []) =>
  Array.from(
    new Set(
      (Array.isArray(itemIds) ? itemIds : [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    )
  ).slice(0, anonymousDailyLimit());

const buildAnonymousQuota = (resetAt, snapshotSize = 0) => {
  const limit = anonymousDailyLimit();
  const used = Math.min(limit, Number.isFinite(Number(snapshotSize)) ? Math.max(0, Math.floor(Number(snapshotSize))) : 0);
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    scope: ANON_QUOTA_SCOPE,
    resetAt,
    hint: ANON_LIMIT_HINT,
    frozen: true,
    limitedByData: used < limit,
  };
};

const getAnonymousSnapshotInMemory = (ctx, queryShape = {}) => {
  const { now, dayBucket, snapshotSubject } = getDayState(ctx, queryShape);
  cleanupExpired(anonymousSnapshots, now);
  const key = `${dayBucket}:${snapshotSubject}`;
  const value = anonymousSnapshots.get(key);
  if (!value || !Array.isArray(value.itemIds) || !value.itemIds.length) return null;
  return {
    itemIds: value.itemIds,
    quota: buildAnonymousQuota(new Date(value.expiresAt).toISOString(), value.itemIds.length),
  };
};

const setAnonymousSnapshotInMemory = (ctx, itemIds = [], queryShape = {}) => {
  const normalized = normalizeItemIds(itemIds);
  const { dayBucket, snapshotSubject, expiresAt, resetAt } = getDayState(ctx, queryShape);
  const key = `${dayBucket}:${snapshotSubject}`;
  anonymousSnapshots.set(key, {
    itemIds: normalized,
    expiresAt,
  });
  return {
    itemIds: normalized,
    quota: buildAnonymousQuota(resetAt, normalized.length),
  };
};

const safeConsumeDbCounter = async ({ scope, identifier, bucket, windowMs, limit, amount }) => {
  if (!useDbRateLimits()) return null;
  try {
    return await consumeWindowCounter({
      scope,
      subject: identifier,
      bucket,
      windowMs,
      limit,
      amount,
    });
  } catch (_err) {
    return null;
  }
};

const safeGetDbSnapshot = async ({ identifier, bucket, now }) => {
  if (!useDbRateLimits()) return null;
  try {
    const record = await getWindowRecord({
      scope: ANON_SNAPSHOT_SCOPE,
      subject: identifier,
      bucket,
    });
    if (!record) return null;
    if (record.expiredAt && new Date(record.expiredAt).getTime() <= now) return null;
    const itemIds = normalizeItemIds(record.itemIds);
    if (!itemIds.length) return null;
    return {
      itemIds,
      quota: buildAnonymousQuota(record.expiredAt || new Date(now + ONE_DAY_MS).toISOString(), itemIds.length),
    };
  } catch (_err) {
    return null;
  }
};

const safeSaveDbSnapshot = async ({ identifier, bucket, itemIds }) => {
  if (!useDbRateLimits()) return null;
  const normalized = normalizeItemIds(itemIds);
  if (!normalized.length) return null;
  try {
    const record = await upsertWindowRecord({
      scope: ANON_SNAPSHOT_SCOPE,
      subject: identifier,
      bucket,
      windowMs: ONE_DAY_MS,
      patch: {
        count: normalized.length,
        itemIds: normalized,
      },
    });
    if (!record) return null;
    return {
      itemIds: normalized,
      quota: buildAnonymousQuota(record.expiredAt || new Date(nowMs() + ONE_DAY_MS).toISOString(), normalized.length),
    };
  } catch (_err) {
    return null;
  }
};

const ensureLoginRateLimitInMemory = (ctx) => {
  const now = nowMs();
  cleanupExpired(loginWindows, now);

  const identifier = resolveClientId(ctx);
  const hourBucket = Math.floor(now / ONE_HOUR_MS);
  const key = `${hourBucket}:${identifier}`;
  const current = loginWindows.get(key) || { count: 0, expiresAt: (hourBucket + 1) * ONE_HOUR_MS };
  const limit = loginLimit();

  if (current.count >= limit) {
    throw createAppError({
      code: "RATE_LIMITED",
      status: 429,
      message: "Too many login attempts, try again later",
      details: {
        limit,
        scope: "login_per_hour",
        resetAt: new Date(current.expiresAt).toISOString(),
      },
      expose: true,
    });
  }

  current.count += 1;
  loginWindows.set(key, current);
};

const ensureLoginRateLimit = async (ctx) => {
  const identifier = resolveClientId(ctx);
  const now = nowMs();
  const hourBucket = Math.floor(now / ONE_HOUR_MS);
  const limit = loginLimit();

  const counter = await safeConsumeDbCounter({
    scope: "login_per_hour",
    identifier,
    bucket: hourBucket,
    windowMs: ONE_HOUR_MS,
    limit,
    amount: 1,
  });
  if (!counter) {
    ensureLoginRateLimitInMemory(ctx);
    return;
  }
  if (counter.count > limit) {
    throw createAppError({
      code: "RATE_LIMITED",
      status: 429,
      message: "Too many login attempts, try again later",
      details: {
        limit,
        scope: "login_per_hour",
        resetAt: counter.resetAt,
      },
      expose: true,
    });
  }
};

const getAnonymousFeedSnapshot = async (ctx, queryShape = {}) => {
  const { now, snapshotSubject, dayBucket } = getDayState(ctx, queryShape);
  const dbSnapshot = await safeGetDbSnapshot({
    identifier: snapshotSubject,
    bucket: dayBucket,
    now,
  });
  if (dbSnapshot) {
    return dbSnapshot;
  }
  return getAnonymousSnapshotInMemory(ctx, queryShape);
};

const saveAnonymousFeedSnapshot = async (ctx, itemIds = [], queryShape = {}) => {
  const normalized = normalizeItemIds(itemIds);
  if (!normalized.length) {
    const { resetAt } = getDayState(ctx, queryShape);
    return {
      itemIds: [],
      quota: buildAnonymousQuota(resetAt, 0),
    };
  }

  const { snapshotSubject, dayBucket } = getDayState(ctx, queryShape);
  const dbSaved = await safeSaveDbSnapshot({
    identifier: snapshotSubject,
    bucket: dayBucket,
    itemIds: normalized,
  });
  if (dbSaved) {
    setAnonymousSnapshotInMemory(ctx, normalized, queryShape);
    return dbSaved;
  }
  return setAnonymousSnapshotInMemory(ctx, normalized, queryShape);
};

const ensureAnonymousFeedClientIdentity = (ctx) => {
  const stateContext = (ctx && ctx.state && ctx.state.context) || (ctx && ctx.context) || {};
  const openid = stateContext && (stateContext.OPENID || stateContext.openid);
  if (typeof openid === "string" && openid.trim()) {
    return `wx:${openid.trim()}`;
  }
  const headers = pickHeaders((ctx && ctx.event) || {});
  const deviceId =
    headers["x-device-id"] ||
    headers["X-Device-Id"] ||
    ((ctx && ctx.event && ctx.event.data && ctx.event.data.deviceId) || "");
  if (typeof deviceId === "string" && deviceId.trim()) {
    return `dev:${deviceId.trim()}`;
  }
  throw createAppError({
    code: "VALIDATION_FAILED",
    status: 400,
    message: "x-device-id is required for anonymous feed",
    expose: true,
  });
};

module.exports = {
  ensureLoginRateLimit,
  getAnonymousFeedSnapshot,
  saveAnonymousFeedSnapshot,
  ensureAnonymousFeedClientIdentity,
};
