const { listCatalog } = require("../repositories/vehicle-catalog");

const listVehicleCatalog = async ({ brand, keyword, page, pageSize }) => {
  return listCatalog({ brand, keyword, page, pageSize });
};

module.exports = {
  listVehicleCatalog,
};
