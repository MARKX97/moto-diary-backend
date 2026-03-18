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
  vehicleCatalogListSchema,
  vehiclesListSchema,
  vehicleCreateSchema,
  vehicleIdSchema,
  vehicleUpdateSchema,
  fuelRecordsListSchema,
  fuelRecordCreateSchema,
  fuelRecordIdSchema,
  fuelRecordUpdateSchema,
} = require("./src/schemas");
const { loginController, refreshTokenController, logoutController } = require("./src/controllers/auth");
const {
  listItemsController,
  getItemDetailController,
  createItemController,
  updateItemController,
} = require("./src/controllers/items");
const { listVehicleCatalogController } = require("./src/controllers/vehicle-catalog");
const {
  listVehiclesController,
  createVehicleController,
  updateVehicleController,
  deleteVehicleController,
} = require("./src/controllers/vehicles");
const {
  listFuelRecordsController,
  createFuelRecordController,
  updateFuelRecordController,
  deleteFuelRecordController,
} = require("./src/controllers/fuel-records");
const { parsePayload } = require("./src/utils/payload");
const { createAppError } = require("./src/utils/app-error");
const { consumeAnonymousFeedQuota } = require("./src/services/access-control");

const normalizeRoute = (event = {}) => {
  const raw = String(event.$url || event.path || "").trim();
  if (!raw) return "";
  return raw.replace(/^\/+/, "");
};

const getMethod = (ctx) => String((ctx.state && ctx.state.method) || "").toUpperCase();
const isRouteMatch = (route, aliases = []) => aliases.includes(route);
const isMethodMatch = (method, expectedMethod) => !expectedMethod || method === expectedMethod;

const throwAuthRequired = () => {
  throw createAppError({
    code: "AUTH_REQUIRED",
    status: 401,
    message: "Authorization required",
    expose: true,
  });
};

const applyAuth = (ctx, mode) => {
  if (mode === "required") {
    if (!attachUserFromToken(ctx)) {
      throwAuthRequired();
    }
    return true;
  }
  if (mode === "optional") {
    return attachUserFromToken(ctx);
  }
  return true;
};

const runEntry = async (ctx, entry, params = {}) => {
  let hasUser = true;
  if (!entry.authAfterValidate) {
    hasUser = applyAuth(ctx, entry.auth);
  }

  if (entry.schema) {
    const rawPayload = entry.buildPayload ? entry.buildPayload(ctx, params) : undefined;
    validate(ctx, entry.schema, rawPayload);
  }

  if (entry.authAfterValidate) {
    hasUser = applyAuth(ctx, entry.auth);
  }

  if (entry.afterAuth) {
    await entry.afterAuth(ctx, params, hasUser);
  }

  if (entry.handle) {
    await entry.handle(ctx, params, hasUser);
    return;
  }
  ctx.body = await entry.controller(ctx);
};

const staticRouteTable = [
  {
    aliases: ["health", "api/v1/health"],
    handle: async (ctx) => {
      ctx.body = { success: true, data: { now: Date.now() } };
    },
  },
  {
    aliases: ["login", "api/v1/login"],
    schema: loginSchema,
    controller: loginController,
  },
  {
    aliases: ["token.refresh", "api/v1/token/refresh"],
    schema: refreshTokenSchema,
    controller: refreshTokenController,
  },
  {
    aliases: ["logout", "api/v1/logout"],
    method: "POST",
    auth: "required",
    controller: logoutController,
  },
  {
    aliases: ["items.list", "api/v1/items"],
    method: "GET",
    auth: "optional",
    authAfterValidate: true,
    schema: itemListSchema,
    afterAuth: async (ctx, _params, hasUser) => {
      if (!hasUser) {
        ctx.state.anonQuota = consumeAnonymousFeedQuota(ctx, ctx.data.pageSize);
      }
    },
    controller: listItemsController,
  },
  {
    aliases: ["items.create", "api/v1/items"],
    method: "POST",
    auth: "required",
    schema: itemCreateSchema,
    controller: createItemController,
  },
  {
    aliases: ["vehicle.catalog", "api/v1/vehicle-catalog"],
    method: "GET",
    schema: vehicleCatalogListSchema,
    controller: listVehicleCatalogController,
  },
  {
    aliases: ["vehicles.list", "api/v1/vehicles"],
    method: "GET",
    auth: "required",
    schema: vehiclesListSchema,
    controller: listVehiclesController,
  },
  {
    aliases: ["vehicles.create", "api/v1/vehicles"],
    method: "POST",
    auth: "required",
    schema: vehicleCreateSchema,
    controller: createVehicleController,
  },
  {
    aliases: ["fuel-records.list", "api/v1/fuel-records"],
    method: "GET",
    auth: "required",
    schema: fuelRecordsListSchema,
    controller: listFuelRecordsController,
  },
  {
    aliases: ["fuel-records.create", "api/v1/fuel-records"],
    method: "POST",
    auth: "required",
    schema: fuelRecordCreateSchema,
    controller: createFuelRecordController,
  },
  {
    aliases: ["items.detail"],
    method: "GET",
    auth: "optional",
    schema: itemDetailSchema,
    controller: getItemDetailController,
  },
  {
    aliases: ["items.update"],
    method: "PUT",
    auth: "required",
    schema: itemUpdateSchema,
    controller: updateItemController,
  },
  {
    aliases: ["vehicles.update"],
    method: "PUT",
    auth: "required",
    schema: vehicleUpdateSchema,
    controller: updateVehicleController,
  },
  {
    aliases: ["vehicles.delete"],
    method: "DELETE",
    auth: "required",
    schema: vehicleIdSchema,
    controller: deleteVehicleController,
  },
  {
    aliases: ["fuel-records.update"],
    method: "PATCH",
    auth: "required",
    schema: fuelRecordUpdateSchema,
    controller: updateFuelRecordController,
  },
  {
    aliases: ["fuel-records.delete"],
    method: "DELETE",
    auth: "required",
    schema: fuelRecordIdSchema,
    controller: deleteFuelRecordController,
  },
];

const pathRouteTable = [
  {
    pattern: /^api\/v1\/items\/([^/]+)$/,
    toParams: (match) => ({ id: decodeURIComponent(match[1]) }),
    handlers: [
      {
        method: "GET",
        auth: "optional",
        schema: itemDetailSchema,
        buildPayload: (_ctx, params) => ({ id: params.id }),
        controller: getItemDetailController,
      },
      {
        method: "PUT",
        auth: "required",
        schema: itemUpdateSchema,
        buildPayload: (ctx, params) => ({ ...parsePayload(ctx.event), id: params.id }),
        controller: updateItemController,
      },
    ],
  },
  {
    pattern: /^api\/v1\/vehicles\/([^/]+)$/,
    toParams: (match) => ({ id: decodeURIComponent(match[1]) }),
    handlers: [
      {
        method: "PUT",
        auth: "required",
        schema: vehicleUpdateSchema,
        buildPayload: (ctx, params) => ({ ...parsePayload(ctx.event), id: params.id }),
        controller: updateVehicleController,
      },
      {
        method: "DELETE",
        auth: "required",
        schema: vehicleIdSchema,
        buildPayload: (_ctx, params) => ({ id: params.id }),
        controller: deleteVehicleController,
      },
    ],
  },
  {
    pattern: /^api\/v1\/fuel-records\/([^/]+)$/,
    toParams: (match) => ({ id: decodeURIComponent(match[1]) }),
    handlers: [
      {
        method: "PATCH",
        auth: "required",
        schema: fuelRecordUpdateSchema,
        buildPayload: (ctx, params) => ({ ...parsePayload(ctx.event), id: params.id }),
        controller: updateFuelRecordController,
      },
      {
        method: "DELETE",
        auth: "required",
        schema: fuelRecordIdSchema,
        buildPayload: (_ctx, params) => ({ id: params.id }),
        controller: deleteFuelRecordController,
      },
    ],
  },
];

const runRoute = async (ctx, route) => {
  const method = getMethod(ctx);

  for (const entry of staticRouteTable) {
    if (!isRouteMatch(route, entry.aliases)) continue;
    if (!isMethodMatch(method, entry.method)) continue;
    await runEntry(ctx, entry);
    return;
  }

  for (const pathEntry of pathRouteTable) {
    const match = String(route || "").match(pathEntry.pattern);
    if (!match) continue;
    const handler = pathEntry.handlers.find((item) => isMethodMatch(method, item.method));
    if (!handler) continue;
    const params = pathEntry.toParams(match);
    await runEntry(ctx, handler, params);
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
