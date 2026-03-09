const { parsePayload } = require("../utils/payload");

const validate = (ctx, schema) => {
  const payload = parsePayload(ctx.event);
  const result = schema(payload);
  ctx.data = result;
};

module.exports = { validate };
