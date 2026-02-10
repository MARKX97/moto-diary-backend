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
  return data;
};

module.exports = { parsePayload };
