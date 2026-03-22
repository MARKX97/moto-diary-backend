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

## 测试与契约

运行后端基础回归测试（schema 校验 + 幂等入口 + 契约一致性）：

```bash
pnpm test
```

机器可读接口契约：
- `docs/api-contract.v1.json`

说明：
- 契约中的 `alias` 与云函数路由表一一对应，`tests/api-contract.test.js` 会校验别名是否仍存在，避免文档与代码漂移。

## 本地联调（前端只切 baseURL）

1) 启动本地后端网关：

```bash
pnpm run dev:api
```

默认监听 `http://127.0.0.1:3100`。  
可选环境变量：
- `API_LOCAL_HOST`（默认 `127.0.0.1`）
- `API_LOCAL_PORT`（默认 `3100`）
- `ALLOW_LOCAL_LOGIN_FALLBACK=true`（本地联调允许 `login` 使用本地 openid 回退）
- `RATE_LIMITS_BACKEND`（`db|memory`，默认 `db`）
- `LOGIN_RATE_LIMIT_PER_HOUR`（默认 `30`）
- `ANON_FEED_QUOTA_PER_DAY`（默认 `10`）
- `ACCESS_TOKEN_TTL_SEC`（默认 `7200`）
- `REFRESH_TOKEN_TTL_SEC`（默认 `2592000`）

2) 前端切换本地地址：
- `UNI_APP_API_ENV=local`
- `UNI_APP_BASE_URL_LOCAL=http://127.0.0.1:3100`

3) 当前已映射路由：
- `GET /api/v1/health`
- `POST /api/v1/login`
- `POST /api/v1/token/refresh`
- `POST /api/v1/logout`
- `GET /api/v1/users/me`
- `PUT /api/v1/users/me/profile`
- `GET /api/v1/users/me/preferences`
- `PUT /api/v1/users/me/preferences`
- `GET /api/v1/posts`
- `POST /api/v1/posts`
- `GET /api/v1/posts/:id`
- `PUT /api/v1/posts/:id`
- `DELETE /api/v1/posts/:id`
- `POST /api/v1/posts/:id/like`
- `POST /api/v1/posts/:id/recommend`
- `POST /api/v1/posts/:id/share`
- `POST /api/v1/feedback`
- `GET /api/v1/groups`
- `POST /api/v1/groups`
- `GET /api/v1/groups/:id`
- `POST /api/v1/groups/:id/join`
- `POST /api/v1/groups/:id/leave`
- `POST /api/v1/groups/:id/transfer`
- `PATCH /api/v1/groups/:id/privacy`
- `POST /api/v1/groups/:id/kick`
- `GET /api/v1/vehicle-catalog/brands`
- `GET /api/v1/vehicle-catalog`
- `GET /api/v1/vehicles`
- `POST /api/v1/vehicles`
- `PUT /api/v1/vehicles/:id`
- `DELETE /api/v1/vehicles/:id`
- `GET /api/v1/fuel-records`
- `POST /api/v1/fuel-records`
- `PATCH /api/v1/fuel-records/:id`
- `DELETE /api/v1/fuel-records/:id`
新增云函数路由时，需要同步在 `scripts/dev-server.js` 增加映射。

社区列表可见性规则（`GET /api/v1/posts`）：
- 未登录：仅 `public`
- 已登录：`public` + 本人内容（含 `private`）+ 所属组内容（`visibility=group`）
- 未登录快照：首次请求会固化当日 10 条（`meta.frozen=true`），同设备当日后续请求始终返回该 10 条快照，不再返回 429 配额错误。

写接口幂等策略：
- 强制（缺 `Idempotency-Key` 会报错）：`POST /api/v1/posts`、`POST /api/v1/fuel-records`
- 兼容（有 `Idempotency-Key` 启用幂等，无 key 按资源语义处理）：其余写接口（`vehicles/groups/feedback/posts.update/fuel-records.patch`）

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
- 简写：`health` / `login` / `token.refresh` / `posts.list`
- HTTP 风格：`api/v1/health` / `api/v1/login` / `api/v1/token/refresh` / `api/v1/items`

车型品牌总表接口（前端“先选品牌”）：
- `GET /api/v1/vehicle-catalog/brands`
- query: `keyword?`, `page`(默认 1), `pageSize`(默认 50, 最大 200)
- response: `list: [{ brand, topHotRank, modelCount }]`

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
- `APP_ENV=main`
- 非本地联调（`IS_LOCAL_DEV=true` 时强制不上报）

环境名说明：
- 上报开关判断仍基于 `APP_ENV`（仅 `main` 默认上报）
- Sentry 事件里的 `environment` 字段优先使用 `SENTRY_ENV`，未配置时回退到 `APP_ENV`

dev 联调测试（按需临时开启）：
- 额外设置 `SENTRY_FORCE_ENABLE=true` 可绕过 `APP_ENV/IS_LOCAL_DEV` 限制，用于验证上报链路。
- 建议仅在短时联调使用，验证后关闭，避免 dev 噪声进入正式告警。

推荐在云函数 `api` 的运行时环境变量中配置：
- `SENTRY_ENABLED=true`
- `SENTRY_DSN=<your sentry dsn>`
- `APP_ENV=main`
- `SENTRY_ENV=production`（可选，推荐；用于 Sentry 展示环境名）
- `SENTRY_RELEASE`（可选，建议填版本号或 commit）
- `SENTRY_TRACES_SAMPLE_RATE`（可选，默认 `0`）

本地 `pnpm run dev:api` 联调默认不触发上报，用于避免 dev 噪声数据进入 Sentry。

### 本地/线上上报策略（推荐）

- 本地默认不上报：`pnpm run dev:api`（不设置 `SENTRY_FORCE_ENABLE`）
- 本地临时上报：只改本地 `.env.local` 后重启 `dev:api`
- main 发布后自动上报：保持云函数 `api` 环境变量为 `SENTRY_ENABLED=true` + `SENTRY_DSN` + `APP_ENV=main`

本地配置文件位置：`moto-diary-backend/.env.local`（仅本地使用，不提交）

可直接使用：

```bash
# 默认不开启本地 Sentry（注释/删除 SENTRY_FORCE_ENABLE 即可）
SENTRY_ENABLED=true
SENTRY_DSN=<your sentry dsn>
APP_ENV=dev
SENTRY_ENV=local
# SENTRY_FORCE_ENABLE=true
```

当你需要本地验证上报时，取消注释 `SENTRY_FORCE_ENABLE=true`，保存并重启 `pnpm run dev:api`。
验证完成后再注释掉，恢复本地默认不上报。

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

`rate_limits`：
- `uniq_key`：`key` asc unique
- `idx_scope_subject`：`scope` asc + `subject` asc
- `ttl_expiredAt`：`expiredAt` TTL

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
