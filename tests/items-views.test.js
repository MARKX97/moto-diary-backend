const test = require("node:test");
const assert = require("node:assert/strict");

const servicePath = require.resolve("../cloudfunctions/api/src/services/items");
const itemsRepoPath = require.resolve("../cloudfunctions/api/src/repositories/items");
const fuelRepoPath = require.resolve("../cloudfunctions/api/src/repositories/fuel-records");
const idempotencyPath = require.resolve("../cloudfunctions/api/src/services/idempotency");
const contentSecurityPath = require.resolve("../cloudfunctions/api/src/services/content-security");
const groupsServicePath = require.resolve("../cloudfunctions/api/src/services/groups");
const interactionsRepoPath = require.resolve("../cloudfunctions/api/src/repositories/item-interactions");
const groupsRepoPath = require.resolve("../cloudfunctions/api/src/repositories/groups");
const usersRepoPath = require.resolve("../cloudfunctions/api/src/repositories/users");

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const loadItemsServiceWithMocks = ({ item, users = {} }) => {
  const state = {
    item: deepClone(item),
    createdInteractions: [],
    interactionsByKey: new Map(),
  };

  const mockItemsRepo = {
    buildListConditions: () => ({}),
    queryItemsByOrder: async () => ({ total: 0, list: [] }),
    queryItemsForDistanceSort: async () => ({ total: 0, list: [] }),
    getItemById: async (id) => (state.item && id === state.item._id ? deepClone(state.item) : null),
    createItem: async () => null,
    updateItemById: async (id, updates) => {
      if (!state.item || id !== state.item._id) return null;
      state.item = {
        ...state.item,
        ...deepClone(updates),
      };
      return deepClone(state.item);
    },
    deleteItemById: async () => true,
  };

  const mockFuelRepo = {
    getFuelRecordById: async () => null,
  };

  const mockIdempotency = {
    runIdempotent: async ({ execute }) => execute(),
    runIdempotentIfPresent: async ({ execute }) => execute(),
  };

  const mockContentSecurity = {
    ensureItemContentSafe: async () => true,
  };

  const mockGroupsService = {
    getGroupById: async () => null,
    isGroupMember: () => false,
  };

  const mockInteractionsRepo = {
    findInteractionByKey: async (key) => state.interactionsByKey.get(key) || null,
    createInteraction: async (doc) => {
      if (state.interactionsByKey.has(doc.key)) {
        throw new Error("DuplicateKey");
      }
      const saved = deepClone(doc);
      state.interactionsByKey.set(doc.key, saved);
      state.createdInteractions.push(saved);
      return { id: `pi_${state.createdInteractions.length}` };
    },
  };

  const mockGroupsRepo = {
    listAllActiveGroups: async () => [],
  };

  const mockUsersRepo = {
    findUsersByUserIds: async (userIds = []) =>
      userIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
        .map((id) => users[id])
        .filter(Boolean)
        .map((doc) => deepClone(doc)),
  };

  delete require.cache[servicePath];
  delete require.cache[itemsRepoPath];
  delete require.cache[fuelRepoPath];
  delete require.cache[idempotencyPath];
  delete require.cache[contentSecurityPath];
  delete require.cache[groupsServicePath];
  delete require.cache[interactionsRepoPath];
  delete require.cache[groupsRepoPath];
  delete require.cache[usersRepoPath];

  require.cache[itemsRepoPath] = {
    id: itemsRepoPath,
    filename: itemsRepoPath,
    loaded: true,
    exports: mockItemsRepo,
  };
  require.cache[fuelRepoPath] = {
    id: fuelRepoPath,
    filename: fuelRepoPath,
    loaded: true,
    exports: mockFuelRepo,
  };
  require.cache[idempotencyPath] = {
    id: idempotencyPath,
    filename: idempotencyPath,
    loaded: true,
    exports: mockIdempotency,
  };
  require.cache[contentSecurityPath] = {
    id: contentSecurityPath,
    filename: contentSecurityPath,
    loaded: true,
    exports: mockContentSecurity,
  };
  require.cache[groupsServicePath] = {
    id: groupsServicePath,
    filename: groupsServicePath,
    loaded: true,
    exports: mockGroupsService,
  };
  require.cache[interactionsRepoPath] = {
    id: interactionsRepoPath,
    filename: interactionsRepoPath,
    loaded: true,
    exports: mockInteractionsRepo,
  };
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

  const service = require(servicePath);
  const cleanup = () => {
    delete require.cache[servicePath];
    delete require.cache[itemsRepoPath];
    delete require.cache[fuelRepoPath];
    delete require.cache[idempotencyPath];
    delete require.cache[contentSecurityPath];
    delete require.cache[groupsServicePath];
    delete require.cache[interactionsRepoPath];
    delete require.cache[groupsRepoPath];
    delete require.cache[usersRepoPath];
  };

  return { service, state, cleanup };
};

test("getItemDetail increments views once per user per China natural day", async () => {
  const { service, state, cleanup } = loadItemsServiceWithMocks({
    item: {
      _id: "p1",
      ownerId: "u_owner",
      visibility: "public",
      stats: { likes: 0, shares: 0, views: 0 },
      hotScore: 0,
      createdAt: "2026-03-24T10:00:00.000Z",
      updatedAt: "2026-03-24T10:00:00.000Z",
    },
    users: {
      u_owner: { userId: "u_owner", nickname: "作者", avatar: "https://example.com/owner.jpg" },
    },
  });

  try {
    const first = await service.getItemDetail({
      id: "p1",
      user: { id: "u_reader", role: "user" },
      ctx: { event: { headers: { "x-device-id": "dev-a" } } },
    });
    const second = await service.getItemDetail({
      id: "p1",
      user: { id: "u_reader", role: "user" },
      ctx: { event: { headers: { "x-device-id": "dev-a" } } },
    });

    assert.equal(first.stats.views, 1);
    assert.equal(second.stats.views, 1);
    assert.equal(state.item.stats.views, 1);
    assert.equal(state.createdInteractions.length, 1);
    assert.equal(state.createdInteractions[0].action, "view");
    assert.equal(state.createdInteractions[0].actorId, "u:u_reader");
  } finally {
    cleanup();
  }
});

test("getItemDetail increments views for anonymous by device and de-duplicates per device", async () => {
  const { service, state, cleanup } = loadItemsServiceWithMocks({
    item: {
      _id: "p1",
      ownerId: "u_owner",
      visibility: "public",
      stats: { likes: 0, shares: 0, views: 0 },
      hotScore: 0,
      createdAt: "2026-03-24T10:00:00.000Z",
      updatedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  try {
    await service.getItemDetail({
      id: "p1",
      user: null,
      ctx: { event: { headers: { "x-device-id": "dev-1" } } },
    });
    await service.getItemDetail({
      id: "p1",
      user: null,
      ctx: { event: { headers: { "x-device-id": "dev-1" } } },
    });
    await service.getItemDetail({
      id: "p1",
      user: null,
      ctx: { event: { headers: { "x-device-id": "dev-2" } } },
    });

    assert.equal(state.item.stats.views, 2);
    assert.equal(state.createdInteractions.length, 2);
    assert.equal(state.createdInteractions[0].actorId, "c:dev:dev-1");
    assert.equal(state.createdInteractions[1].actorId, "c:dev:dev-2");
  } finally {
    cleanup();
  }
});

test("getItemDetail increments views for anonymous mini-program context openid", async () => {
  const { service, state, cleanup } = loadItemsServiceWithMocks({
    item: {
      _id: "p1",
      ownerId: "u_owner",
      visibility: "public",
      stats: { likes: 0, shares: 0, views: 0 },
      hotScore: 0,
      createdAt: "2026-03-24T10:00:00.000Z",
      updatedAt: "2026-03-24T10:00:00.000Z",
    },
  });

  try {
    await service.getItemDetail({
      id: "p1",
      user: null,
      ctx: { event: {}, state: { context: { OPENID: "o_test_openid" } } },
    });

    assert.equal(state.item.stats.views, 1);
    assert.equal(state.createdInteractions.length, 1);
    assert.equal(state.createdInteractions[0].actorId, "c:wx:o_test_openid");
  } finally {
    cleanup();
  }
});
