const jwt = require("jsonwebtoken");
const { v4: uuid } = require("uuid");
const { resolveWechatIdentity } = require("../services/wechat-auth");

const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET || "dev-secret", { expiresIn: "2h" });
const signRefreshToken = (payload) => uuid();

const loginController = async (ctx) => {
  const { code } = ctx.data;
  const identity = await resolveWechatIdentity(code);
  const userId = uuid();
  const accessToken = signAccessToken({ sub: userId, openid: identity.openid, role: "user" });
  const refreshToken = signRefreshToken({ sub: userId });

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
