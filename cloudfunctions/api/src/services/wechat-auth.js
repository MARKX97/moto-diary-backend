const crypto = require("crypto");
const https = require("https");
const { createAppError } = require("../utils/app-error");

const DEFAULT_TIMEOUT_MS = Number(process.env.WECHAT_API_TIMEOUT_MS || 2500);

const isLocalFallbackEnabled = () =>
  process.env.ALLOW_LOCAL_LOGIN_FALLBACK === "true" && process.env.IS_LOCAL_DEV === "true";

const buildLocalOpenId = (code) => {
  const digest = crypto.createHash("sha256").update(String(code || "")).digest("hex");
  return `local_${digest.slice(0, 24)}`;
};

const requestJson = (url, timeoutMs) =>
  new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let raw = "";
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(raw || "{}"));
        } catch (_err) {
          reject(
            createAppError({
              code: "DEPENDENCY_ERROR",
              status: 502,
              message: "Invalid jscode2session response",
              expose: true,
            })
          );
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("jscode2session timeout"));
    });
    req.on("error", (err) => {
      reject(
        createAppError({
          code: "DEPENDENCY_ERROR",
          status: 502,
          message: err.message || "jscode2session failed",
          expose: true,
        })
      );
    });
  });

const callJsCode2Session = async (code) => {
  const appid = process.env.WECHAT_APPID;
  const secret = process.env.WECHAT_SECRET;

  if (!appid || !secret) {
    throw createAppError({
      code: "INTERNAL_ERROR",
      status: 500,
      message: "Missing WECHAT_APPID or WECHAT_SECRET",
      expose: false,
    });
  }

  const endpoint =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

  const data = await requestJson(endpoint, DEFAULT_TIMEOUT_MS);
  if (data.errcode) {
    throw createAppError({
      code: "DEPENDENCY_ERROR",
      status: 502,
      message: `jscode2session failed: ${data.errmsg || "unknown"} (${data.errcode})`,
      expose: true,
    });
  }
  if (!data.openid) {
    throw createAppError({
      code: "DEPENDENCY_ERROR",
      status: 502,
      message: "jscode2session returned empty openid",
      expose: true,
    });
  }
  return data;
};

const resolveWechatIdentity = async (code) => {
  try {
    const data = await callJsCode2Session(code);
    return {
      openid: data.openid,
      unionid: data.unionid,
      sessionKey: data.session_key,
      source: "wechat",
    };
  } catch (err) {
    if (isLocalFallbackEnabled()) {
      return {
        openid: buildLocalOpenId(code),
        source: "local-fallback",
      };
    }
    throw err;
  }
};

module.exports = {
  resolveWechatIdentity,
};
