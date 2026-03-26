#!/usr/bin/env node
/**
 * One-off migration: copy documents from `items` to `posts` while preserving `_id`.
 *
 * Usage:
 *   node scripts/migrate-items-to-posts.js --env <TCB_ENV_ID>
 *   node scripts/migrate-items-to-posts.js --env <TCB_ENV_ID> --dry-run
 *   node scripts/migrate-items-to-posts.js --env <TCB_ENV_ID> --source items --target posts
 */
const tcb = require("@cloudbase/node-sdk");

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const getArg = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  return argv[index + 1] || fallback;
};

const normalizeSecret = (value) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const toPositiveInt = (value, fallback) => {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return fallback;
  return num;
};

const envId = getArg("env", process.env.TCB_ENV_ID);
const sourceCollectionName = getArg("source", "items");
const targetCollectionName = getArg("target", "posts");
const batchSize = toPositiveInt(getArg("batch", "100"), 100);
const dryRun = hasFlag("dry-run");
const maxRetry = toPositiveInt(getArg("retry", "3"), 3);

if (!envId) {
  console.error("Usage: node scripts/migrate-items-to-posts.js --env <TCB_ENV_ID> [--dry-run]");
  process.exit(1);
}
if (sourceCollectionName === targetCollectionName) {
  console.error("source and target collection must be different");
  process.exit(1);
}

const secretId = normalizeSecret(process.env.TCB_SECRET_ID);
const secretKey = normalizeSecret(process.env.TCB_SECRET_KEY);
if (!secretId || !secretKey) {
  console.error("TCB_SECRET_ID / TCB_SECRET_KEY are required");
  process.exit(1);
}

const app = tcb.init({
  env: envId,
  secretId,
  secretKey,
});
const db = app.database();
const sourceCollection = db.collection(sourceCollectionName);
const targetCollection = db.collection(targetCollectionName);

const summary = {
  sourceTotal: 0,
  scanned: 0,
  upserted: 0,
  skippedNoId: 0,
  failed: 0,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureCollectionExists = async (name) => {
  try {
    await db.createCollection(name);
    console.log(`collection created: ${name}`);
  } catch (err) {
    const text = err && err.message ? String(err.message) : "";
    if (!/ResourceInUse\.Collection/i.test(text)) {
      throw err;
    }
  }
};

const loadSourceBatch = async ({ skip, limit }) => {
  const res = await sourceCollection.orderBy("_id", "asc").skip(skip).limit(limit).get();
  return Array.isArray(res && res.data) ? res.data : [];
};

const upsertById = async (id, doc) => {
  for (let attempt = 1; attempt <= maxRetry; attempt += 1) {
    try {
      await targetCollection.doc(id).set(doc);
      return;
    } catch (err) {
      if (attempt === maxRetry) throw err;
      await sleep(200 * attempt);
    }
  }
};

const run = async () => {
  const sourceCountRes = await sourceCollection.count();
  summary.sourceTotal = sourceCountRes && Number.isFinite(sourceCountRes.total) ? sourceCountRes.total : 0;
  console.log(
    `Migrating ${sourceCollectionName} -> ${targetCollectionName}, sourceTotal=${summary.sourceTotal}, batchSize=${batchSize}, dryRun=${dryRun}`
  );

  if (!dryRun) {
    await ensureCollectionExists(targetCollectionName);
  }

  for (let skip = 0; skip < summary.sourceTotal; skip += batchSize) {
    const rows = await loadSourceBatch({ skip, limit: batchSize });
    if (!rows.length) break;

    // Keep writes sequential to reduce write-conflict retries.
    // eslint-disable-next-line no-restricted-syntax
    for (const raw of rows) {
      summary.scanned += 1;
      const id = raw && raw._id ? String(raw._id) : "";
      if (!id) {
        summary.skippedNoId += 1;
        continue;
      }

      if (dryRun) {
        summary.upserted += 1;
        continue;
      }

      const doc = { ...raw };
      delete doc._id;
      try {
        // eslint-disable-next-line no-await-in-loop
        await upsertById(id, doc);
        summary.upserted += 1;
      } catch (err) {
        summary.failed += 1;
        console.error(`Failed doc _id=${id}: ${err && err.message ? err.message : err}`);
      }
    }

    console.log(
      `progress scanned=${summary.scanned}/${summary.sourceTotal}, upserted=${summary.upserted}, skippedNoId=${summary.skippedNoId}, failed=${summary.failed}`
    );
  }

  if (summary.failed > 0) {
    throw new Error(`migration finished with failures: ${summary.failed}`);
  }

  console.log(
    `Migration done. scanned=${summary.scanned}, upserted=${summary.upserted}, skippedNoId=${summary.skippedNoId}, failed=${summary.failed}`
  );
};

run().catch((err) => {
  console.error("Migration failed:", err && err.message ? err.message : err);
  process.exit(1);
});
