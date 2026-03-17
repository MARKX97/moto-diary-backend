const { withErrorHandling } = require("./src/middlewares/error");
const { attachContext } = require("./src/middlewares/context");
const { attachUserFromToken } = require("./src/middlewares/auth");
const { validate } = require("./src/middlewares/validate");
const {
  loginSchema,
  refreshTokenSchema,
  itemListSchema,
  itemDetailSchema,
  itemCreateSchema,
  itemUpdateSchema,
} = require("./src/schemas");
const { loginController, refreshTokenController } = require("./src/controllers/auth");
const {
  listItemsController,
  getItemDetailController,
  createItemController,
  updateItemController,
} = require("./src/controllers/items");
const { parsePayload } = require("./src/utils/payload");
const { createAppError } = require("./src/utils/app-error");
const { consumeAnonymousFeedQuota } = require("./src/services/access-control");

const normalizeRoute = (event = {}) => {
  const raw = String(event.$url || event.path || "").trim();
  if (!raw) return "";
  return raw.replace(/^\/+/, "");
};

const routeIn = (route, aliases) => aliases.includes(route);
const extractItemIdFromRoute = (route) => {
  const match = String(route || "").match(/^api\/v1\/items\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};
const getMethod = (ctx) => String((ctx.state && ctx.state.method) || "").toUpperCase();

const runRoute = async (ctx, route) => {
  const method = getMethod(ctx);
  if (routeIn(route, ["health", "api/v1/health"])) {
    ctx.body = { success: true, data: { now: Date.now() } };
    return;
  }

  if (routeIn(route, ["login", "api/v1/login"])) {
    validate(ctx, loginSchema);
    ctx.body = await loginController(ctx);
    return;
  }

  if (routeIn(route, ["token.refresh", "api/v1/token/refresh"])) {
    validate(ctx, refreshTokenSchema);
    ctx.body = await refreshTokenController(ctx);
    return;
  }

  if (routeIn(route, ["items.list", "api/v1/items"]) && method === "GET") {
    validate(ctx, itemListSchema);
    const hasUser = attachUserFromToken(ctx);
    if (!hasUser) {
      ctx.state.anonQuota = consumeAnonymousFeedQuota(ctx, ctx.data.pageSize);
    }
    ctx.body = await listItemsController(ctx);
    return;
  }

  if (routeIn(route, ["items.create", "api/v1/items"]) && method === "POST") {
    if (!attachUserFromToken(ctx)) {
      throw createAppError({
        code: "AUTH_REQUIRED",
        status: 401,
        message: "Authorization required",
        expose: true,
      });
    }
    validate(ctx, itemCreateSchema);
    ctx.body = await createItemController(ctx);
    return;
  }

  const itemIdFromPath = extractItemIdFromRoute(route);
  if (itemIdFromPath) {
    attachUserFromToken(ctx);
    if (method === "GET") {
      validate(ctx, itemDetailSchema, { id: itemIdFromPath });
      ctx.body = await getItemDetailController(ctx);
      return;
    }
    if (method === "PUT") {
      if (!ctx.state.user) {
        throw createAppError({
          code: "AUTH_REQUIRED",
          status: 401,
          message: "Authorization required",
          expose: true,
        });
      }
      validate(ctx, itemUpdateSchema, { ...parsePayload(ctx.event), id: itemIdFromPath });
      ctx.body = await updateItemController(ctx);
      return;
    }
  }

  if (routeIn(route, ["items.detail"]) && method === "GET") {
    attachUserFromToken(ctx);
    validate(ctx, itemDetailSchema);
    ctx.body = await getItemDetailController(ctx);
    return;
  }

  if (routeIn(route, ["items.update"]) && method === "PUT") {
    if (!attachUserFromToken(ctx)) {
      throw createAppError({
        code: "AUTH_REQUIRED",
        status: 401,
        message: "Authorization required",
        expose: true,
      });
    }
    validate(ctx, itemUpdateSchema);
    ctx.body = await updateItemController(ctx);
    return;
  }

  throw createAppError({
    code: "NOT_FOUND",
    status: 404,
    message: `No route matched for ${route || "<empty>"}`,
    expose: true,
  });
};

exports.main = async (event, context) => {
  const ctx = {
    event: event || {},
    context: context || {},
    state: {},
    body: null,
    status: 200,
    data: null,
  };

  await withErrorHandling(ctx, async () => {
    await attachContext({ context })(ctx, async () => {
      const route = normalizeRoute(ctx.event);
      await runRoute(ctx, route);
    });
  });

  return ctx.body;
};
