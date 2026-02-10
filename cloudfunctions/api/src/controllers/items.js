const listItemsController = async (ctx) => {
  const { page, pageSize, sort } = ctx.data;
  // 占位：后续接入 DB 查询与排序
  return {
    success: true,
    data: {
      list: [],
      meta: {
        total: 0,
        page,
        pageSize,
        sort,
      },
    },
  };
};

module.exports = { listItemsController };
