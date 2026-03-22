const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const contractPath = path.join(__dirname, "..", "docs", "api-contract.v1.json");
const routerPath = path.join(__dirname, "..", "cloudfunctions", "api", "index.js");

const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const routerSource = fs.readFileSync(routerPath, "utf8");

test("api contract has unique method + path entries", () => {
  const pairs = contract.endpoints.map((item) => `${item.method} ${item.path}`);
  const unique = new Set(pairs);
  assert.equal(unique.size, pairs.length);
});

test("api contract endpoint fields are valid", () => {
  contract.endpoints.forEach((item) => {
    assert.match(item.method, /^(GET|POST|PUT|PATCH|DELETE)$/);
    assert.ok(item.path.startsWith("/api/v1/"), `invalid path: ${item.path}`);
    assert.match(item.auth, /^(none|optional|required)$/);
    assert.match(item.idempotency, /^(none|required|optional|semantic)$/);
  });
});

test("api contract aliases exist in router", () => {
  contract.endpoints.forEach((item) => {
    assert.ok(item.alias, `missing alias on ${item.method} ${item.path}`);
    assert.ok(routerSource.includes(`"${item.alias}"`), `alias not found in router: ${item.alias}`);
  });
});

test("idempotency required routes are present in endpoint list", () => {
  const pairs = new Set(contract.endpoints.map((item) => `${item.method} ${item.path}`));
  contract.idempotency.required.forEach((entry) => {
    assert.ok(pairs.has(entry), `missing required idempotent route: ${entry}`);
  });
});
