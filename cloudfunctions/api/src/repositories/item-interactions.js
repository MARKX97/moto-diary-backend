const { getDb, addDoc } = require("../utils/db");

const ITEM_INTERACTIONS_COLLECTION = "post_interactions";

const getItemInteractionsCollection = () => getDb().collection(ITEM_INTERACTIONS_COLLECTION);

const findInteractionByKey = async (key) => {
  const res = await getItemInteractionsCollection().where({ key }).limit(1).get();
  const rows = Array.isArray(res && res.data) ? res.data : [];
  return rows[0] || null;
};

const createInteraction = async (doc) => {
  const res = await addDoc(getItemInteractionsCollection(), doc);
  return res && (res.id || res._id) ? res.id || res._id : null;
};

module.exports = {
  findInteractionByKey,
  createInteraction,
};
