const safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return JSON.stringify({ note: "meta_unserializable" });
  }
};

const print = (level, message, meta) => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta && typeof meta === "object" ? meta : {}),
  };
  const line = safeStringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};

const logger = {
  info: (msg, meta) => print("info", String(msg), meta),
  warn: (msg, meta) => print("warn", String(msg), meta),
  error: (err, meta) => {
    const isErr = err instanceof Error;
    print("error", isErr ? err.message : String(err), {
      ...(meta && typeof meta === "object" ? meta : {}),
      ...(isErr ? { errorName: err.name, stack: err.stack } : {}),
    });
  },
};

module.exports = { logger };
