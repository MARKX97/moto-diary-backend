const { logger } = require("../utils/logger");

const attachContext = ({ context }) => async (ctx, next) => {
  const event = ctx.event || {};
  ctx.state = {
    context,
    requestId: context && context.requestId,
    route: event.$url || event.path,
    method: event.httpMethod || event.method,
    user: null,
    log: logger,
  };
  await next();
};

module.exports = { attachContext };
