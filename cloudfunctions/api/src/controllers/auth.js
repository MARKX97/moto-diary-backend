const jwt = require("jsonwebtoken");
const { v4: uuid } = require("uuid");

const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET || "dev-secret", { expiresIn: "2h" });
const signRefreshToken = (payload) => uuid();

const loginController = async (ctx) => {
  const { code } = ctx.data;
  // TODO: use wx jscode2session; here仅占位
  const wxContext = ctx.state.cloud.getWXContext();
  const userId = uuid();
  const accessToken = signAccessToken({ sub: userId, openid: wxContext.OPENID, role: "user" });
  const refreshToken = signRefreshToken({ sub: userId });

  return {
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        openid: wxContext.OPENID || "mock-openid",
        nickname: "TBD",
        avatar: "",
        role: "user",
        createdAt: new Date().toISOString(),
      },
    },
  };
};

module.exports = { loginController };
