const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAnonymousFeedSnapshot,
  saveAnonymousFeedSnapshot,
  ensureAnonymousFeedClientIdentity,
} = require("../cloudfunctions/api/src/services/access-control");

const withEnv = async (patch, fn) => {
  const previous = {};
  Object.keys(patch).forEach((key) => {
    previous[key] = process.env[key];
    process.env[key] = patch[key];
  });
  try {
    return await fn();
  } finally {
    Object.keys(patch).forEach((key) => {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    });
  }
};

const withMockNow = async (timestampMs, fn) => {
  const originalNow = Date.now;
  Date.now = () => timestampMs;
  try {
    return await fn();
  } finally {
    Date.now = originalNow;
  }
};

test("anonymous snapshot quota reflects actual snapshot size when data < limit", async () => {
  await withEnv(
    {
      RATE_LIMITS_BACKEND: "memory",
      ANON_FEED_QUOTA_PER_DAY: "10",
    },
    async () => {
      const ctx = {
        event: {
          headers: {
            "x-device-id": "quota-less-than-limit-test",
          },
        },
      };

      await withMockNow(Date.parse("2026-03-24T10:00:00.000Z"), async () => {
        const saved = await saveAnonymousFeedSnapshot(ctx, ["a", "b", "b", "", "  "]);
        assert.deepEqual(saved.itemIds, ["a", "b"]);
        assert.equal(saved.quota.limit, 10);
        assert.equal(saved.quota.used, 2);
        assert.equal(saved.quota.remaining, 8);
        assert.equal(saved.quota.limitedByData, true);
      });
    }
  );
});

test("anonymous snapshot resets by China natural day (UTC+8)", async () => {
  await withEnv(
    {
      RATE_LIMITS_BACKEND: "memory",
      ANON_FEED_QUOTA_PER_DAY: "10",
    },
    async () => {
      const ctx = {
        event: {
          headers: {
            "x-device-id": "china-day-bucket-test",
          },
        },
      };

      await withMockNow(Date.parse("2026-03-24T15:59:59.000Z"), async () => {
        const saved = await saveAnonymousFeedSnapshot(ctx, ["p1"]);
        assert.deepEqual(saved.itemIds, ["p1"]);
        const snapshot = await getAnonymousFeedSnapshot(ctx);
        assert.deepEqual(snapshot && snapshot.itemIds, ["p1"]);
      });

      await withMockNow(Date.parse("2026-03-24T16:00:01.000Z"), async () => {
        const snapshot = await getAnonymousFeedSnapshot(ctx);
        assert.equal(snapshot, null);
      });
    }
  );
});

test("anonymous snapshot is isolated by query fingerprint", async () => {
  await withEnv(
    {
      RATE_LIMITS_BACKEND: "memory",
      ANON_FEED_QUOTA_PER_DAY: "10",
    },
    async () => {
      const ctx = {
        event: {
          headers: {
            "x-device-id": "query-fingerprint-test",
          },
        },
      };

      await withMockNow(Date.parse("2026-03-24T10:00:00.000Z"), async () => {
        await saveAnonymousFeedSnapshot(ctx, ["hot-1"], { sort: "hot", city: "上海市" });
        await saveAnonymousFeedSnapshot(ctx, ["new-1"], { sort: "new", city: "上海市" });
        const hot = await getAnonymousFeedSnapshot(ctx, { sort: "hot", city: "上海市" });
        const latest = await getAnonymousFeedSnapshot(ctx, { sort: "new", city: "上海市" });
        assert.deepEqual(hot && hot.itemIds, ["hot-1"]);
        assert.deepEqual(latest && latest.itemIds, ["new-1"]);
      });
    }
  );
});

test("ensureAnonymousFeedClientIdentity requires x-device-id when openid is absent", () => {
  assert.throws(
    () =>
      ensureAnonymousFeedClientIdentity({
        event: {
          headers: {},
        },
      }),
    /x-device-id is required/
  );
});
