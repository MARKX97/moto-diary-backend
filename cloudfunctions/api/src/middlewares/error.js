const { logger } = require("../utils/logger");
const { captureException, isSentryEnabled } = require("../utils/sentry");
const { toAppError } = require("../utils/app-error");

const buildClientError = (error, requestId) => {
  const payload = {
    code: error.code,
    message: error.expose ? error.message : "Internal error",
  };
  const details = {
    ...(error.details && typeof error.details === "object" ? error.details : {}),
    ...(requestId ? { requestId } : {}),
  };
  if (Object.keys(details).length) {
    payload.details = details;
  }
  return payload;
};

const withErrorHandling = async (ctx, next) => {
  try {
    await next();
    if (!ctx.body) {
      ctx.body = { success: true };
    }
  } catch (err) {
    const appError = toAppError(err, {
      code: "INTERNAL_ERROR",
      status: 500,
      message: "Internal error",
      expose: false,
    });
    const requestId = ctx && ctx.state ? ctx.state.requestId : undefined;
    const route = ctx && ctx.state ? ctx.state.route : undefined;
    const method = ctx && ctx.state ? ctx.state.method : undefined;
    const userId = ctx && ctx.state && ctx.state.user ? ctx.state.user.id : undefined;

    if (isSentryEnabled()) {
      await captureException(appError, {
        tags: {
          code: appError.code,
          method,
        },
        extras: {
          requestId,
          route,
          userId,
          status: appError.status,
        },
      });
    }
    logger.error(appError, {
      requestId,
      route,
      method,
      userId,
      code: appError.code,
      status: appError.status,
    });
    ctx.body = {
      success: false,
      error: buildClientError(appError, requestId),
    };
    ctx.status = appError.status;
  }
};

module.exports = { withErrorHandling };
