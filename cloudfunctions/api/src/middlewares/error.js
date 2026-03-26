const { logger } = require("../utils/logger");
const { captureException, captureMessage, isSentryEnabled } = require("../utils/sentry");
const { toAppError } = require("../utils/app-error");
const { classifyError } = require("../utils/error-classification");
const { resolveClientErrorMessage } = require("../utils/client-error-message");

const buildClientError = (error, requestId) => {
  const payload = {
    code: error.code,
    message: resolveClientErrorMessage(error),
    status: error.status,
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
    const meta = classifyError(appError);

    let sentryEventId;
    if (isSentryEnabled()) {
      const sentryScope = {
        level: meta.severity,
        fingerprint: [
          "api-error",
          meta.code,
          route || "unknown_route",
          method || "unknown_method",
        ],
        tags: {
          code: meta.code,
          category: meta.category,
          status_family: meta.statusFamily,
          method,
          route: route || "unknown",
        },
        extras: {
          requestId,
          route,
          userId,
          status: meta.status,
          errorMessage: appError.message,
          expose: appError.expose,
          details: appError.details,
        },
      };

      if (meta.status >= 500) {
        sentryEventId = await captureException(appError, sentryScope);
      } else if (meta.status >= 400) {
        sentryEventId = await captureMessage(
          `[${meta.code}] ${appError.message || "Client error"}`,
          sentryScope
        );
      }
    }
    const logMeta = {
      requestId,
      route,
      method,
      userId,
      code: meta.code,
      status: meta.status,
      category: meta.category,
      statusFamily: meta.statusFamily,
      severity: meta.severity,
      sentryEventId,
      rawErrorName: err && err.name ? err.name : undefined,
      rawErrorMessage: err && err.message ? err.message : String(err),
      rawErrorStack: err && err.stack ? err.stack : undefined,
    };
    if (meta.severity === "error") {
      logger.error(appError, logMeta);
    } else if (meta.severity === "warning") {
      logger.warn(appError.message, logMeta);
    } else {
      logger.info(appError.message, logMeta);
    }
    ctx.body = {
      success: false,
      error: buildClientError(appError, requestId),
    };
    ctx.status = appError.status;
  }
};

module.exports = { withErrorHandling };
