const { listItems, getItemDetail, createItemPost, updateItemPost } = require("../services/items");

const listItemsController = async (ctx) => {
  const { page, pageSize, sort, lat, lng, city, type, tag } = ctx.data;
  const result = await listItems({
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
        ...(ctx.state && ctx.state.anonQuota ? { anonQuota: ctx.state.anonQuota } : {}),
      },
    },
  };
};

const getItemDetailController = async (ctx) => {
  const { id } = ctx.data;
  const userId = ctx.state && ctx.state.user ? ctx.state.user.id : null;
  const item = await getItemDetail(id, userId);

  return {
    success: true,
    data: item,
  };
};

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

module.exports = { listItemsController, getItemDetailController, createItemController, updateItemController };
