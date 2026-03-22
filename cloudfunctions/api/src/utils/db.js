let cachedDb = null;
let cachedMode = null;

const initWxServerSdkDb = () => {
  // Prefer cloud function native SDK in Tencent Cloud runtime.
  // eslint-disable-next-line global-require
  const cloud = require("wx-server-sdk");
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  cachedMode = "wx";
  return cloud.database();
};

const initCloudbaseNodeSdkDb = () => {
  // Local fallback: use Node SDK against CloudBase.
  // eslint-disable-next-line global-require
  const tcb = require("@cloudbase/node-sdk");
  const app = tcb.init({
    env: process.env.TCB_ENV_ID,
    secretId: process.env.TCB_SECRET_ID,
    secretKey: process.env.TCB_SECRET_KEY,
  });
  cachedMode = "node";
  return app.database();
};

const getDb = () => {
  if (cachedDb) return cachedDb;

  try {
    cachedDb = initWxServerSdkDb();
    return cachedDb;
  } catch (_err) {
    cachedDb = initCloudbaseNodeSdkDb();
    return cachedDb;
  }
};

const getDbMode = () => {
  if (!cachedDb) {
    getDb();
  }
  return cachedMode || "node";
};

const addDoc = async (collection, doc) => {
  if (getDbMode() === "wx") {
    return collection.add({ data: doc });
  }
  return collection.add(doc);
};

const updateDoc = async (docRef, updates) => {
  if (getDbMode() === "wx") {
    return docRef.update({ data: updates });
  }
  return docRef.update(updates);
};

const updateQuery = async (queryRef, updates) => {
  if (getDbMode() === "wx") {
    return queryRef.update({ data: updates });
  }
  return queryRef.update(updates);
};

const getUpdatedCount = (result) => {
  if (!result || typeof result !== "object") return 0;
  if (Number.isFinite(result.updated)) return Number(result.updated);
  if (result.stats && Number.isFinite(result.stats.updated)) return Number(result.stats.updated);
  return 0;
};

const buildPrefixRegExp = (value, options = "i") => {
  const db = getDb();
  if (db && typeof db.RegExp === "function") {
    return db.RegExp({
      regexp: `^${String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      options,
    });
  }
  return undefined;
};

module.exports = {
  getDb,
  getDbMode,
  addDoc,
  updateDoc,
  updateQuery,
  getUpdatedCount,
  buildPrefixRegExp,
};
