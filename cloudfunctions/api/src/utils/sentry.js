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
const SCOPE_OPTION_KEYS = new Set(["user", "tags", "extras", "contexts", "level", "fingerprint"]);

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

const toScopeOptions = (input) => {
  if (!input || typeof input !== "object") return {};
  const keys = Object.keys(input);
  const hasScopeOption = keys.some((key) => SCOPE_OPTION_KEYS.has(key));
  if (hasScopeOption) return input;
  // 兼容旧调用：captureException(err, { requestId, route, ... })
  return { extras: input };
};

const applyScope = (scope, options = {}) => {
  if (options.level) {
    scope.setLevel(options.level);
  }
  if (Array.isArray(options.fingerprint) && options.fingerprint.length) {
    scope.setFingerprint(options.fingerprint);
  }
  if (options.user && typeof options.user === "object") {
    scope.setUser(options.user);
  }
  if (options.tags && typeof options.tags === "object") {
    Object.entries(options.tags).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        scope.setTag(key, String(value));
      }
    });
  }
  if (options.extras && typeof options.extras === "object") {
    Object.entries(options.extras).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });
  }
  if (options.contexts && typeof options.contexts === "object") {
    Object.entries(options.contexts).forEach(([key, value]) => {
      if (value && typeof value === "object") {
        scope.setContext(key, value);
      }
    });
  }
};

const flushIfNeeded = async (Sentry) => {
  try {
    await Sentry.flush(1500);
  } catch (_err) {
    // ignore flush errors
  }
};

const captureException = async (error, context = {}) => {
  const Sentry = getSentry();
  if (!Sentry) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const options = toScopeOptions(context);
  Sentry.withScope((scope) => {
    applyScope(scope, options);
    Sentry.captureException(err);
  });
  await flushIfNeeded(Sentry);
};

const captureMessage = async (message, options = {}) => {
  const Sentry = getSentry();
  if (!Sentry) return;

  const text = String(message || "");
  if (!text) return;

  const scopeOptions = toScopeOptions(options);
  Sentry.withScope((scope) => {
    applyScope(scope, scopeOptions);
    Sentry.captureMessage(text, scopeOptions.level || "error");
  });
  await flushIfNeeded(Sentry);
};

const setUser = (scopeOptions = {}, user = null) => {
  const options = toScopeOptions(scopeOptions);
  return {
    ...options,
    user,
  };
};

const setTag = (scopeOptions = {}, key, value) => {
  if (!key) return toScopeOptions(scopeOptions);
  const options = toScopeOptions(scopeOptions);
  return {
    ...options,
    tags: {
      ...(options.tags || {}),
      [key]: value,
    },
  };
};

const setContext = (scopeOptions = {}, key, value) => {
  if (!key || !value || typeof value !== "object") return toScopeOptions(scopeOptions);
  const options = toScopeOptions(scopeOptions);
  return {
    ...options,
    contexts: {
      ...(options.contexts || {}),
      [key]: value,
    },
  };
};

module.exports = {
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  isSentryEnabled: isEnabled,
};
