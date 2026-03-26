const crypto = require("crypto");
const { randomUUID } = require("crypto");
const { signJwt } = require("../utils/jwt");
const { createAppError } = require("../utils/app-error");
const {
  findRefreshSessionByHash,
  createRefreshSession,
  markRefreshSessionStatusById,
  markRefreshSessionRotatedIfActive,
  revokeRefreshSessionsByUserId: revokeRefreshSessionsByUserIdInDb,
  findRevokedAccessTokenByJti,
  upsertRevokedAccessToken,
} = require("../repositories/auth-sessions");

const revokedAccessTokens = new Map();

const nowMs = () => Date.now();

const toPositiveInt = (value, fallback) => {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return fallback;
  return num;
};

const accessTokenTtlSec = () => toPositiveInt(process.env.ACCESS_TOKEN_TTL_SEC, 2 * 60 * 60);
const refreshTokenTtlSec = () => toPositiveInt(process.env.REFRESH_TOKEN_TTL_SEC, 30 * 24 * 60 * 60);

const jwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (typeof secret === "string" && secret.trim()) {
    return secret.trim();
  }
  if (process.env.IS_LOCAL_DEV === "true") {
    return "dev-secret";
  }
  throw createAppError({
    code: "INTERNAL_ERROR",
    status: 500,
    message: "Missing JWT_SECRET",
    expose: false,
  });
};

const hashToken = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");

const buildUserId = (openid) => {
  const digest = crypto.createHash("sha256").update(String(openid || "")).digest("hex");
  return `u_${digest.slice(0, 24)}`;
};

const cleanupRevokedAccessTokens = () => {
  const now = nowMs();
  for (const [jti, expiresAt] of revokedAccessTokens.entries()) {
    if (!expiresAt || expiresAt <= now) {
      revokedAccessTokens.delete(jti);
    }
  }
};

const buildAccessClaims = (claims) => ({
  ...claims,
  jti: randomUUID(),
});

const buildAccessToken = (claims) => {
  const accessClaims = buildAccessClaims(claims);
  return {
    accessToken: signJwt(accessClaims, jwtSecret(), accessTokenTtlSec()),
    accessClaims,
  };
};

const buildSessionFromIdentity = (identity) => {
  const openid = String(identity && identity.openid ? identity.openid : "");
  return {
    sub: buildUserId(openid),
    openid,
    role: "user",
  };
};

const authRequiredError = () =>
  createAppError({
    code: "AUTH_REQUIRED",
    status: 401,
    message: "Authorization required",
    expose: true,
  });

const issueLoginTokens = async (identity) => {
  cleanupRevokedAccessTokens();
  const claims = buildSessionFromIdentity(identity);
  const refreshToken = randomUUID();
  const expiresAtMs = nowMs() + refreshTokenTtlSec() * 1000;
  await createRefreshSession({
    tokenHash: hashToken(refreshToken),
    userId: claims.sub,
    claims,
    expiresAt: new Date(expiresAtMs).toISOString(),
  });
  const { accessToken } = buildAccessToken(claims);

  return {
    accessToken,
    refreshToken,
    user: {
      id: claims.sub,
      openid: claims.openid,
      nickname: "TBD",
      avatar: "",
      role: claims.role,
      createdAt: new Date().toISOString(),
    },
  };
};

const rotateRefreshToken = async (refreshToken) => {
  cleanupRevokedAccessTokens();
  const key = hashToken(refreshToken);
  const existing = await findRefreshSessionByHash(key);
  if (!existing || existing.status !== "active") {
    throw authRequiredError();
  }
  const existingExpiresAt = new Date(existing.expiresAt || "").getTime();
  if (!Number.isFinite(existingExpiresAt) || existingExpiresAt <= nowMs()) {
    if (existing._id) {
      await markRefreshSessionStatusById(existing._id, "expired");
    }
    throw authRequiredError();
  }

  const nextRefreshToken = randomUUID();
  const nextTokenHash = hashToken(nextRefreshToken);
  const nextExpiresAt = new Date(nowMs() + refreshTokenTtlSec() * 1000).toISOString();
  const nextRecordId = await createRefreshSession({
    tokenHash: nextTokenHash,
    userId: existing.userId || (existing.claims && existing.claims.sub) || "",
    claims: existing.claims || {},
    expiresAt: nextExpiresAt,
  });
  const rotated = await markRefreshSessionRotatedIfActive({
    id: existing._id,
    updatedAt: existing.updatedAt,
    rotatedTo: nextTokenHash,
  });
  if (!rotated) {
    if (nextRecordId) {
      await markRefreshSessionStatusById(nextRecordId, "revoked", {
        revokeReason: "rotate_conflict",
      });
    }
    throw authRequiredError();
  }

  const { accessToken } = buildAccessToken(existing.claims);
  return {
    accessToken,
    refreshToken: nextRefreshToken,
  };
};

const revokeAccessToken = async (payload) => {
  cleanupRevokedAccessTokens();
  const jti = payload && payload.jti;
  const exp = payload && payload.exp;
  if (!jti || !Number.isFinite(exp)) return;
  const expiresAtMs = Number(exp) * 1000;
  revokedAccessTokens.set(String(jti), expiresAtMs);
  await upsertRevokedAccessToken({
    jti: String(jti),
    expiresAt: new Date(expiresAtMs).toISOString(),
  });
};

const isAccessTokenRevoked = async (payload) => {
  cleanupRevokedAccessTokens();
  const jti = payload && payload.jti;
  if (!jti) return false;
  const key = String(jti);
  const cachedExpiresAt = revokedAccessTokens.get(key);
  if (cachedExpiresAt && cachedExpiresAt > nowMs()) {
    return true;
  }
  if (cachedExpiresAt && cachedExpiresAt <= nowMs()) {
    revokedAccessTokens.delete(key);
  }

  const record = await findRevokedAccessTokenByJti(key);
  if (!record) return false;
  const expiresAt = new Date(record.expiresAt || "").getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs()) {
    revokedAccessTokens.delete(String(jti));
    return false;
  }
  revokedAccessTokens.set(key, expiresAt);
  return true;
};

const revokeRefreshSessionsByUserId = async (userId) => {
  if (!userId) return 0;
  return revokeRefreshSessionsByUserIdInDb(userId);
};

module.exports = {
  issueLoginTokens,
  rotateRefreshToken,
  revokeAccessToken,
  isAccessTokenRevoked,
  revokeRefreshSessionsByUserId,
};
