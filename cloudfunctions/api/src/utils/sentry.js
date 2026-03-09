const isLocalDev = () => process.env.IS_LOCAL_DEV === "true";

const isEnabled = () => {
  if (isLocalDev()) return false;
  if (process.env.SENTRY_ENABLED !== "true") return false;
  if (!process.env.SENTRY_DSN) return false;
  return true;
};

const getEnvironment = () => process.env.APP_ENV || process.env.NODE_ENV || "unknown";

let sentryClient = null;
let initTried = false;

const getSentry = () => {
  if (!isEnabled()) return null;
  if (sentryClient) return sentryClient;
  if (initTried) return null;

  initTried = true;
  try {
    // 延迟 require，避免本地未启用时对依赖产生硬要求。
    // eslint-disable-next-line global-require
    const Sentry = require("@sentry/node");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: getEnvironment(),
      release: process.env.SENTRY_RELEASE || undefined,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    });
    sentryClient = Sentry;
    return sentryClient;
  } catch (_err) {
    return null;
  }
};

const captureException = async (error, context = {}) => {
  const Sentry = getSentry();
  if (!Sentry) return;

  const err = error instanceof Error ? error : new Error(String(error));
  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });
    Sentry.captureException(err);
  });

  try {
    await Sentry.flush(1500);
  } catch (_err) {
    // ignore flush errors
  }
};

module.exports = {
  captureException,
  isSentryEnabled: isEnabled,
};
