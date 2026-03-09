const { resolveWechatIdentity } = require("../services/wechat-auth");
const { issueLoginTokens, rotateRefreshToken } = require("../services/auth-session");
const { ensureLoginRateLimit } = require("../services/access-control");
const { extractToken } = require("../middlewares/auth");
const { createAppError } = require("../utils/app-error");

const resolveRefreshToken = (ctx) => {
  const tokenFromHeader = extractToken(ctx);
  if (tokenFromHeader) return tokenFromHeader;
  const tokenFromBody = ctx.data && ctx.data.refreshToken;
  if (typeof tokenFromBody === "string" && tokenFromBody.trim()) {
    return tokenFromBody.trim();
  }
  throw createAppError({
    code: "AUTH_REQUIRED",
    status: 401,
    message: "Authorization required",
    expose: true,
  });
};

const loginController = async (ctx) => {
  ensureLoginRateLimit(ctx);
  const { code } = ctx.data;
  const identity = await resolveWechatIdentity(code);
  const session = issueLoginTokens(identity);

  return {
    success: true,
    data: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    },
  };
};

const refreshTokenController = async (ctx) => {
  const refreshToken = resolveRefreshToken(ctx);
  const nextTokens = rotateRefreshToken(refreshToken);
  return {
    success: true,
    data: nextTokens,
  };
};

module.exports = { loginController, refreshTokenController };
