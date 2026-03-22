const { getDb, addDoc, updateDoc } = require("../utils/db");

const ITEMS_COLLECTION = "items";

const getItemsCollection = () => getDb().collection(ITEMS_COLLECTION);

const buildListConditions = ({ city, type, tag }) => {
  const conditions = {};

  if (city) {
    conditions["location.city"] = city;
  }
  if (type) {
    conditions.type = type;
  }
  if (tag) {
    conditions.tags = tag;
  }

  return conditions;
};

const queryItemsByOrder = async ({ conditions, page, pageSize, sort }) => {
  let query = getItemsCollection().where(conditions);

  if (sort === "new") {
    query = query.orderBy("createdAt", "desc");
  } else {
    query = query.orderBy("hotScore", "desc").orderBy("createdAt", "desc");
  }

  const skip = (page - 1) * pageSize;
  const [countRes, listRes] = await Promise.all([query.count(), query.skip(skip).limit(pageSize).get()]);

  return {
    total: countRes && Number.isFinite(countRes.total) ? countRes.total : 0,
    list: Array.isArray(listRes && listRes.data) ? listRes.data : [],
  };
};

const queryItemsForDistanceSort = async ({ conditions, page, pageSize, sampleSize }) => {
  const query = getItemsCollection().where(conditions).orderBy("createdAt", "desc");
  const [countRes, listRes] = await Promise.all([query.count(), query.limit(sampleSize).get()]);

  return {
    total: countRes && Number.isFinite(countRes.total) ? countRes.total : 0,
    list: Array.isArray(listRes && listRes.data) ? listRes.data : [],
    page,
    pageSize,
  };
};

const getItemById = async (id) => {
  const res = await getItemsCollection().doc(id).get();
  if (!res) return null;
  if (res.data && !Array.isArray(res.data)) {
    return res.data;
  }
  if (Array.isArray(res.data)) {
    return res.data[0] || null;
  }
  return null;
};

const createItem = async (doc) => {
  const res = await addDoc(getItemsCollection(), doc);
  const id = res && (res.id || res._id) ? res.id || res._id : null;
  if (!id) return null;
  return getItemById(id);
};

const updateItemById = async (id, updates) => {
  await updateDoc(getItemsCollection().doc(id), updates);
  return getItemById(id);
};

const deleteItemById = async (id) => {
  await getItemsCollection().doc(id).remove();
  return true;
};

module.exports = {
  buildListConditions,
  queryItemsByOrder,
  queryItemsForDistanceSort,
  getItemById,
  createItem,
  updateItemById,
  deleteItemById,
};
