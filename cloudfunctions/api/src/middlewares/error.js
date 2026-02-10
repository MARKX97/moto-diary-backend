const { logger } = require("../utils/logger");

const withErrorHandling = async (ctx, next) => {
  try {
    await next();
    if (!ctx.body) {
      ctx.body = { success: true };
    }
  } catch (err) {
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
