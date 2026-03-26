const test = require("node:test");
const assert = require("node:assert/strict");

const servicePath = require.resolve("../cloudfunctions/api/src/services/groups");
const repoPath = require.resolve("../cloudfunctions/api/src/repositories/groups");

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const loadGroupsServiceWithMockRepo = (initialGroup) => {
  const state = {
    group: deepClone(initialGroup),
  };

  const mockRepo = {
    listAllActiveGroups: async () => [],
    getGroupById: async (id) => {
      if (!state.group || id !== state.group._id) return null;
      return deepClone(state.group);
    },
    createGroup: async () => null,
    updateGroupByIdIfUnchanged: async (id, compareUpdatedAt, updates) => {
      if (!state.group || id !== state.group._id) return false;
      const version = state.group.updatedAt || state.group.createdAt || null;
      if (compareUpdatedAt && compareUpdatedAt !== version) return false;
      state.group = {
        ...state.group,
        ...deepClone(updates),
      };
      return true;
    },
  };

  delete require.cache[servicePath];
  delete require.cache[repoPath];
  require.cache[repoPath] = {
    id: repoPath,
    filename: repoPath,
    loaded: true,
    exports: mockRepo,
  };

  const service = require(servicePath);
  const cleanup = () => {
    delete require.cache[servicePath];
    delete require.cache[repoPath];
  };

  return { service, state, cleanup };
};

test("kickGroupMemberForUser removes member when target exists", async () => {
  const { service, state, cleanup } = loadGroupsServiceWithMockRepo({
    _id: "g1",
    status: "active",
    adminId: "u_admin",
    members: ["u_admin", "u_member"],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:00:00.000Z",
  });

  try {
    const result = await service.kickGroupMemberForUser({
      ctx: { event: {} },
      user: { id: "u_admin" },
      groupId: "g1",
      userId: "u_member",
    });

    assert.deepEqual(result, { kicked: true });
    assert.deepEqual(state.group.members, ["u_admin"]);
  } finally {
    cleanup();
  }
});

test("kickGroupMemberForUser rejects when target is not a group member", async () => {
  const { service, cleanup } = loadGroupsServiceWithMockRepo({
    _id: "g1",
    status: "active",
    adminId: "u_admin",
    members: ["u_admin", "u_member"],
    createdAt: "2026-03-24T09:00:00.000Z",
    updatedAt: "2026-03-24T09:00:00.000Z",
  });

  try {
    await assert.rejects(
      () =>
        service.kickGroupMemberForUser({
          ctx: { event: {} },
          user: { id: "u_admin" },
          groupId: "g1",
          userId: "u_not_exists",
        }),
      (error) => error && error.code === "VALIDATION_FAILED" && error.status === 400
    );
  } finally {
    cleanup();
  }
});
