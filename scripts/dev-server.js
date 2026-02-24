#!/usr/bin/env node
const http = require("http");
const { randomUUID } = require("crypto");
const path = require("path");

const PORT = Number(process.env.API_LOCAL_PORT || 3100);
const HOST = process.env.API_LOCAL_HOST || "127.0.0.1";
process.env.IS_LOCAL_DEV = "true";

const routeMap = {
  "GET /api/v1/health": "health",
  "POST /api/v1/login": "login",
  "GET /api/v1/items": "items.list",
};

let apiMain;
try {
  // Reuse cloud function entry so local behavior stays close to online routing.
  ({ main: apiMain } = require(path.resolve(__dirname, "../cloudfunctions/api/index.js")));
} catch (err) {
  console.error(
    "Failed to load cloudfunctions/api. Please install deps first: pnpm --dir cloudfunctions/api install"
  );
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { success: true });
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const routeKey = `${req.method} ${url.pathname}`;
  const mapped = routeMap[routeKey];
  if (!mapped) {
    return sendJson(res, 404, {
      success: false,
      error: { code: "NOT_FOUND", message: `No local route mapped for ${routeKey}` },
    });
  }

  try {
    const rawBody = await readBody(req);
    const event = {
      $url: mapped,
      path: url.pathname,
      httpMethod: req.method,
      headers: req.headers || {},
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: rawBody || undefined,
    };
    const context = {
      requestId: randomUUID(),
      source: "local-dev-server",
    };
    const result = await apiMain(event, context);

    if (result && typeof result === "object" && "statusCode" in result && "body" in result) {
      let payload = result.body;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (_e) {
          payload = { success: true, data: payload };
        }
      }
      return sendJson(res, Number(result.statusCode) || 200, payload);
    }

    return sendJson(res, 200, result || { success: true });
  } catch (err) {
    return sendJson(res, 500, {
      success: false,
      error: { code: "INTERNAL_ERROR", message: err && err.message ? err.message : "Local server error" },
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Local API server running at http://${HOST}:${PORT}`);
  console.log("Mapped routes:");
  Object.entries(routeMap).forEach(([k, v]) => console.log(`  ${k} -> ${v}`));
});
