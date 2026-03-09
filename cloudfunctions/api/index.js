const { withErrorHandling } = require("./src/middlewares/error");
const { attachContext } = require("./src/middlewares/context");
const { authMiddleware } = require("./src/middlewares/auth");
const { validate } = require("./src/middlewares/validate");
const { loginSchema, itemListSchema } = require("./src/schemas");
const { loginController } = require("./src/controllers/auth");
const { listItemsController } = require("./src/controllers/items");

const normalizeRoute = (event = {}) => {
  const raw = String(event.$url || event.path || "").trim();
  if (!raw) return "";
  return raw.replace(/^\/+/, "");
};

const routeIn = (route, aliases) => aliases.includes(route);

const runRoute = async (ctx, route) => {
  if (routeIn(route, ["health", "api/v1/health"])) {
    ctx.body = { success: true, data: { now: Date.now() } };
    return;
  }

  if (routeIn(route, ["login", "api/v1/login"])) {
    validate(ctx, loginSchema);
    ctx.body = await loginController(ctx);
    return;
  }

  if (routeIn(route, ["items.list", "api/v1/items"])) {
    await authMiddleware(ctx, async () => {
      validate(ctx, itemListSchema);
      ctx.body = await listItemsController(ctx);
    });
    return;
  }

  throw { code: "NOT_FOUND", status: 404, message: `No route matched for ${route || "<empty>"}` };
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
