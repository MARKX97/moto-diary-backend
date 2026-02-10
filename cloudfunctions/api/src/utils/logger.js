const { Logger } = require("@cloudbase/logger");

const baseLogger = new Logger({
  logLevel: process.env.LOG_LEVEL || "info",
});

const logger = {
  info: (msg, meta) => baseLogger.info(msg, meta),
  error: (err, meta) => baseLogger.error(err, meta),
  warn: (msg, meta) => baseLogger.warn(msg, meta),
};

module.exports = { logger };
