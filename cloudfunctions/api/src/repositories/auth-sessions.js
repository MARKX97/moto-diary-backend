const { getDb, addDoc, updateDoc, updateQuery, getUpdatedCount } = require("../utils/db");

const REFRESH_SESSIONS_COLLECTION = "auth_refresh_sessions";
const REVOKED_ACCESS_TOKENS_COLLECTION = "auth_revoked_access_tokens";
const WRITE_RETRY_TIMES = 5;

const getRefreshSessionsCollection = () => getDb().collection(REFRESH_SESSIONS_COLLECTION);
const getRevokedAccessTokensCollection = () => getDb().collection(REVOKED_ACCESS_TOKENS_COLLECTION);

const pickRows = (res) => (Array.isArray(res && res.data) ? res.data : []);
const pickId = (res) => (res && (res.id || res._id) ? res.id || res._id : null);

const isDuplicateError = (err) => {
  const text = err && err.message ? String(err.message) : "";
  return /DuplicateKey|dup key|E11000/i.test(text);
};

const findRefreshSessionByHash = async (tokenHash) => {
  const res = await getRefreshSessionsCollection().where({ tokenHash }).limit(1).get();
  const rows = pickRows(res);
  return rows[0] || null;
};

const createRefreshSession = async ({ tokenHash, userId, claims, expiresAt, status = "active" }) => {
  const now = new Date().toISOString();
  const res = await addDoc(getRefreshSessionsCollection(), {
    tokenHash,
    userId,
    claims,
    status,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
  return pickId(res);
};

const markRefreshSessionStatusById = async (id, status, extra = {}) => {
  if (!id) return false;
  await updateDoc(getRefreshSessionsCollection().doc(id), {
    status,
    ...extra,
    updatedAt: new Date().toISOString(),
  });
  return true;
};

const markRefreshSessionRotatedIfActive = async ({ id, updatedAt, rotatedTo }) => {
  if (!id || !updatedAt) return false;
  const res = await updateQuery(
    getRefreshSessionsCollection().where({
      _id: id,
      status: "active",
      updatedAt,
    }),
    {
      status: "rotated",
      rotatedTo,
      updatedAt: new Date().toISOString(),
    }
  );
  return getUpdatedCount(res) > 0;
};

const revokeRefreshSessionsByUserId = async (userId) => {
  if (!userId) return 0;
  const res = await updateQuery(
    getRefreshSessionsCollection().where({
      userId,
      status: "active",
    }),
    {
      status: "revoked",
      updatedAt: new Date().toISOString(),
    }
  );
  return getUpdatedCount(res);
};

const findRevokedAccessTokenByJti = async (jti) => {
  const res = await getRevokedAccessTokensCollection().where({ jti }).limit(1).get();
  const rows = pickRows(res);
  return rows[0] || null;
};

const createRevokedAccessToken = async ({ jti, expiresAt }) => {
  const now = new Date().toISOString();
  const res = await addDoc(getRevokedAccessTokensCollection(), {
    jti,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
  return pickId(res);
};

const upsertRevokedAccessToken = async ({ jti, expiresAt }) => {
  for (let attempt = 0; attempt < WRITE_RETRY_TIMES; attempt += 1) {
    const current = await findRevokedAccessTokenByJti(jti);
    if (!current) {
      try {
        await createRevokedAccessToken({ jti, expiresAt });
        return true;
      } catch (err) {
        if (!isDuplicateError(err)) {
          throw err;
        }
      }
      continue;
    }

    const res = await updateQuery(
      getRevokedAccessTokensCollection().where({
        _id: current._id,
        updatedAt: current.updatedAt,
      }),
      {
        expiresAt,
        updatedAt: new Date().toISOString(),
      }
    );
    if (getUpdatedCount(res) > 0) {
      return true;
    }
  }

  return false;
};

module.exports = {
  findRefreshSessionByHash,
  createRefreshSession,
  markRefreshSessionStatusById,
  markRefreshSessionRotatedIfActive,
  revokeRefreshSessionsByUserId,
  findRevokedAccessTokenByJti,
  upsertRevokedAccessToken,
};
