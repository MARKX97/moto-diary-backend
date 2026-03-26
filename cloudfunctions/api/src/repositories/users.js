const { getDb, addDoc, updateDoc } = require("../utils/db");

const USERS_COLLECTION = "users";

const getUsersCollection = () => getDb().collection(USERS_COLLECTION);

const findUserByOpenid = async (openid) => {
  const res = await getUsersCollection().where({ openid }).limit(1).get();
  const rows = Array.isArray(res && res.data) ? res.data : [];
  return rows[0] || null;
};

const findUsersByUserIds = async (userIds = []) => {
  const normalized = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    )
  );
  if (!normalized.length) return [];

  const docs = await Promise.all(
    normalized.map(async (userId) => {
      const res = await getUsersCollection().where({ userId }).limit(1).get();
      const rows = Array.isArray(res && res.data) ? res.data : [];
      return rows[0] || null;
    })
  );

  return docs.filter(Boolean);
};

const createUser = async (doc) => {
  const res = await addDoc(getUsersCollection(), doc);
  const id = res && (res.id || res._id) ? res.id || res._id : null;
  if (!id) return null;
  const created = await getUsersCollection().doc(id).get();
  if (created && created.data && !Array.isArray(created.data)) {
    return created.data;
  }
  const rows = Array.isArray(created && created.data) ? created.data : [];
  return rows[0] || null;
};

const updateUserById = async (id, updates) => {
  await updateDoc(getUsersCollection().doc(id), updates);
  const next = await getUsersCollection().doc(id).get();
  if (next && next.data && !Array.isArray(next.data)) {
    return next.data;
  }
  const rows = Array.isArray(next && next.data) ? next.data : [];
  return rows[0] || null;
};

module.exports = {
  findUserByOpenid,
  findUsersByUserIds,
  createUser,
  updateUserById,
};
