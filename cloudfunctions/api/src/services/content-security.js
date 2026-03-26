const https = require("https");
const { createAppError } = require("../utils/app-error");

const REQUEST_TIMEOUT_MS = Number(process.env.CONTENT_SECURE_TIMEOUT_MS || 2000);

let cachedAccessToken = null;
let cachedAccessTokenExpireAt = 0;

const httpGetJson = (url, timeoutMs) =>
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
          reject(new Error("content security api invalid json"));
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("content security api timeout")));
    req.on("error", reject);
  });

const httpPostJson = (url, body, timeoutMs) =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw || "{}"));
          } catch (_err) {
            reject(new Error("content security api invalid json"));
          }
        });
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error("content security api timeout")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });

const isMsgSecCheckEnabled = () => process.env.CONTENT_SEC_CHECK_ENABLED === "true";

const getWechatAccessToken = async () => {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpireAt) {
    return cachedAccessToken;
  }
  const appid = process.env.WECHAT_APPID;
  const secret = process.env.WECHAT_SECRET;
  if (!appid || !secret) {
    throw new Error("Missing WECHAT_APPID or WECHAT_SECRET");
  }

  const url =
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}`;
  const data = await httpGetJson(url, REQUEST_TIMEOUT_MS);
  if (!data || !data.access_token) {
    throw new Error(`fetch access_token failed: ${data && data.errmsg ? data.errmsg : "unknown"}`);
  }
  cachedAccessToken = data.access_token;
  const expiresIn = Number.isFinite(data.expires_in) ? Number(data.expires_in) : 7200;
  cachedAccessTokenExpireAt = Date.now() + Math.max(60, expiresIn - 120) * 1000;
  return cachedAccessToken;
};

const checkTextByWechat = async (content) => {
  const token = await getWechatAccessToken();
  const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${encodeURIComponent(token)}`;
  const data = await httpPostJson(url, { content }, REQUEST_TIMEOUT_MS);

  if (!data || data.errcode === undefined) {
    throw new Error("msg_sec_check invalid response");
  }
  if (Number(data.errcode) !== 0) {
    throw createAppError({
      code: "DEPENDENCY_ERROR",
      status: 502,
      message: `content security rejected: ${data.errmsg || "unknown"} (${data.errcode})`,
      expose: true,
    });
  }
};

const ensureItemContentSafe = async ({ title, content }) => {
  if (!isMsgSecCheckEnabled()) return;
  const text = [title, content].filter(Boolean).join("\n").slice(0, 1500);
  if (!text) return;

  try {
    await checkTextByWechat(text);
  } catch (err) {
    if (err && err.code === "DEPENDENCY_ERROR") {
      throw err;
    }
    throw createAppError({
      code: "DEPENDENCY_ERROR",
      status: 502,
      message: err && err.message ? err.message : "content security check failed",
      expose: true,
    });
  }
};

module.exports = {
  ensureItemContentSafe,
};
