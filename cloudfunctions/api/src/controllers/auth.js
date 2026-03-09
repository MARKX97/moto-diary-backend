const { randomUUID } = require("crypto");
const { resolveWechatIdentity } = require("../services/wechat-auth");
const { signJwt } = require("../utils/jwt");

const signAccessToken = (payload) =>
  signJwt(payload, process.env.JWT_SECRET || "dev-secret", 2 * 60 * 60);
const signRefreshToken = () => randomUUID();

const loginController = async (ctx) => {
  const { code } = ctx.data;
  const identity = await resolveWechatIdentity(code);
  const userId = randomUUID();
  const accessToken = signAccessToken({ sub: userId, openid: identity.openid, role: "user" });
  const refreshToken = signRefreshToken();

  return {
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        openid: identity.openid,
        nickname: "TBD",
        avatar: "",
        role: "user",
        createdAt: new Date().toISOString(),
      },
    },
  };
};

module.exports = { loginController };
