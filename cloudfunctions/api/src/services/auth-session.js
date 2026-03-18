const crypto = require("crypto");
const { randomUUID } = require("crypto");
const { signJwt } = require("../utils/jwt");
const { createAppError } = require("../utils/app-error");

const refreshSessions = new Map();
const revokedAccessTokens = new Map();

const nowMs = () => Date.now();

const toPositiveInt = (value, fallback) => {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return fallback;
  return num;
};

const accessTokenTtlSec = () => toPositiveInt(process.env.ACCESS_TOKEN_TTL_SEC, 2 * 60 * 60);
const refreshTokenTtlSec = () => toPositiveInt(process.env.REFRESH_TOKEN_TTL_SEC, 30 * 24 * 60 * 60);

const jwtSecret = () => process.env.JWT_SECRET || "dev-secret";

const hashToken = (token) => crypto.createHash("sha256").update(String(token || "")).digest("hex");

const buildUserId = (openid) => {
  const digest = crypto.createHash("sha256").update(String(openid || "")).digest("hex");
  return `u_${digest.slice(0, 24)}`;
};

const cleanupExpired = () => {
  const now = nowMs();
  for (const [key, value] of refreshSessions.entries()) {
    if (!value || value.expiresAt <= now) {
      refreshSessions.delete(key);
    }
  }
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

const issueLoginTokens = (identity) => {
  cleanupExpired();
  cleanupRevokedAccessTokens();
  const claims = buildSessionFromIdentity(identity);
  const refreshToken = randomUUID();
  const expiresAt = nowMs() + refreshTokenTtlSec() * 1000;
  refreshSessions.set(hashToken(refreshToken), { claims, expiresAt });
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

const rotateRefreshToken = (refreshToken) => {
  cleanupExpired();
  cleanupRevokedAccessTokens();
  const key = hashToken(refreshToken);
  const existing = refreshSessions.get(key);
  if (!existing) {
    throw createAppError({
      code: "AUTH_REQUIRED",
      status: 401,
      message: "Authorization required",
      expose: true,
    });
  }
  if (existing.expiresAt <= nowMs()) {
    refreshSessions.delete(key);
    throw createAppError({
      code: "AUTH_REQUIRED",
      status: 401,
      message: "Authorization required",
      expose: true,
    });
  }

  const nextRefreshToken = randomUUID();
  const nextExpiresAt = nowMs() + refreshTokenTtlSec() * 1000;
  refreshSessions.delete(key);
  refreshSessions.set(hashToken(nextRefreshToken), { claims: existing.claims, expiresAt: nextExpiresAt });

  const { accessToken } = buildAccessToken(existing.claims);
  return {
    accessToken,
    refreshToken: nextRefreshToken,
  };
};

const revokeAccessToken = (payload) => {
  cleanupRevokedAccessTokens();
  const jti = payload && payload.jti;
  const exp = payload && payload.exp;
  if (!jti || !Number.isFinite(exp)) return;
  revokedAccessTokens.set(String(jti), Number(exp) * 1000);
};

const isAccessTokenRevoked = (payload) => {
  cleanupRevokedAccessTokens();
  const jti = payload && payload.jti;
  if (!jti) return false;
  const expiresAt = revokedAccessTokens.get(String(jti));
  if (!expiresAt) return false;
  if (expiresAt <= nowMs()) {
    revokedAccessTokens.delete(String(jti));
    return false;
  }
  return true;
};

const revokeRefreshSessionsByUserId = (userId) => {
  if (!userId) return;
  cleanupExpired();
  for (const [key, value] of refreshSessions.entries()) {
    if (value && value.claims && value.claims.sub === userId) {
      refreshSessions.delete(key);
    }
  }
};

module.exports = {
  issueLoginTokens,
  rotateRefreshToken,
  revokeAccessToken,
  isAccessTokenRevoked,
  revokeRefreshSessionsByUserId,
};
