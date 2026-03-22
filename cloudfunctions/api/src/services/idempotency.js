const crypto = require("crypto");
const { createAppError } = require("../utils/app-error");
const {
  findIdempotencyRecord,
  createIdempotencyRecord,
  updateIdempotencyRecord,
} = require("../repositories/idempotency");

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const stableStringify = (value) => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};

const hashPayload = (payload) =>
  crypto.createHash("sha256").update(stableStringify(payload || {})).digest("hex");

const getIdempotencyKeyFromEvent = (event = {}) => {
  const headers = event.headers || event.header || {};
  const candidates = [
    headers["Idempotency-Key"],
    headers["idempotency-key"],
    headers["IDEMPOTENCY-KEY"],
    event.idempotencyKey,
    event["Idempotency-Key"],
    event.data && event.data.idempotencyKey,
    event.data && event.data["Idempotency-Key"],
  ];
  const raw = candidates.find((item) => typeof item === "string" && item.trim());
  return raw ? raw.trim() : "";
};

const requireIdempotencyKey = (ctx) => {
  const key = getIdempotencyKeyFromEvent(ctx && ctx.event);
  if (!key) {
    throw createAppError({
      code: "VALIDATION_FAILED",
      status: 400,
      message: "Idempotency-Key is required",
      expose: true,
    });
  }
  if (key.length > 128) {
    throw createAppError({
      code: "VALIDATION_FAILED",
      status: 400,
      message: "Idempotency-Key length must be <= 128",
      expose: true,
    });
  }
  return key;
};

const hasIdempotencyKey = (ctx) => Boolean(getIdempotencyKeyFromEvent(ctx && ctx.event));

const runIdempotent = async ({ ctx, path, userId, payload, execute }) => {
  const key = requireIdempotencyKey(ctx);
  const bodyHash = hashPayload(payload);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiredAtIso = new Date(now.getTime() + IDEMPOTENCY_TTL_MS).toISOString();

  let existing = await findIdempotencyRecord({ key, path, userId });
  if (existing) {
    if (existing.bodyHash !== bodyHash) {
      throw createAppError({
        code: "IDEMPOTENT_REPLAY",
        status: 409,
        message: "Idempotency-Key already used with different payload",
        expose: true,
      });
    }
    if (existing.resultSnapshot && typeof existing.resultSnapshot === "object") {
      return existing.resultSnapshot;
    }
    throw createAppError({
      code: "IDEMPOTENT_REPLAY",
      status: 409,
      message: "Duplicated request is still processing",
      expose: true,
    });
  }

  let recordId = null;
  try {
    recordId = await createIdempotencyRecord({
      key,
      path,
      userId,
      bodyHash,
      status: "pending",
      createdAt: nowIso,
      updatedAt: nowIso,
      expiredAt: expiredAtIso,
    });
  } catch (err) {
    // If concurrent request inserts same key first, fallback to replay check.
    const msg = err && err.message ? String(err.message) : "";
    if (/DuplicateKey|dup key|E11000/i.test(msg)) {
      existing = await findIdempotencyRecord({ key, path, userId });
      if (existing && existing.bodyHash === bodyHash && existing.resultSnapshot) {
        return existing.resultSnapshot;
      }
      throw createAppError({
        code: "IDEMPOTENT_REPLAY",
        status: 409,
        message: "Duplicated request is still processing",
        expose: true,
      });
    }
    throw err;
  }

  const result = await execute();
  if (recordId) {
    await updateIdempotencyRecord(recordId, {
      status: "done",
      resultSnapshot: result,
      updatedAt: new Date().toISOString(),
    });
  }
  return result;
};

const runIdempotentIfPresent = async ({ ctx, path, userId, payload, execute }) => {
  if (!hasIdempotencyKey(ctx)) {
    return execute();
  }
  return runIdempotent({ ctx, path, userId, payload, execute });
};

module.exports = {
  runIdempotent,
  runIdempotentIfPresent,
  requireIdempotencyKey,
  hasIdempotencyKey,
};
