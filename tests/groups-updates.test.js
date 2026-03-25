const test = require("node:test");
const assert = require("node:assert/strict");

const servicePath = require.resolve("../cloudfunctions/api/src/services/groups");
const groupsRepoPath = require.resolve("../cloudfunctions/api/src/repositories/groups");
const usersRepoPath = require.resolve("../cloudfunctions/api/src/repositories/users");
const notificationsRepoPath = require.resolve("../cloudfunctions/api/src/repositories/notifications");

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const loadGroupsServiceWithMocks = ({ groups = [], users = {}, notifyError = false } = {}) => {
  const state = {
    groups: new Map(groups.map((group) => [group._id, deepClone(group)])),
    users: new Map(Object.entries(users).map(([key, value]) => [key, deepClone(value)])),
    notifications: [],
  };

  const mockGroupsRepo = {
    listAllActiveGroups: async () =>
      Array.from(state.groups.values())
        .filter((group) => group && group.status === "active")
        .map((group) => deepClone(group)),
    getGroupById: async (id) => {
      const group = state.groups.get(id);
      return group ? deepClone(group) : null;
    },
    createGroup: async () => null,
    updateGroupByIdIfUnchanged: async (id, compareUpdatedAt, updates) => {
      const current = state.groups.get(id);
      if (!current) return false;
      const version = current.updatedAt || current.createdAt || null;
      if (compareUpdatedAt && version !== compareUpdatedAt) return false;
      state.groups.set(id, {
        ...current,
        ...deepClone(updates),
      });
      return true;
    },
  };

  const mockUsersRepo = {
    findUsersByUserIds: async (userIds = []) => {
      return userIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
        .map((id) => state.users.get(id))
        .filter(Boolean)
        .map((user) => deepClone(user));
    },
  };

  const mockNotificationsRepo = {
    createNotification: async (doc) => {
      if (notifyError) throw new Error("mock notification write failed");
      state.notifications.push(deepClone(doc));
      return { id: `n_${state.notifications.length}` };
    },
  };

  delete require.cache[servicePath];
  delete require.cache[groupsRepoPath];
  delete require.cache[usersRepoPath];
  delete require.cache[notificationsRepoPath];

  require.cache[groupsRepoPath] = {
    id: groupsRepoPath,
    filename: groupsRepoPath,
    loaded: true,
    exports: mockGroupsRepo,
  };
  require.cache[usersRepoPath] = {
    id: usersRepoPath,
    filename: usersRepoPath,
    loaded: true,
    exports: mockUsersRepo,
  };
  require.cache[notificationsRepoPath] = {
    id: notificationsRepoPath,
    filename: notificationsRepoPath,
    loaded: true,
    exports: mockNotificationsRepo,
  };

  const service = require(servicePath);
  const cleanup = () => {
    delete require.cache[servicePath];
    delete require.cache[groupsRepoPath];
    delete require.cache[usersRepoPath];
    delete require.cache[notificationsRepoPath];
  };

  return { service, state, cleanup };
};

test("joinGroupForUser writes captain notification for newly joined member", async () => {
  const { service, state, cleanup } = loadGroupsServiceWithMocks({
    groups: [
      {
        _id: "g1",
        name: "318冲冲冲",
        status: "active",
        privacy: "public",
        adminId: "u_admin",
        members: ["u_admin"],
        createdAt: "2026-03-24T10:00:00.000Z",
        updatedAt: "2026-03-24T10:00:00.000Z",
      },
    ],
    users: {
      u_member: {
        userId: "u_member",
        nickname: "新成员A",
        avatar: "https://example.com/a.jpg",
      },
    },
  });

  try {
    const result = await service.joinGroupForUser({
      ctx: { event: {} },
      user: { id: "u_member" },
      groupId: "g1",
    });

    assert.deepEqual(result, { joined: true, notifiedCaptain: true });
    assert.deepEqual(state.groups.get("g1").members, ["u_admin", "u_member"]);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].userId, "u_admin");
    assert.equal(state.notifications[0].type, "group_member_joined");
    assert.equal(state.notifications[0].payload.groupId, "g1");
    assert.equal(state.notifications[0].payload.memberId, "u_member");
  } finally {
    cleanup();
  }
});

test("joinGroupForUser keeps idempotent result without duplicate notification", async () => {
  const { service, state, cleanup } = loadGroupsServiceWithMocks({
    groups: [
      {
        _id: "g1",
        name: "318冲冲冲",
        status: "active",
        privacy: "public",
        adminId: "u_admin",
        members: ["u_admin", "u_member"],
        createdAt: "2026-03-24T10:00:00.000Z",
        updatedAt: "2026-03-24T10:00:00.000Z",
      },
    ],
  });

  try {
    const result = await service.joinGroupForUser({
      ctx: { event: {} },
      user: { id: "u_member" },
      groupId: "g1",
    });

    assert.deepEqual(result, { joined: true, notifiedCaptain: false });
    assert.deepEqual(state.groups.get("g1").members, ["u_admin", "u_member"]);
    assert.equal(state.notifications.length, 0);
  } finally {
    cleanup();
  }
});

test("getGroupDetailForUser returns memberProfiles and memberCount", async () => {
  const { service, cleanup } = loadGroupsServiceWithMocks({
    groups: [
      {
        _id: "g1",
        name: "318冲冲冲",
        status: "active",
        privacy: "public",
        adminId: "u_admin",
        members: ["u_admin", "u_member"],
        createdAt: "2026-03-24T10:00:00.000Z",
        updatedAt: "2026-03-24T10:00:00.000Z",
      },
    ],
    users: {
      u_admin: { userId: "u_admin", nickname: "队长", avatar: "https://example.com/captain.jpg" },
      u_member: { userId: "u_member", nickname: "成员", avatar: "https://example.com/member.jpg" },
    },
  });

  try {
    const detail = await service.getGroupDetailForUser({
      user: { id: "u_member" },
      groupId: "g1",
    });

    assert.equal(detail.memberCount, 2);
    assert.ok(Array.isArray(detail.memberProfiles));
    assert.equal(detail.memberProfiles.length, 2);
    assert.equal(detail.memberProfiles[0].userId, "u_admin");
    assert.equal(detail.memberProfiles[1].userId, "u_member");
    assert.equal(detail.memberProfiles[0].role, "admin");
    assert.equal(detail.memberProfiles[0].isCaptain, true);
    assert.equal(detail.memberProfiles[1].role, "member");
    assert.equal(detail.memberProfiles[1].isCaptain, false);
  } finally {
    cleanup();
  }
});

test("disbandGroupForUser closes group directly by admin", async () => {
  const { service, state, cleanup } = loadGroupsServiceWithMocks({
    groups: [
      {
        _id: "g1",
        name: "318冲冲冲",
        status: "active",
        privacy: "public",
        adminId: "u_admin",
        members: ["u_admin", "u_member"],
        createdAt: "2026-03-24T10:00:00.000Z",
        updatedAt: "2026-03-24T10:00:00.000Z",
      },
    ],
  });

  try {
    const result = await service.disbandGroupForUser({
      ctx: { event: {} },
      user: { id: "u_admin" },
      groupId: "g1",
    });

    assert.deepEqual(result, { disbanded: true });
    const next = state.groups.get("g1");
    assert.equal(next.status, "closed");
    assert.deepEqual(next.members, []);
  } finally {
    cleanup();
  }
});
