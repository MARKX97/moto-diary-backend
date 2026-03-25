const { resolveWechatIdentity } = require("../services/wechat-auth");
const {
  issueLoginTokens,
  rotateRefreshToken,
  revokeAccessToken,
  revokeRefreshSessionsByUserId,
} = require("../services/auth-session");
const { ensureUserForLogin } = require("../services/users");
const { ensureLoginRateLimit } = require("../services/access-control");
const { extractToken } = require("../middlewares/auth");
const { createAppError } = require("../utils/app-error");

const resolveRefreshToken = (ctx) => {
  const tokenFromBody = ctx.data && ctx.data.refreshToken;
  if (typeof tokenFromBody === "string" && tokenFromBody.trim()) {
    return tokenFromBody.trim();
  }
  // Backward compatibility: if some clients still send refresh token in Authorization.
  const tokenFromHeader = extractToken(ctx);
  if (tokenFromHeader) return tokenFromHeader;
  throw createAppError({
    code: "VALIDATION_FAILED",
    status: 400,
    message: "refreshToken is required",
    expose: true,
  });
};

const loginController = async (ctx) => {
  await ensureLoginRateLimit(ctx);
  const { code } = ctx.data;
  const identity = await resolveWechatIdentity(code);
  const session = await issueLoginTokens(identity);
  const user = await ensureUserForLogin({
    userId: session.user.id,
    openid: session.user.openid,
    role: session.user.role,
  });

  return {
    success: true,
    data: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user,
    },
  };
};

const refreshTokenController = async (ctx) => {
  const refreshToken = resolveRefreshToken(ctx);
  const nextTokens = await rotateRefreshToken(refreshToken);
  return {
    success: true,
    data: nextTokens,
  };
};

const logoutController = async (ctx) => {
  const user = ctx.state && ctx.state.user;
  const auth = ctx.state && ctx.state.auth;
  await Promise.all([
    revokeAccessToken(auth && auth.payload),
    revokeRefreshSessionsByUserId(user && user.id),
  ]);
  return {
    success: true,
    data: {
      loggedOut: true,
    },
  };
};

module.exports = { loginController, refreshTokenController, logoutController };
