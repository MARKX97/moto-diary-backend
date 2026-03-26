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

const toRank = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const rankForSort = (value) => (value === null ? Number.MAX_SAFE_INTEGER : value);

const listCatalogBrands = async ({ keyword, page, pageSize }) => {
  const where = {};
  if (keyword) {
    const regexp = buildPrefixRegExp(keyword, "i");
    if (regexp) {
      where.brand = regexp;
    }
  }

  const query = getCatalogCollection().where(where).orderBy("hotRank", "asc");
  const countRes = await query.count();
  const totalDocs = countRes && Number.isFinite(countRes.total) ? countRes.total : 0;
  const batchSize = 200;
  const brandMap = new Map();

  for (let skip = 0; skip < totalDocs; skip += batchSize) {
    const res = await query.skip(skip).limit(batchSize).get();
    const rows = Array.isArray(res && res.data) ? res.data : [];
    rows.forEach((row) => {
      const brand = row && typeof row.brand === "string" ? row.brand : "";
      if (!brand) return;
      const rank = toRank(row.hotRank);
      const existing = brandMap.get(brand);
      if (!existing) {
        brandMap.set(brand, {
          brand,
          topHotRank: rank,
          modelCount: 1,
        });
        return;
      }
      existing.modelCount += 1;
      if (rankForSort(rank) < rankForSort(existing.topHotRank)) {
        existing.topHotRank = rank;
      }
    });
  }

  const allBrands = Array.from(brandMap.values()).sort(
    (a, b) => rankForSort(a.topHotRank) - rankForSort(b.topHotRank) || String(a.brand).localeCompare(String(b.brand))
  );
  const skip = (page - 1) * pageSize;
  return {
    total: allBrands.length,
    list: allBrands.slice(skip, skip + pageSize),
  };
};

module.exports = {
  listCatalog,
  listCatalogBrands,
};
