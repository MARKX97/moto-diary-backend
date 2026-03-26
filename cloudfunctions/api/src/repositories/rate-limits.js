const { getDb, addDoc, updateQuery, getUpdatedCount } = require("../utils/db");

const RATE_LIMITS_COLLECTION = "rate_limits";
const WRITE_RETRY_TIMES = 5;

const getRateLimitsCollection = () => getDb().collection(RATE_LIMITS_COLLECTION);

const buildBucketKey = ({ scope, subject, bucket }) => `${scope}:${subject}:${bucket}`;

const parseCount = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
};

const getByKey = async (key) => {
  const res = await getRateLimitsCollection().where({ key }).limit(1).get();
  const rows = Array.isArray(res && res.data) ? res.data : [];
  return rows[0] || null;
};

const getWindowRecord = async ({ scope, subject, bucket }) => {
  const key = buildBucketKey({ scope, subject, bucket });
  return getByKey(key);
};

const createCounter = async ({ key, scope, subject, bucket, count, expiredAt }) => {
  const now = new Date().toISOString();
  return addDoc(getRateLimitsCollection(), {
    key,
    scope,
    subject,
    bucket,
    count,
    createdAt: now,
    updatedAt: now,
    expiredAt,
  });
};

const updateCounterWithVersion = async ({ id, updatedAt, nextCount, expiredAt }) => {
  const now = new Date().toISOString();
  const res = await updateQuery(
    getRateLimitsCollection().where({
      _id: id,
      updatedAt,
    }),
    {
      count: nextCount,
      updatedAt: now,
      expiredAt,
    }
  );
  return getUpdatedCount(res) > 0;
};

const updateWindowRecordWithVersion = async ({ id, updatedAt, patch }) => {
  const now = new Date().toISOString();
  const res = await updateQuery(
    getRateLimitsCollection().where({
      _id: id,
      updatedAt,
    }),
    {
      ...patch,
      updatedAt: now,
    }
  );
  return getUpdatedCount(res) > 0;
};

const isDuplicateError = (err) => {
  const msg = err && err.message ? String(err.message) : "";
  return /DuplicateKey|dup key|E11000/i.test(msg);
};

const consumeWindowCounter = async ({ scope, subject, bucket, windowMs, limit, amount = 1 }) => {
  const nowMs = Date.now();
  const expiredAt = new Date(nowMs + windowMs).toISOString();
  const key = buildBucketKey({ scope, subject, bucket });
  for (let attempt = 0; attempt < WRITE_RETRY_TIMES; attempt += 1) {
    const current = await getByKey(key);
    if (!current) {
      try {
        await createCounter({
          key,
          scope,
          subject,
          bucket,
          count: amount,
          expiredAt,
        });
        return {
          count: amount,
          limit,
          remaining: Math.max(0, limit - amount),
          resetAt: expiredAt,
        };
      } catch (err) {
        if (!isDuplicateError(err)) {
          throw err;
        }
      }
      continue;
    }

    const currentCount = parseCount(current.count);
    const isExpired = current.expiredAt && new Date(current.expiredAt).getTime() <= nowMs;
    const nextCount = isExpired ? amount : currentCount + amount;
    const nextExpiredAt = isExpired ? expiredAt : current.expiredAt || expiredAt;
    const ok = await updateCounterWithVersion({
      id: current._id,
      updatedAt: current.updatedAt,
      nextCount,
      expiredAt: nextExpiredAt,
    });
    if (!ok) continue;
    return {
      count: nextCount,
      limit,
      remaining: Math.max(0, limit - nextCount),
      resetAt: nextExpiredAt,
    };
  }

  throw new Error("rate limit counter update conflict");
};

const upsertWindowRecord = async ({ scope, subject, bucket, windowMs, patch = {} }) => {
  const nowMs = Date.now();
  const expiredAt = new Date(nowMs + windowMs).toISOString();
  const key = buildBucketKey({ scope, subject, bucket });

  for (let attempt = 0; attempt < WRITE_RETRY_TIMES; attempt += 1) {
    const current = await getByKey(key);
    if (!current) {
      try {
        const now = new Date().toISOString();
        await addDoc(getRateLimitsCollection(), {
          key,
          scope,
          subject,
          bucket,
          count: 0,
          expiredAt,
          createdAt: now,
          updatedAt: now,
          ...patch,
        });
        return getByKey(key);
      } catch (err) {
        if (!isDuplicateError(err)) {
          throw err;
        }
      }
      continue;
    }

    const nextExpiredAt = current.expiredAt && new Date(current.expiredAt).getTime() > nowMs ? current.expiredAt : expiredAt;
    const ok = await updateWindowRecordWithVersion({
      id: current._id,
      updatedAt: current.updatedAt,
      patch: {
        ...patch,
        expiredAt: nextExpiredAt,
      },
    });
    if (!ok) continue;
    return getByKey(key);
  }

  throw new Error("window record update conflict");
};

module.exports = {
  consumeWindowCounter,
  getWindowRecord,
  upsertWindowRecord,
};
