const { verifyJwt } = require("../utils/jwt");
const { createAppError } = require("../utils/app-error");
const { isAccessTokenRevoked } = require("../services/auth-session");

const AUTH_ERROR = createAppError({
  code: "AUTH_REQUIRED",
  status: 401,
  message: "Authorization required",
  expose: true,
});

const resolveJwtSecret = () => {
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

const authMiddleware = async (ctx, next) => {
  const attached = await attachUserFromToken(ctx);
  if (!attached) {
    throw AUTH_ERROR;
  }
  await next();
};

const attachUserFromToken = async (ctx) => {
  const token = extractToken(ctx);
  if (!token) {
    return false;
  }
  try {
    const payload = verifyJwt(token, resolveJwtSecret());
    if (await isAccessTokenRevoked(payload)) {
      throw AUTH_ERROR;
    }
    ctx.state.user = {
      id: payload.sub,
      role: payload.role || "user",
      openid: payload.openid,
    };
    ctx.state.auth = {
      token,
      payload,
    };
    return true;
  } catch (err) {
    if (err && err.code === "INTERNAL_ERROR") {
      throw err;
    }
    throw AUTH_ERROR;
  }
};

const extractToken = (ctx) => {
  const event = ctx.event || {};
  const headers = event.headers || event.header || {};

  const candidates = [
    headers.Authorization,
    headers.authorization,
    event.Authorization,
    event.authorization,
    event.authToken,
    event.token,
    event.data && event.data.Authorization,
    event.data && event.data.authorization,
    event.data && event.data.authToken,
    event.data && event.data.token,
  ].filter(Boolean);

  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    if (raw.startsWith("Bearer ")) return raw.slice("Bearer ".length);
  }

  return null;
};

module.exports = { authMiddleware, extractToken, attachUserFromToken };
