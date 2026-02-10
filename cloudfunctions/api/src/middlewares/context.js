const { logger } = require("../utils/logger");

const attachContext = ({ cloud, context }) => async (ctx, next) => {
  ctx.state = {
    cloud,
    context,
    requestId: context && context.requestId,
    user: null,
    log: logger,
  };
  await next();
};

module.exports = { attachContext };
