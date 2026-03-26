const AVATAR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TEMP_URL_MAX_AGE_SEC = 24 * 60 * 60;
const TEMP_URL_BATCH_SIZE = 50;

const avatarUrlCache = new Map();
let cachedStorageClient = null;
let cachedStorageMode = "";
let customTempFileUrlFetcher = null;

const isLocalDev = () => process.env.IS_LOCAL_DEV === "true";

const toTrimmedString = (value) => (typeof value === "string" ? value.trim() : "");

const isCloudFileId = (value) => toTrimmedString(value).startsWith("cloud://");

const splitToBatches = (list, size) => {
  const batches = [];
  for (let i = 0; i < list.length; i += size) {
    batches.push(list.slice(i, i + size));
  }
  return batches;
};

const pruneAvatarCache = () => {
  const now = Date.now();
  for (const [fileId, cached] of avatarUrlCache.entries()) {
    if (!cached || !cached.expiresAt || cached.expiresAt <= now) {
      avatarUrlCache.delete(fileId);
    }
  }
};

const readCachedAvatarUrl = (fileId) => {
  const cached = avatarUrlCache.get(fileId);
  if (!cached || !cached.url || !cached.expiresAt || cached.expiresAt <= Date.now()) {
    avatarUrlCache.delete(fileId);
    return "";
  }
  return cached.url;
};

const writeCachedAvatarUrl = (fileId, url) => {
  avatarUrlCache.set(fileId, {
    url,
    expiresAt: Date.now() + AVATAR_CACHE_TTL_MS,
  });
};

const initWxStorageClient = () => {
  // eslint-disable-next-line global-require
  const cloud = require("wx-server-sdk");
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  return {
    mode: "wx",
    getTempFileURL: (fileIds) =>
      cloud.getTempFileURL({
        fileList: fileIds.map((fileID) => ({ fileID, maxAge: TEMP_URL_MAX_AGE_SEC })),
      }),
  };
};

const initNodeStorageClient = () => {
  // eslint-disable-next-line global-require
  const tcb = require("@cloudbase/node-sdk");
  const app = tcb.init({
    env: process.env.TCB_ENV_ID,
    secretId: process.env.TCB_SECRET_ID,
    secretKey: process.env.TCB_SECRET_KEY,
  });
  return {
    mode: "node",
    getTempFileURL: (fileIds) =>
      app.getTempFileURL({
        fileList: fileIds.map((fileID) => ({ fileID, maxAge: TEMP_URL_MAX_AGE_SEC })),
      }),
  };
};

const getStorageClientFactories = () => {
  if (isLocalDev()) {
    return [initNodeStorageClient, initWxStorageClient];
  }
  return [initWxStorageClient, initNodeStorageClient];
};

const getStorageClientCandidates = () => {
  const candidates = [];
  if (cachedStorageClient) {
    candidates.push(cachedStorageClient);
  }
  getStorageClientFactories().forEach((factory) => {
    try {
      const client = factory();
      if (!client || !client.mode) return;
      const duplicated = candidates.some((candidate) => candidate.mode === client.mode);
      if (!duplicated) {
        candidates.push(client);
      }
    } catch (_err) {
      // Ignore init error and try next storage client.
    }
  });
  return candidates;
};

const parseTempFileURLResponse = (result) => {
  const map = new Map();
  const fileList = Array.isArray(result && result.fileList) ? result.fileList : [];

  fileList.forEach((item) => {
    const fileId = toTrimmedString(item && item.fileID);
    const tempUrl = toTrimmedString(item && item.tempFileURL);
    const status = Number(item && item.status);
    if (!fileId || !tempUrl) return;
    if (Number.isFinite(status) && status !== 0) return;
    map.set(fileId, tempUrl);
  });

  return map;
};

const fetchTempAvatarUrlMap = async (fileIds = [], log) => {
  if (!fileIds.length) return new Map();

  if (typeof customTempFileUrlFetcher === "function") {
    return customTempFileUrlFetcher(fileIds);
  }

  const clients = getStorageClientCandidates();
  for (const client of clients) {
    try {
      const map = new Map();
      const batches = splitToBatches(fileIds, TEMP_URL_BATCH_SIZE);
      for (const batch of batches) {
        // eslint-disable-next-line no-await-in-loop
        const result = await client.getTempFileURL(batch);
        const parsed = parseTempFileURLResponse(result);
        parsed.forEach((url, fileId) => {
          map.set(fileId, url);
        });
      }
      cachedStorageClient = client;
      cachedStorageMode = client.mode;
      return map;
    } catch (err) {
      if (cachedStorageMode && client.mode === cachedStorageMode) {
        cachedStorageClient = null;
        cachedStorageMode = "";
      }
      if (log && typeof log.warn === "function") {
        log.warn("Avatar temp URL resolve failed with storage client", {
          mode: client.mode || "",
          errorName: err && err.name ? err.name : "",
          errorMessage: err && err.message ? String(err.message) : "",
        });
      }
    }
  }

  return new Map();
};

const resolveAvatarUrlMap = async (fileIds = [], log) => {
  pruneAvatarCache();
  const resolved = new Map();
  const missing = [];

  fileIds.forEach((fileId) => {
    const cachedUrl = readCachedAvatarUrl(fileId);
    if (cachedUrl) {
      resolved.set(fileId, cachedUrl);
    } else {
      missing.push(fileId);
    }
  });

  if (!missing.length) return resolved;

  const fetched = await fetchTempAvatarUrlMap(missing, log);
  fetched.forEach((url, fileId) => {
    resolved.set(fileId, url);
    writeCachedAvatarUrl(fileId, url);
  });

  return resolved;
};

const collectAvatarTargets = (node, targets, visited) => {
  if (!node || typeof node !== "object") return;
  if (visited.has(node)) return;
  visited.add(node);

  if (Array.isArray(node)) {
    node.forEach((entry) => collectAvatarTargets(entry, targets, visited));
    return;
  }

  Object.keys(node).forEach((key) => {
    const value = node[key];

    if (key === "avatar" && typeof value === "string") {
      targets.push({
        container: node,
        key: "avatar",
        fileIdKey: "avatarFileId",
      });
    }

    if (key === "memberAvatars" && Array.isArray(value)) {
      value.forEach((entry, index) => {
        if (typeof entry === "string") {
          targets.push({
            container: value,
            key: index,
          });
        }
      });
    }

    collectAvatarTargets(value, targets, visited);
  });
};

const resolveAvatarUrlsInPayload = async (payload, { log } = {}) => {
  if (!payload || typeof payload !== "object") return payload;

  const targets = [];
  collectAvatarTargets(payload, targets, new Set());
  if (!targets.length) return payload;

  const fileIds = Array.from(
    new Set(
      targets
        .map((target) => toTrimmedString(target.container[target.key]))
        .filter((avatar) => isCloudFileId(avatar))
    )
  );
  if (!fileIds.length) return payload;

  const urlMap = await resolveAvatarUrlMap(fileIds, log);
  targets.forEach((target) => {
    const current = toTrimmedString(target.container[target.key]);
    if (!isCloudFileId(current)) return;
    const nextAvatar = urlMap.get(current) || current;
    target.container[target.key] = nextAvatar;
    if (target.fileIdKey && !Array.isArray(target.container)) {
      target.container[target.fileIdKey] = current;
    }
  });

  return payload;
};

const __setTempFileUrlFetcherForTest = (fetcher) => {
  customTempFileUrlFetcher = fetcher;
};

const __resetAvatarResolverCacheForTest = () => {
  avatarUrlCache.clear();
  cachedStorageClient = null;
  cachedStorageMode = "";
  customTempFileUrlFetcher = null;
};

module.exports = {
  isCloudFileId,
  resolveAvatarUrlsInPayload,
  __setTempFileUrlFetcherForTest,
  __resetAvatarResolverCacheForTest,
};
