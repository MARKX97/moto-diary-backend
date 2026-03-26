const { getDb, addDoc } = require("../utils/db");

const NOTIFICATIONS_COLLECTION = "notifications";

const getNotificationsCollection = () => getDb().collection(NOTIFICATIONS_COLLECTION);

const createNotification = async (doc) => {
  return addDoc(getNotificationsCollection(), doc);
};

module.exports = {
  createNotification,
};
