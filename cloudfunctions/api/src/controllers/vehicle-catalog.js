const { listVehicleCatalog } = require("../services/vehicle-catalog");

const listVehicleCatalogController = async (ctx) => {
  const { brand, keyword, page, pageSize } = ctx.data;
  const result = await listVehicleCatalog({ brand, keyword, page, pageSize });
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

module.exports = {
  listVehicleCatalogController,
};
