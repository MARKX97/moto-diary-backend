let cachedDb = null;

const initWxServerSdkDb = () => {
  // Prefer cloud function native SDK in Tencent Cloud runtime.
  // eslint-disable-next-line global-require
  const cloud = require("wx-server-sdk");
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
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

module.exports = {
  getDb,
};
