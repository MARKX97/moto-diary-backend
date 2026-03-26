const crypto = require("crypto");

const hashText = (input) => crypto.createHash("sha256").update(String(input || "")).digest("hex").slice(0, 16);

const firstValue = (...values) => values.find((v) => typeof v === "string" && v.trim());

const pickHeaders = (event = {}) => event.headers || event.header || {};

const getClientId = (ctx = {}) => {
  const event = ctx.event || {};
  const context = ctx.context || {};
  const headers = pickHeaders(event);

  const openid = firstValue(context.OPENID, context.openid);
  if (openid) return `wx:${openid}`;

  const deviceId = firstValue(
    headers["x-device-id"],
    headers["X-Device-Id"],
    event.deviceId,
    event.device_id,
    event.data && (event.data.deviceId || event.data.device_id)
  );
  if (deviceId) return `dev:${deviceId}`;

  const forwardedFor = firstValue(headers["x-forwarded-for"], headers["X-Forwarded-For"]);
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : firstValue(headers["x-real-ip"], headers["X-Real-Ip"]);
  if (ip) return `ip:${ip}`;

  const ua = firstValue(headers["user-agent"], headers["User-Agent"]);
  if (ua) return `ua:${hashText(ua)}`;

  return "anonymous";
};

module.exports = {
  getClientId,
};
