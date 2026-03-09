const { verifyJwt } = require("../utils/jwt");
const { createAppError } = require("../utils/app-error");

const AUTH_ERROR = createAppError({
  code: "AUTH_REQUIRED",
  status: 401,
  message: "Authorization required",
  expose: true,
});

const authMiddleware = async (ctx, next) => {
  const token = extractToken(ctx);
  if (!token) {
    throw AUTH_ERROR;
  }
  try {
    const payload = verifyJwt(token, process.env.JWT_SECRET || "dev-secret");
    ctx.state.user = {
      id: payload.sub,
      role: payload.role || "user",
      openid: payload.openid,
    };
  } catch (err) {
    throw AUTH_ERROR;
  }
  await next();
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

module.exports = { authMiddleware };
