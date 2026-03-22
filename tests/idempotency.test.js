const test = require("node:test");
const assert = require("node:assert/strict");
const {
  requireIdempotencyKey,
  hasIdempotencyKey,
  runIdempotentIfPresent,
} = require("../cloudfunctions/api/src/services/idempotency");

test("requireIdempotencyKey extracts and trims key from headers", () => {
  const ctx = {
    event: {
      headers: {
        "idempotency-key": "  abc-123  ",
      },
    },
  };
  assert.equal(requireIdempotencyKey(ctx), "abc-123");
});

test("requireIdempotencyKey rejects oversize key", () => {
  const ctx = {
    event: {
      headers: {
        "idempotency-key": "x".repeat(129),
      },
    },
  };
  assert.throws(() => requireIdempotencyKey(ctx), /length must be <= 128/);
});

test("hasIdempotencyKey returns false when key is absent", () => {
  assert.equal(hasIdempotencyKey({ event: {} }), false);
});

test("runIdempotentIfPresent runs execute directly without idempotency key", async () => {
  let called = 0;
  const result = await runIdempotentIfPresent({
    ctx: { event: {} },
    path: "/api/v1/posts/:id",
    userId: "u_test",
    payload: { title: "hello" },
    execute: async () => {
      called += 1;
      return { success: true };
    },
  });

  assert.equal(called, 1);
  assert.deepEqual(result, { success: true });
});
