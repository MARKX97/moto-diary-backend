const {
  listGroups,
  createGroupForUser,
  getGroupDetailForUser,
  joinGroupForUser,
  leaveGroupForUser,
  transferGroupAdminForUser,
  updateGroupPrivacyForUser,
  kickGroupMemberForUser,
} = require("../services/groups");

const listGroupsController = async (ctx) => {
  const { page, pageSize } = ctx.data;
  const result = await listGroups({
    user: ctx.state.user,
    page,
    pageSize,
  });
  return {
    success: true,
    data: {
      list: result.list,
      meta: {
        total: result.total,
        page,
        pageSize,
      },
    },
  };
};

const createGroupController = async (ctx) => {
  const created = await createGroupForUser({
    ctx,
    user: ctx.state.user,
    payload: ctx.data,
  });
  return {
    success: true,
    data: created,
  };
};

const getGroupDetailController = async (ctx) => {
  const group = await getGroupDetailForUser({
    user: ctx.state.user,
    groupId: ctx.data.id,
  });
  return {
    success: true,
    data: group,
  };
};

const joinGroupController = async (ctx) => {
  const result = await joinGroupForUser({
    ctx,
    user: ctx.state.user,
    groupId: ctx.data.id,
  });
  return {
    success: true,
    data: result,
  };
};

const leaveGroupController = async (ctx) => {
  const result = await leaveGroupForUser({
    ctx,
    user: ctx.state.user,
    groupId: ctx.data.id,
  });
  return {
    success: true,
    data: result,
  };
};

const transferGroupController = async (ctx) => {
  const result = await transferGroupAdminForUser({
    ctx,
    user: ctx.state.user,
    groupId: ctx.data.id,
    toUserId: ctx.data.toUserId,
  });
  return {
    success: true,
    data: result,
  };
};

const updateGroupPrivacyController = async (ctx) => {
  const group = await updateGroupPrivacyForUser({
    ctx,
    user: ctx.state.user,
    groupId: ctx.data.id,
    privacy: ctx.data.privacy,
  });
  return {
    success: true,
    data: group,
  };
};

const kickGroupMemberController = async (ctx) => {
  const result = await kickGroupMemberForUser({
    ctx,
    user: ctx.state.user,
    groupId: ctx.data.id,
    userId: ctx.data.userId,
  });
  return {
    success: true,
    data: result,
  };
};

module.exports = {
  listGroupsController,
  createGroupController,
  getGroupDetailController,
  joinGroupController,
  leaveGroupController,
  transferGroupController,
  updateGroupPrivacyController,
  kickGroupMemberController,
};
