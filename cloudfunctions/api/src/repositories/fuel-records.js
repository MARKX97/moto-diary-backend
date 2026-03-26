const { getDb, addDoc, updateDoc } = require("../utils/db");

const FUEL_RECORDS_COLLECTION = "fuelRecords";

const getFuelRecordsCollection = () => getDb().collection(FUEL_RECORDS_COLLECTION);

const listFuelRecordsByOwner = async ({ ownerId, vehicleId, page, pageSize }) => {
  const where = { ownerId };
  if (vehicleId) {
    where.vehicleId = vehicleId;
  }
  const query = getFuelRecordsCollection().where(where).orderBy("createdAt", "desc");
  const skip = (page - 1) * pageSize;
  const [countRes, listRes] = await Promise.all([query.count(), query.skip(skip).limit(pageSize).get()]);
  return {
    total: countRes && Number.isFinite(countRes.total) ? countRes.total : 0,
    list: Array.isArray(listRes && listRes.data) ? listRes.data : [],
  };
};

const getFuelRecordById = async (id) => {
  const res = await getFuelRecordsCollection().doc(id).get();
  if (!res) return null;
  if (res.data && !Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.data)) return res.data[0] || null;
  return null;
};

const createFuelRecord = async (doc) => {
  const res = await addDoc(getFuelRecordsCollection(), doc);
  const id = res && (res.id || res._id) ? res.id || res._id : null;
  if (!id) return null;
  return getFuelRecordById(id);
};

const updateFuelRecordById = async (id, updates) => {
  await updateDoc(getFuelRecordsCollection().doc(id), updates);
  return getFuelRecordById(id);
};

const deleteFuelRecordById = async (id) => {
  await getFuelRecordsCollection().doc(id).remove();
  return true;
};

const listRecentFuelRecordsByVehicle = async (vehicleId, limit = 5) => {
  const res = await getFuelRecordsCollection()
    .where({ vehicleId })
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return Array.isArray(res && res.data) ? res.data : [];
};

module.exports = {
  listFuelRecordsByOwner,
  getFuelRecordById,
  createFuelRecord,
  updateFuelRecordById,
  deleteFuelRecordById,
  listRecentFuelRecordsByVehicle,
};
