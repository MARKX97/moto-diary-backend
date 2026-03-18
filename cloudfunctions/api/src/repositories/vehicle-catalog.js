const { getDb, buildPrefixRegExp } = require("../utils/db");

const CATALOG_COLLECTION = "vehicle_catalog";

const getCatalogCollection = () => getDb().collection(CATALOG_COLLECTION);

const buildCatalogConditions = ({ brand, keyword }) => {
  const where = {};
  if (brand) {
    where.brand = brand;
  }
  if (keyword) {
    const regexp = buildPrefixRegExp(keyword, "i");
    if (regexp) {
      where.model = regexp;
    }
  }
  return where;
};

const listCatalog = async ({ brand, keyword, page, pageSize }) => {
  const conditions = buildCatalogConditions({ brand, keyword });
  const query = getCatalogCollection().where(conditions).orderBy("hotRank", "asc");
  const skip = (page - 1) * pageSize;
  const [countRes, listRes] = await Promise.all([query.count(), query.skip(skip).limit(pageSize).get()]);
  return {
    total: countRes && Number.isFinite(countRes.total) ? countRes.total : 0,
    list: Array.isArray(listRes && listRes.data) ? listRes.data : [],
  };
};

module.exports = {
  listCatalog,
};
