const crypto = require("crypto");
const { randomUUID } = require("crypto");
const { signJwt } = require("../utils/jwt");
const { createAppError } = require("../utils/app-error");

const refreshSessions = new Map();

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

const buildAccessToken = (claims) => signJwt(claims, jwtSecret(), accessTokenTtlSec());

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
  const claims = buildSessionFromIdentity(identity);
  const refreshToken = randomUUID();
  const expiresAt = nowMs() + refreshTokenTtlSec() * 1000;
  refreshSessions.set(hashToken(refreshToken), { claims, expiresAt });

  return {
    accessToken: buildAccessToken(claims),
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

  return {
    accessToken: buildAccessToken(existing.claims),
    refreshToken: nextRefreshToken,
  };
};

module.exports = {
  issueLoginTokens,
  rotateRefreshToken,
};
