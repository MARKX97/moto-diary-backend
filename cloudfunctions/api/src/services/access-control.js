const { createAppError } = require("../utils/app-error");
const { getClientId } = require("../utils/client-id");

const loginWindows = new Map();
const anonymousQuota = new Map();

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
const anonymousDailyLimit = () => toPositiveInt(process.env.ANON_FEED_QUOTA_PER_DAY, 20);

const ensureLoginRateLimit = (ctx) => {
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

const consumeAnonymousFeedQuota = (ctx, amount = 1) => {
  const now = nowMs();
  cleanupExpired(anonymousQuota, now);

  const limit = anonymousDailyLimit();
  const consume = Math.max(1, Number.isFinite(Number(amount)) ? Number(amount) : 1);
  const identifier = getClientId(ctx);
  const dayBucket = Math.floor(now / ONE_DAY_MS);
  const key = `${dayBucket}:${identifier}`;
  const current = anonymousQuota.get(key) || { used: 0, expiresAt: (dayBucket + 1) * ONE_DAY_MS };

  if (current.used >= limit) {
    throw createAppError({
      code: "RATE_LIMITED",
      status: 429,
      message: "Anonymous daily feed quota exceeded",
      details: {
        limit,
        used: current.used,
        remaining: 0,
        scope: "anonymous_feed_per_day",
        resetAt: new Date(current.expiresAt).toISOString(),
      },
      expose: true,
    });
  }

  current.used = Math.min(limit, current.used + consume);
  anonymousQuota.set(key, current);

  return {
    limit,
    used: current.used,
    remaining: Math.max(0, limit - current.used),
    scope: "anonymous_feed_per_day",
    resetAt: new Date(current.expiresAt).toISOString(),
  };
};

module.exports = {
  ensureLoginRateLimit,
  consumeAnonymousFeedQuota,
};
