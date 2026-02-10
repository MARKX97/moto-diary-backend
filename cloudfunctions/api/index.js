const cloud = require("wx-server-sdk");
const TcbRouter = require("tcb-router");
const { withErrorHandling } = require("./src/middlewares/error");
const { attachContext } = require("./src/middlewares/context");
const { authMiddleware } = require("./src/middlewares/auth");
const { validate } = require("./src/middlewares/validate");
const { loginSchema, itemListSchema } = require("./src/schemas");
const { loginController } = require("./src/controllers/auth");
const { listItemsController } = require("./src/controllers/items");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 云函数入口
exports.main = async (event, context) => {
  const app = new TcbRouter({ event });

  // 全局中间件：日志/错误处理/上下文注入
  app.use(withErrorHandling);
  app.use(attachContext({ cloud, context }));

  // 健康检查
  app.router("health", async (ctx) => {
    ctx.body = { success: true, data: { now: Date.now() } };
  });

  // 登录
  app.router("login", async (ctx) => {
    validate(ctx, loginSchema);
    ctx.body = await loginController(ctx);
  });

  // 受保护路由
  app.use(authMiddleware);

  app.router("items.list", async (ctx) => {
    validate(ctx, itemListSchema);
    ctx.body = await listItemsController(ctx);
  });

  return app.serve();
};
