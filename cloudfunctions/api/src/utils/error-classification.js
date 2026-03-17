const DEFAULT_CATEGORY = "internal";
const DEFAULT_SEVERITY = "error";

const CODE_CATEGORY_MAP = {
  VALIDATION_FAILED: "validation",
  AUTH_REQUIRED: "auth",
  FORBIDDEN: "permission",
  NOT_FOUND: "not_found",
  RATE_LIMITED: "rate_limit",
  IDEMPOTENT_REPLAY: "idempotency",
  DEPENDENCY_ERROR: "dependency",
  INTERNAL_ERROR: "internal",
};

const resolveStatusFamily = (status) => {
  if (!Number.isFinite(status)) return "unknown";
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  if (status >= 200) return "2xx";
  if (status >= 100) return "1xx";
  return "unknown";
};

const resolveSeverity = (status, code) => {
  if (status >= 500) return "error";
  if (code === "RATE_LIMITED" || code === "IDEMPOTENT_REPLAY") return "info";
  if (status >= 400) return "warning";
  return DEFAULT_SEVERITY;
};

const classifyError = (error) => {
  const code = error && error.code ? String(error.code) : "INTERNAL_ERROR";
  const status = Number(error && error.status);
  const statusFamily = resolveStatusFamily(status);
  const category = CODE_CATEGORY_MAP[code] || (status >= 500 ? "internal" : DEFAULT_CATEGORY);
  const severity = resolveSeverity(status, code);

  return {
    code,
    status,
    statusFamily,
    category,
    severity,
  };
};

module.exports = {
  classifyError,
};
