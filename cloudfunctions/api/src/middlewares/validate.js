const { parsePayload } = require("../utils/payload");

const validate = (ctx, schema, rawPayload) => {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : parsePayload(ctx.event);
  const result = schema(payload);
  ctx.data = result;
};

module.exports = { validate };
