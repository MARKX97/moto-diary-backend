#!/usr/bin/env node
/**
 * 一次性导入车型目录到 CloudBase `vehicle_catalog` 集合。
 *
 * 用法:
 *   node scripts/import-catalog.js --env <TCB_ENV_ID> --file crawler_output/models_by_brand.json
 *
 * 依赖:
 *   npm i @cloudbase/node-sdk
 */
const fs = require("fs");
const path = require("path");
const tcb = require("@cloudbase/node-sdk");

const argv = process.argv.slice(2);
const getArg = (name) => {
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 ? argv[idx + 1] : null;
};

const envId = getArg("env");
const filePath = getArg("file");
if (!envId || !filePath) {
  console.error("Usage: node scripts/import-catalog.js --env <TCB_ENV_ID> --file <models_by_brand.json>");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));

// 支持两种输入：
// 1) 扁平数组 [{brand,...,hotRank?}, ...]
// 2) 品牌映射对象 { brand1: [...], brand2: [...] }
let records = [];
let brandCount = 0;

if (Array.isArray(raw)) {
  // 扁平数组：若缺少 hotRank，则按品牌分组重新生成
  const grouped = raw.reduce((acc, item) => {
    if (!item || !item.brand) return acc;
    acc[item.brand] = acc[item.brand] || [];
    acc[item.brand].push(item);
    return acc;
  }, {});
  let brandRank = 0;
  brandCount = Object.keys(grouped).length;
  for (const brand of Object.keys(grouped)) {
    brandRank += 1;
    grouped[brand].forEach((m, idx) => {
      const hotRank = m.hotRank || brandRank * 10000 + (idx + 1);
      records.push({
        brand,
        model: m.model,
        displacement: m.displacement || "",
        type: m.type || "",
        image_url: m.image_url || "",
        model_id: m.model_id || "",
        sale_state: m.sale_state || "",
        detail_url: m.detail_url || "",
        hotRank,
      });
    });
  }
} else {
  // 品牌映射对象
  let brandRank = 0;
  brandCount = Object.keys(raw).length;
  for (const brand of Object.keys(raw)) {
    brandRank += 1;
    const models = Array.isArray(raw[brand]) ? raw[brand] : [];
    models.forEach((m, idx) => {
      const hotRank = brandRank * 10000 + (idx + 1);
      records.push({
        brand,
        model: m.model,
        displacement: m.displacement || "",
        type: m.type || "",
        image_url: m.image_url || "",
        model_id: m.model_id || "",
        sale_state: m.sale_state || "",
        detail_url: m.detail_url || "",
        hotRank,
      });
    });
  }
}


console.log(`Flattened records: ${records.length}, brands: ${brandCount}`);

const app = tcb.init({ env: envId });
const db = app.database();
const collection = db.collection("vehicle_catalog");

const BATCH_SIZE = 100;
const MAX_RETRY = 3;
const summary = {
  inserted: 0,
  updated: 0,
  skipped: 0,
};

async function ensureCollectionExists() {
  try {
    await db.createCollection("vehicle_catalog");
    console.log("collection vehicle_catalog created");
  } catch (err) {
    // 如果已存在，CloudBase 返回 ResourceInUse.Collection，忽略即可
    const msg = err && err.message ? String(err.message) : "";
    if (!/ResourceInUse\.Collection/.test(msg)) {
      throw err;
    }
  }
}

async function upsertOne(doc) {
  if (!doc.model_id) {
    summary.skipped += 1;
    return;
  }
  const existing = await collection.where({ model_id: doc.model_id }).limit(1).get();
  if (existing.data && existing.data.length > 0) {
    await collection.doc(existing.data[0]._id).update(doc);
    summary.updated += 1;
    return;
  }
  await collection.add(doc);
  summary.inserted += 1;
}

async function batchUpsert(batch) {
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      for (const doc of batch) {
        await upsertOne(doc);
      }
      console.log(
        `Processed ${batch.length} docs (inserted=${summary.inserted}, updated=${summary.updated}, skipped=${summary.skipped})`
      );
      return;
    } catch (err) {
      console.warn(`Insert failed attempt ${attempt}/${MAX_RETRY}: ${err.message || err}`);
      if (attempt === MAX_RETRY) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function main() {
  await ensureCollectionExists();
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const slice = records.slice(i, i + BATCH_SIZE);
    await batchUpsert(slice);
  }
  console.log(
    `Import completed. inserted=${summary.inserted}, updated=${summary.updated}, skipped=${summary.skipped}`
  );
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
