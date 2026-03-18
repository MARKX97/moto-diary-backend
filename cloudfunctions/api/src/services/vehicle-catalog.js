const { listCatalog, listCatalogBrands } = require("../repositories/vehicle-catalog");

const listVehicleCatalog = async ({ brand, keyword, page, pageSize }) => {
  return listCatalog({ brand, keyword, page, pageSize });
};

const listVehicleCatalogBrands = async ({ keyword, page, pageSize }) => {
  return listCatalogBrands({ keyword, page, pageSize });
};

module.exports = {
  listVehicleCatalog,
  listVehicleCatalogBrands,
};
