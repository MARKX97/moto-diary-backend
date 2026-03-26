const { getDb, addDoc, updateDoc } = require("../utils/db");

const VEHICLES_COLLECTION = "vehicles";

const getVehiclesCollection = () => getDb().collection(VEHICLES_COLLECTION);

const listVehiclesByOwner = async ({ ownerId, page, pageSize }) => {
  const query = getVehiclesCollection().where({ ownerId }).orderBy("createdAt", "desc");
  const skip = (page - 1) * pageSize;
  const [countRes, listRes] = await Promise.all([query.count(), query.skip(skip).limit(pageSize).get()]);
  return {
    total: countRes && Number.isFinite(countRes.total) ? countRes.total : 0,
    list: Array.isArray(listRes && listRes.data) ? listRes.data : [],
  };
};

const getVehicleById = async (id) => {
  const res = await getVehiclesCollection().doc(id).get();
  if (!res) return null;
  if (res.data && !Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data)) return res.data[0] || null;
  return null;
};

const createVehicle = async (doc) => {
  const res = await addDoc(getVehiclesCollection(), doc);
  const id = res && (res.id || res._id) ? res.id || res._id : null;
  if (!id) return null;
  return getVehicleById(id);
};

const updateVehicleById = async (id, updates) => {
  await updateDoc(getVehiclesCollection().doc(id), updates);
  return getVehicleById(id);
};

const deleteVehicleById = async (id) => {
  await getVehiclesCollection().doc(id).remove();
  return true;
};

module.exports = {
  listVehiclesByOwner,
  getVehicleById,
  createVehicle,
  updateVehicleById,
  deleteVehicleById,
};
