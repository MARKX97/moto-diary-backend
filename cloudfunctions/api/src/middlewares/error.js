const { logger } = require("../utils/logger");
const { captureException, isSentryEnabled } = require("../utils/sentry");

const withErrorHandling = async (ctx, next) => {
  try {
    await next();
    if (!ctx.body) {
      ctx.body = { success: true };
    }
  } catch (err) {
    if (isSentryEnabled()) {
      await captureException(err, {
        requestId: ctx && ctx.state ? ctx.state.requestId : undefined,
        route: ctx && ctx.event ? ctx.event.$url || ctx.event.path : undefined,
        userId: ctx && ctx.state && ctx.state.user ? ctx.state.user.id : undefined,
      });
    }
    logger.error(err);
    const status = err.status || 500;
    const code = err.code || "INTERNAL_ERROR";
    ctx.body = {
      success: false,
      error: {
        code,
        message: err.message || "Internal error",
      },
    };
    ctx.status = status;
  }
};

module.exports = { withErrorHandling };
