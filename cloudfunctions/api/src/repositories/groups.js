const { getDb, addDoc, updateDoc, updateQuery, getUpdatedCount } = require("../utils/db");

const GROUPS_COLLECTION = "groups";

const getGroupsCollection = () => getDb().collection(GROUPS_COLLECTION);

const listActiveGroups = async ({ page, pageSize }) => {
  const query = getGroupsCollection().where({ status: "active" }).orderBy("createdAt", "desc");
  const skip = (page - 1) * pageSize;
  const [countRes, listRes] = await Promise.all([query.count(), query.skip(skip).limit(pageSize).get()]);
  return {
    total: countRes && Number.isFinite(countRes.total) ? countRes.total : 0,
    list: Array.isArray(listRes && listRes.data) ? listRes.data : [],
  };
};

const listAllActiveGroups = async () => {
  const query = getGroupsCollection().where({ status: "active" }).orderBy("createdAt", "desc");
  const countRes = await query.count();
  const total = countRes && Number.isFinite(countRes.total) ? countRes.total : 0;
  const batchSize = 200;
  const list = [];
  for (let skip = 0; skip < total; skip += batchSize) {
    const res = await query.skip(skip).limit(batchSize).get();
    const rows = Array.isArray(res && res.data) ? res.data : [];
    list.push(...rows);
  }
  return list;
};

const getGroupById = async (id) => {
  const res = await getGroupsCollection().doc(id).get();
  if (!res) return null;
  if (res.data && !Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data)) return res.data[0] || null;
  return null;
};

const createGroup = async (doc) => {
  const res = await addDoc(getGroupsCollection(), doc);
  const id = res && (res.id || res._id) ? res.id || res._id : null;
  if (!id) return null;
  return getGroupById(id);
};

const updateGroupById = async (id, updates) => {
  await updateDoc(getGroupsCollection().doc(id), updates);
  return getGroupById(id);
};

const updateGroupByIdIfUnchanged = async (id, compareUpdatedAt, updates) => {
  if (!compareUpdatedAt) {
    await updateDoc(getGroupsCollection().doc(id), updates);
    return true;
  }
  const res = await updateQuery(
    getGroupsCollection().where({
      _id: id,
      updatedAt: compareUpdatedAt,
    }),
    updates
  );
  return getUpdatedCount(res) > 0;
};

module.exports = {
  listActiveGroups,
  listAllActiveGroups,
  getGroupById,
  createGroup,
  updateGroupById,
  updateGroupByIdIfUnchanged,
};
