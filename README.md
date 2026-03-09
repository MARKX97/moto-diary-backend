# Moto Diary Backend

基于微信云开发（CloudBase）的后端仓库，当前采用：
- 云函数（`cloudfunctions/api`）
- 本地联调适配服务（`scripts/dev-server.js`）
- 车型目录导入脚本（`scripts/import-catalog.js`）

## 目录结构

- `cloudfunctions/api`：云函数 API 入口与业务代码
- `scripts/dev-server.js`：本地 HTTP 调试网关（不使用 mock）
- `scripts/import-catalog.js`：车型目录导入（按 `model_id` upsert）

## 环境要求

- Node.js 18+
- pnpm 10+
- 有权限的云开发环境（例如 `cloud1-xxxx`）
- CloudBase 密钥（本地导入脚本需要）

## 安装依赖

仓库根目录（导入脚本依赖）：

```bash
pnpm install
```

云函数目录（本地 API 网关会复用）：

```bash
pnpm --dir cloudfunctions/api install
```

## 本地联调（前端只切 baseURL）

1) 启动本地后端网关：

```bash
pnpm run dev:api
```

默认监听 `http://127.0.0.1:3100`。  
可选环境变量：
- `API_LOCAL_HOST`（默认 `127.0.0.1`）
- `API_LOCAL_PORT`（默认 `3100`）

2) 前端切换本地地址：
- `UNI_APP_API_ENV=local`
- `UNI_APP_BASE_URL_LOCAL=http://127.0.0.1:3100`

3) 当前已映射路由：
- `GET /api/v1/health`
- `POST /api/v1/login`
- `GET /api/v1/items`

新增云函数路由时，需要同步在 `scripts/dev-server.js` 增加映射。

## 免费套餐推荐接入（wx.cloud.callFunction）

如果云开发环境无法开启 HTTP 访问服务（例如 `OperationDenied.FreePackageDenied`），前端应改为直连云函数：

```js
wx.cloud.callFunction({
  name: "api",
  data: {
    $url: "api/v1/login", // 也支持 login
    code,
  },
});
```

受保护路由可通过 `data.headers.Authorization` 透传 JWT：

```js
wx.cloud.callFunction({
  name: "api",
  data: {
    $url: "api/v1/items",
    headers: { Authorization: `Bearer ${token}` },
    page: 1,
    pageSize: 10,
    sort: "hot",
  },
});
```

当前云函数已兼容两套 `$url`：
- 简写：`health` / `login` / `items.list`
- HTTP 风格：`api/v1/health` / `api/v1/login` / `api/v1/items`

## CI/CD（GitHub Actions）

已提供后端自动部署流水线：`.github/workflows/deploy.yml`

- 触发分支：
  - `main` -> 校验通过后部署到单一云开发环境
  - `workflow_dispatch` -> 可手动触发（仅在 `main` 分支会执行部署）
- 部署内容：`cloudfunctions/api`
- 主流程：
  - `verify`：安装依赖 + 语法检查
  - `deploy-main`：执行 `@cloudbase/cli` 部署

必需 Secrets（单环境）：
- `TCB_ENV_ID`
- `TCB_SECRET_ID`
- `TCB_SECRET_KEY`

说明：
- 当前策略为“仅 main 自动部署”，避免非发布分支触发线上覆盖。
- 若 secrets 未配置，`main` 部署阶段会直接失败并阻断发布。

## Sentry 错误上报（仅线上）

后端已接入 `@sentry/node`，在统一错误处理中自动上报异常。

启用条件（同时满足才会上报）：
- `SENTRY_ENABLED=true`
- `SENTRY_DSN` 已配置
- 非本地联调（`IS_LOCAL_DEV=true` 时强制不上报）

推荐在云函数 `api` 的运行时环境变量中配置：
- `SENTRY_ENABLED=true`
- `SENTRY_DSN=<your sentry dsn>`
- `APP_ENV=main`
- `SENTRY_RELEASE`（可选，建议填版本号或 commit）
- `SENTRY_TRACES_SAMPLE_RATE`（可选，默认 `0`）

本地 `pnpm run dev:api` 联调默认不触发上报，用于避免 dev 噪声数据进入 Sentry。

业务代码可直接复用封装：

```js
const { captureException, captureMessage, setUser, setTag, setContext } = require("./src/utils/sentry");

let scope = {};
scope = setTag(scope, "module", "items");
scope = setTag(scope, "action", "create");
scope = setUser(scope, { id: ctx.state.user && ctx.state.user.id });
scope = setContext(scope, "request", { requestId: ctx.state.requestId });

try {
  // business logic
} catch (err) {
  await captureException(err, scope);
  throw err;
}

await captureMessage("items list fallback", {
  level: "warning",
  tags: { module: "items" },
  extras: { reason: "cache_miss" },
});
```

## 车型目录导入（upsert）

推荐输入文件：`../crawler_output/vehicle_catalog_flat.json`

执行命令：

```bash
node scripts/import-catalog.js --env <TCB_ENV_ID> --file ../crawler_output/vehicle_catalog_flat.json
```

脚本行为：
- 自动创建 `vehicle_catalog` 集合（不存在时）
- 按 `model_id` upsert（存在更新，不存在插入）
- 输出 `inserted / updated / skipped` 统计

## 推荐索引

`vehicle_catalog`：
- `idx_brand_hotRank`：`brand` asc + `hotRank` asc
- `uniq_model_id`：`model_id` asc unique

## 常见问题

1) `dup key: { : null }`  
通常是历史脏数据导致根字段没有 `model_id`（例如旧结构 `data: {...}`）。  
处理：清空/重建 `vehicle_catalog` 后再导入。

2) 导入后字段被包在 `data` 下  
使用旧脚本写法导致。请使用当前仓库 `scripts/import-catalog.js`。

3) 本地服务起不来  
先执行 `pnpm --dir cloudfunctions/api install`，确保云函数依赖完整。

## 参考

- [微信云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
