const { createAppError } = require("../utils/app-error");
const { getClientId } = require("../utils/client-id");
const { consumeWindowCounter, getWindowRecord, upsertWindowRecord } = require("../repositories/rate-limits");

const loginWindows = new Map();
const anonymousSnapshots = new Map();

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ANON_SNAPSHOT_SCOPE = "anonymous_feed_snapshot_per_day";
const ANON_QUOTA_SCOPE = "anonymous_feed_per_day";
const ANON_LIMIT_HINT = "登录后不受游客额度限制，也可在配额重置后再试";

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

const getDayState = (ctx) => {
  const now = nowMs();
  const identifier = getClientId(ctx);
  const dayBucket = Math.floor(now / ONE_DAY_MS);
  const expiresAt = (dayBucket + 1) * ONE_DAY_MS;
  return {
    now,
    identifier,
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

const buildAnonymousQuota = (resetAt) => ({
  limit: anonymousDailyLimit(),
  used: anonymousDailyLimit(),
  remaining: 0,
  scope: ANON_QUOTA_SCOPE,
  resetAt,
  hint: ANON_LIMIT_HINT,
  frozen: true,
});

const getAnonymousSnapshotInMemory = (ctx) => {
  const { now, dayBucket, identifier } = getDayState(ctx);
  cleanupExpired(anonymousSnapshots, now);
  const key = `${dayBucket}:${identifier}`;
  const value = anonymousSnapshots.get(key);
  if (!value || !Array.isArray(value.itemIds) || !value.itemIds.length) return null;
  return {
    itemIds: value.itemIds,
    quota: buildAnonymousQuota(new Date(value.expiresAt).toISOString()),
  };
};

const setAnonymousSnapshotInMemory = (ctx, itemIds = []) => {
  const normalized = normalizeItemIds(itemIds);
  const { dayBucket, identifier, expiresAt, resetAt } = getDayState(ctx);
  const key = `${dayBucket}:${identifier}`;
  anonymousSnapshots.set(key, {
    itemIds: normalized,
    expiresAt,
  });
  return {
    itemIds: normalized,
    quota: buildAnonymousQuota(resetAt),
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
      quota: buildAnonymousQuota(record.expiredAt || new Date(now + ONE_DAY_MS).toISOString()),
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
        count: anonymousDailyLimit(),
        itemIds: normalized,
      },
    });
    if (!record) return null;
    return {
      itemIds: normalized,
      quota: buildAnonymousQuota(record.expiredAt || new Date(nowMs() + ONE_DAY_MS).toISOString()),
    };
  } catch (_err) {
    return null;
  }
};

const ensureLoginRateLimitInMemory = (ctx) => {
  const now = nowMs();
  cleanupExpired(loginWindows, now);

  const identifier = getClientId(ctx);
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
  const identifier = getClientId(ctx);
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

const getAnonymousFeedSnapshot = async (ctx) => {
  const { now, identifier, dayBucket } = getDayState(ctx);
  const dbSnapshot = await safeGetDbSnapshot({
    identifier,
    bucket: dayBucket,
    now,
  });
  if (dbSnapshot) {
    return dbSnapshot;
  }
  return getAnonymousSnapshotInMemory(ctx);
};

const saveAnonymousFeedSnapshot = async (ctx, itemIds = []) => {
  const normalized = normalizeItemIds(itemIds);
  if (!normalized.length) {
    const { resetAt } = getDayState(ctx);
    return {
      itemIds: [],
      quota: buildAnonymousQuota(resetAt),
    };
  }

  const { identifier, dayBucket } = getDayState(ctx);
  const dbSaved = await safeSaveDbSnapshot({
    identifier,
    bucket: dayBucket,
    itemIds: normalized,
  });
  if (dbSaved) {
    setAnonymousSnapshotInMemory(ctx, normalized);
    return dbSaved;
  }
  return setAnonymousSnapshotInMemory(ctx, normalized);
};

module.exports = {
  ensureLoginRateLimit,
  getAnonymousFeedSnapshot,
  saveAnonymousFeedSnapshot,
};

