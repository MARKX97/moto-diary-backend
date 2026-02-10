const { parsePayload } = require("../utils/payload");

const validate = (ctx, schema) => {
  const payload = parsePayload(ctx.event);
  const result = schema.parse(payload);
  ctx.data = result;
};

module.exports = { validate };
