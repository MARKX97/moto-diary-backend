const RESERVED_EVENT_KEYS = new Set([
  "$url",
  "path",
  "httpMethod",
  "headers",
  "header",
  "queryStringParameters",
  "body",
  "requestContext",
  "isBase64Encoded",
  "version",
  "routeKey",
  "rawPath",
  "rawQueryString",
]);

const pickTopLevelPayload = (event = {}) => {
  const payload = {};
  Object.keys(event).forEach((key) => {
    if (!RESERVED_EVENT_KEYS.has(key)) {
      payload[key] = event[key];
    }
  });
  return payload;
};

const parsePayload = (event = {}) => {
  const data = {};
  if (event.queryStringParameters) {
    Object.assign(data, event.queryStringParameters);
  }
  if (event.body) {
    try {
      const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
      Object.assign(data, body);
    } catch (err) {
      throw { code: "VALIDATION_FAILED", message: "Invalid JSON body", status: 400 };
    }
  }
  // tcb-router 自定义参数 data
  if (event.data && typeof event.data === "object") {
    Object.assign(data, event.data);
  }
  // wx.cloud.callFunction 可直接在顶层透传业务字段
  Object.assign(data, pickTopLevelPayload(event));
  return data;
};

module.exports = { parsePayload };
