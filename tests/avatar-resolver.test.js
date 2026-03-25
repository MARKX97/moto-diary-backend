const test = require("node:test");
const assert = require("node:assert/strict");

const resolver = require("../cloudfunctions/api/src/services/avatar-resolver");

test.afterEach(() => {
  resolver.__resetAvatarResolverCacheForTest();
});

test("resolveAvatarUrlsInPayload converts avatar fields and keeps avatarFileId", async () => {
  const fileIdA = "cloud://env.123/avatar/a.jpg";
  const fileIdB = "cloud://env.123/avatar/b.jpg";
  resolver.__setTempFileUrlFetcherForTest(async (fileIds) => {
    const map = new Map();
    fileIds.forEach((fileId) => {
      map.set(fileId, `https://cdn.example.com/temp?file=${encodeURIComponent(fileId)}`);
    });
    return map;
  });

  const payload = {
    success: true,
    data: {
      list: [
        {
          author: {
            id: "u1",
            avatar: fileIdA,
          },
          groupSummary: {
            memberAvatars: [fileIdA, fileIdB, "https://example.com/c.jpg"],
          },
        },
      ],
      user: {
        id: "u2",
        avatar: fileIdB,
      },
    },
  };

  await resolver.resolveAvatarUrlsInPayload(payload);

  assert.equal(payload.data.list[0].author.avatar.startsWith("https://cdn.example.com/temp"), true);
  assert.equal(payload.data.list[0].author.avatarFileId, fileIdA);
  assert.equal(payload.data.list[0].groupSummary.memberAvatars[0].startsWith("https://cdn.example.com/temp"), true);
  assert.equal(payload.data.list[0].groupSummary.memberAvatars[1].startsWith("https://cdn.example.com/temp"), true);
  assert.equal(payload.data.list[0].groupSummary.memberAvatars[2], "https://example.com/c.jpg");
  assert.equal(payload.data.user.avatar.startsWith("https://cdn.example.com/temp"), true);
  assert.equal(payload.data.user.avatarFileId, fileIdB);
});

test("resolveAvatarUrlsInPayload uses in-memory cache for repeated fileIDs", async () => {
  const fileId = "cloud://env.123/avatar/reused.jpg";
  let calls = 0;
  resolver.__setTempFileUrlFetcherForTest(async (fileIds) => {
    calls += 1;
    const map = new Map();
    fileIds.forEach((id) => {
      map.set(id, `https://cdn.example.com/cached?file=${encodeURIComponent(id)}`);
    });
    return map;
  });

  const payloadA = {
    data: {
      author: {
        avatar: fileId,
      },
    },
  };
  const payloadB = {
    data: {
      author: {
        avatar: fileId,
      },
    },
  };

  await resolver.resolveAvatarUrlsInPayload(payloadA);
  await resolver.resolveAvatarUrlsInPayload(payloadB);

  assert.equal(calls, 1);
  assert.equal(payloadA.data.author.avatar.startsWith("https://cdn.example.com/cached"), true);
  assert.equal(payloadB.data.author.avatar.startsWith("https://cdn.example.com/cached"), true);
});
