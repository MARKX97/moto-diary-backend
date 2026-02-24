const stringifyMeta = (meta) => {
  if (!meta) return "";
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch (_err) {
    return " [meta_unserializable]";
  }
};

const logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}${stringifyMeta(meta)}`),
  error: (err, meta) => {
    const message = err instanceof Error ? err.stack || err.message : String(err);
    console.error(`[ERROR] ${message}${stringifyMeta(meta)}`);
  },
  warn: (msg, meta) => console.warn(`[WARN] ${msg}${stringifyMeta(meta)}`),
};

module.exports = { logger };
