const jwt = require("jsonwebtoken");

const AUTH_ERROR = { code: "AUTH_REQUIRED", status: 401, message: "Authorization required" };

const authMiddleware = async (ctx, next) => {
  const token = extractToken(ctx);
  if (!token) {
    throw AUTH_ERROR;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
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
  const headers = (ctx.event && ctx.event.headers) || {};
  const auth = headers.Authorization || headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
};

module.exports = { authMiddleware };
