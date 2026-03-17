const { getDb } = require("../utils/db");

const IDEMPOTENCY_COLLECTION = "idempotency_keys";

const getCollection = () => getDb().collection(IDEMPOTENCY_COLLECTION);

const findIdempotencyRecord = async ({ key, path, userId }) => {
  const res = await getCollection().where({ key, path, userId }).limit(1).get();
  const rows = Array.isArray(res && res.data) ? res.data : [];
  return rows[0] || null;
};

const createIdempotencyRecord = async (doc) => {
  const res = await getCollection().add(doc);
  return res && (res.id || res._id) ? res.id || res._id : null;
};

const updateIdempotencyRecord = async (id, payload) => {
  if (!id) return;
  await getCollection().doc(id).update(payload);
};

module.exports = {
  findIdempotencyRecord,
  createIdempotencyRecord,
  updateIdempotencyRecord,
};
