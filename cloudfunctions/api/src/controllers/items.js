const {
  listItems,
  listItemsByIds,
  getItemDetail,
  createItemPost,
  updateItemPost,
  deleteItemPost,
  interactItemPost,
} = require("../services/items");
const { getAnonymousFeedSnapshot, saveAnonymousFeedSnapshot } = require("../services/access-control");

const ANONYMOUS_FIXED_PAGE = 1;
const ANONYMOUS_FIXED_PAGE_SIZE = 10;

const listItemsController = async (ctx) => {
  const { page, pageSize, sort, lat, lng, city, type, tag } = ctx.data;
  const user = ctx.state && ctx.state.user ? ctx.state.user : null;

  if (!user) {
    const snapshot = await getAnonymousFeedSnapshot(ctx);
    if (snapshot && Array.isArray(snapshot.itemIds) && snapshot.itemIds.length) {
      const fixed = await listItemsByIds({
        ids: snapshot.itemIds,
        user: null,
      });
      return {
        success: true,
        data: {
          list: fixed.list,
          meta: {
            total: fixed.total,
            page: ANONYMOUS_FIXED_PAGE,
            pageSize: ANONYMOUS_FIXED_PAGE_SIZE,
            sort,
            frozen: true,
            anonQuota: snapshot.quota,
          },
        },
      };
    }

    const firstBatch = await listItems({
      user: null,
      page: ANONYMOUS_FIXED_PAGE,
      pageSize: ANONYMOUS_FIXED_PAGE_SIZE,
      sort,
      lat,
      lng,
      city,
      type,
      tag,
    });
    const savedSnapshot = await saveAnonymousFeedSnapshot(
      ctx,
      firstBatch.list.map((item) => item && item._id).filter(Boolean)
    );
    const fixed = await listItemsByIds({
      ids: savedSnapshot.itemIds,
      user: null,
    });

    return {
      success: true,
      data: {
        list: fixed.list,
        meta: {
          total: fixed.total,
          page: ANONYMOUS_FIXED_PAGE,
          pageSize: ANONYMOUS_FIXED_PAGE_SIZE,
          sort,
          frozen: true,
          anonQuota: savedSnapshot.quota,
        },
      },
    };
  }

  const result = await listItems({
    user,
    page,
    pageSize,
    sort,
    lat,
    lng,
    city,
    type,
    tag,
  });

  return {
    success: true,
    data: {
      list: result.list,
      meta: {
        total: result.total,
        page,
        pageSize,
        sort,
      },
    },
  };
};

const getItemDetailController = async (ctx) => {
  const { id } = ctx.data;
  const user = ctx.state && ctx.state.user ? ctx.state.user : null;
  const item = await getItemDetail(id, user);

  return {
    success: true,
    data: item,
  };
};

const deleteItemController = async (ctx) => {
  return deleteItemPost({
    ctx,
    itemId: ctx.data.id,
  });
};

const likeItemController = async (ctx) =>
  interactItemPost({
    itemId: ctx.data.id,
    user: ctx.state.user,
    action: "like",
  });

const recommendItemController = async (ctx) =>
  interactItemPost({
    itemId: ctx.data.id,
    user: ctx.state.user,
    action: "recommend",
  });

const shareItemController = async (ctx) =>
  interactItemPost({
    itemId: ctx.data.id,
    user: ctx.state.user,
    action: "share",
  });

const createItemController = async (ctx) => {
  return createItemPost({
    ctx,
    payload: ctx.data,
  });
};

const updateItemController = async (ctx) => {
  return updateItemPost({
    ctx,
    itemId: ctx.data.id,
    payload: ctx.data,
  });
};

module.exports = {
  listItemsController,
  getItemDetailController,
  createItemController,
  updateItemController,
  deleteItemController,
  likeItemController,
  recommendItemController,
  shareItemController,
};
