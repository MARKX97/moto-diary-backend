const { createAppError } = require("../utils/app-error");
const {
  listAllActiveGroups,
  getGroupById,
  createGroup,
  updateGroupByIdIfUnchanged,
} = require("../repositories/groups");
const { runIdempotentIfPresent } = require("./idempotency");

const GROUP_MAX_MEMBERS = 30;
const GROUP_WRITE_RETRY_TIMES = 5;

const ensureGroupExists = (group) => {
  if (!group) {
    throw createAppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Group not found",
      expose: true,
    });
  }
  if (group.status && group.status !== "active") {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "Group is not active",
      expose: true,
    });
  }
};

const isGroupMember = (group, userId) => {
  if (!group || !userId) return false;
  if (group.adminId === userId) return true;
  const members = Array.isArray(group.members) ? group.members : [];
  return members.includes(userId);
};

const ensureGroupAdmin = (group, userId) => {
  if (!group || !userId || group.adminId !== userId) {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "Only group admin can perform this operation",
      expose: true,
    });
  }
};

const listGroups = async ({ user, page, pageSize }) => {
  const all = await listAllActiveGroups();
  const filtered = all.filter((group) => {
    if (!group || group.status !== "active") return false;
    if (group.privacy === "public") return true;
    return isGroupMember(group, user.id);
  });
  const skip = (page - 1) * pageSize;
  const list = filtered.slice(skip, skip + pageSize);
  return {
    total: filtered.length,
    list,
  };
};

const updateGroupWithRetry = async ({ groupId, mutate }) => {
  for (let attempt = 0; attempt < GROUP_WRITE_RETRY_TIMES; attempt += 1) {
    const group = await getGroupById(groupId);
    ensureGroupExists(group);
    const mutation = await mutate(group);
    if (!mutation || mutation.type === "noop") {
      return mutation && mutation.result ? mutation.result : null;
    }

    const version = group.updatedAt || group.createdAt || null;
    const committed = await updateGroupByIdIfUnchanged(groupId, version, mutation.updates);
    if (committed) {
      if (mutation.refetch) {
        return getGroupById(groupId);
      }
      return mutation.result || null;
    }
  }

  throw createAppError({
    code: "DEPENDENCY_ERROR",
    status: 409,
    message: "group was updated concurrently, please retry",
    expose: true,
  });
};

const createGroupForUser = async ({ ctx, user, payload }) => {
  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/groups",
    userId: user.id,
    payload,
    execute: async () => {
      const now = new Date().toISOString();
      const doc = {
        name: payload.name,
        description: payload.description || "",
        privacy: payload.privacy || "public",
        adminId: user.id,
        members: [user.id],
        status: "active",
        maxMembers: GROUP_MAX_MEMBERS,
        createdAt: now,
        updatedAt: now,
      };
      return createGroup(doc);
    },
  });
};

const getGroupDetailForUser = async ({ user, groupId }) => {
  const group = await getGroupById(groupId);
  ensureGroupExists(group);
  if (group.privacy === "private" && !isGroupMember(group, user.id)) {
    throw createAppError({
      code: "FORBIDDEN",
      status: 403,
      message: "No permission to access this group",
      expose: true,
    });
  }
  return group;
};

const joinGroupForUser = async ({ ctx, user, groupId }) => {
  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/groups/:id/join",
    userId: user.id,
    payload: { id: groupId },
    execute: async () =>
      updateGroupWithRetry({
        groupId,
        mutate: async (group) => {
          if (isGroupMember(group, user.id)) {
            return { type: "noop", result: { joined: true } };
          }
          const members = Array.isArray(group.members) ? [...group.members] : [];
          if (members.length >= GROUP_MAX_MEMBERS) {
            throw createAppError({
              code: "VALIDATION_FAILED",
              status: 400,
              message: `group member limit is ${GROUP_MAX_MEMBERS}`,
              expose: true,
            });
          }
          members.push(user.id);
          return {
            type: "write",
            updates: {
              members,
              updatedAt: new Date().toISOString(),
            },
            result: { joined: true },
          };
        },
      }),
  });
};

const leaveGroupForUser = async ({ ctx, user, groupId }) => {
  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/groups/:id/leave",
    userId: user.id,
    payload: { id: groupId },
    execute: async () =>
      updateGroupWithRetry({
        groupId,
        mutate: async (group) => {
          if (!isGroupMember(group, user.id)) {
            return { type: "noop", result: { left: true } };
          }

          const members = Array.isArray(group.members) ? [...group.members] : [];
          const nextMembers = members.filter((id) => id !== user.id);
          if (group.adminId === user.id) {
            if (nextMembers.length > 0) {
              throw createAppError({
                code: "FORBIDDEN",
                status: 403,
                message: "admin must transfer ownership before leaving",
                expose: true,
              });
            }
            return {
              type: "write",
              updates: {
                members: [],
                status: "closed",
                updatedAt: new Date().toISOString(),
              },
              result: { left: true },
            };
          }

          return {
            type: "write",
            updates: {
              members: nextMembers,
              updatedAt: new Date().toISOString(),
            },
            result: { left: true },
          };
        },
      }),
  });
};

const transferGroupAdminForUser = async ({ ctx, user, groupId, toUserId }) => {
  if (toUserId === user.id) {
    throw createAppError({
      code: "VALIDATION_FAILED",
      status: 400,
      message: "toUserId must be different from current admin",
      expose: true,
    });
  }

  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/groups/:id/transfer",
    userId: user.id,
    payload: { id: groupId, toUserId },
    execute: async () =>
      updateGroupWithRetry({
        groupId,
        mutate: async (group) => {
          ensureGroupAdmin(group, user.id);
          if (!isGroupMember(group, toUserId)) {
            throw createAppError({
              code: "VALIDATION_FAILED",
              status: 400,
              message: "target user is not a group member",
              expose: true,
            });
          }
          return {
            type: "write",
            updates: {
              adminId: toUserId,
              updatedAt: new Date().toISOString(),
            },
            result: { transferred: true },
          };
        },
      }),
  });
};

const updateGroupPrivacyForUser = async ({ ctx, user, groupId, privacy }) => {
  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/groups/:id/privacy",
    userId: user.id,
    payload: { id: groupId, privacy },
    execute: async () =>
      updateGroupWithRetry({
        groupId,
        mutate: async (group) => {
          ensureGroupAdmin(group, user.id);
          return {
            type: "write",
            updates: {
              privacy,
              updatedAt: new Date().toISOString(),
            },
            refetch: true,
          };
        },
      }),
  });
};

const kickGroupMemberForUser = async ({ ctx, user, groupId, userId }) => {
  return runIdempotentIfPresent({
    ctx,
    path: "/api/v1/groups/:id/kick",
    userId: user.id,
    payload: { id: groupId, userId },
    execute: async () =>
      updateGroupWithRetry({
        groupId,
        mutate: async (group) => {
          ensureGroupAdmin(group, user.id);
          if (userId === group.adminId) {
            throw createAppError({
              code: "FORBIDDEN",
              status: 403,
              message: "cannot kick group admin",
              expose: true,
            });
          }
          const members = Array.isArray(group.members) ? [...group.members] : [];
          const nextMembers = members.filter((id) => id !== userId);
          return {
            type: "write",
            updates: {
              members: nextMembers,
              updatedAt: new Date().toISOString(),
            },
            result: { kicked: true },
          };
        },
      }),
  });
};

module.exports = {
  GROUP_MAX_MEMBERS,
  isGroupMember,
  getGroupById,
  listGroups,
  createGroupForUser,
  getGroupDetailForUser,
  joinGroupForUser,
  leaveGroupForUser,
  transferGroupAdminForUser,
  updateGroupPrivacyForUser,
  kickGroupMemberForUser,
};
