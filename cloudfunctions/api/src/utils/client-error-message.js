const FRIENDLY_MESSAGE_BY_CODE = {
  AUTH_REQUIRED: "登录状态已失效，请重新登录",
  FORBIDDEN: "当前账号暂无权限执行该操作",
  NOT_FOUND: "请求的内容不存在或已被删除",
  VALIDATION_FAILED: "请求参数有误，请检查后重试",
  RATE_LIMITED: "请求过于频繁，请稍后再试",
  DEPENDENCY_ERROR: "服务暂时不可用，请稍后重试",
  INTERNAL_ERROR: "服务开小差了，请稍后再试",
};

const resolveClientErrorMessage = (error) => {
  const code = error && error.code ? String(error.code) : "";
  if (code && FRIENDLY_MESSAGE_BY_CODE[code]) {
    return FRIENDLY_MESSAGE_BY_CODE[code];
  }

  const status = Number(error && error.status);
  if (status >= 500) {
    return "服务开小差了，请稍后再试";
  }
  if (status >= 400) {
    return "请求暂时无法处理，请稍后重试";
  }
  return "请求处理失败，请稍后重试";
};

module.exports = {
  resolveClientErrorMessage,
};
