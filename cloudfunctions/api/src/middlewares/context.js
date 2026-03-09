const { logger } = require("../utils/logger");

const attachContext = ({ context }) => async (ctx, next) => {
  ctx.state = {
    context,
    requestId: context && context.requestId,
    user: null,
    log: logger,
  };
  await next();
};

module.exports = { attachContext };
