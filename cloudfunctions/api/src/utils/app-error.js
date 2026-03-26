class AppError extends Error {
  constructor({
    code = "INTERNAL_ERROR",
    status = 500,
    message = "Internal error",
    details,
    expose = status < 500,
  } = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.expose = Boolean(expose);
  }
}

const createAppError = (options) => new AppError(options);

const toAppError = (error, fallback = {}) => {
  if (error instanceof AppError) return error;
  if (error && typeof error === "object" && error.code && error.status) {
    return new AppError(error);
  }
  return new AppError(fallback);
};

module.exports = {
  AppError,
  createAppError,
  toAppError,
};
