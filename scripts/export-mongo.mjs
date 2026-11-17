// 一次性迁移工具：把 MongoDB 里的导航 / AI 资源台数据导出为本地 JSON。
// 用法：node scripts/export-mongo.mjs [输出目录，默认 ./data-export]
// 安全：Station.apiKey 等敏感字段在导出时被剔除，不会落盘。
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
// 用法：node scripts/export-mongo.mjs [输出目录] [.env 路径]
const outDir = path.resolve(process.argv[2] || path.join(root, 'data-export'));
const envFile = path.resolve(process.argv[3] || path.join(root, '.env'));

function readEnv() {
  const raw = fsSync.readFileSync(envFile, 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    env[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return env;
}

// 集合名（mongoose 默认复数化后的实际名字）
const COLLS = [
  'hubboards',
  'hubitems',
  'stations',
  'tools',
  'skills',
  'vpns',
  'servers',
  'tutorials',
  'navcategories',
  'navlinks',
  'creators',
];

// 不同集合的敏感字段：导出前删除
const SECRET_FIELDS = ['apiKey'];

const env = readEnv();
if (!env.MONGODB_URI) {
  console.error('未找到 MONGODB_URI');
  process.exit(1);
}

await fs.mkdir(outDir, { recursive: true });
await mongoose.connect(env.MONGODB_URI, {
  dbName: env.MONGODB_DB_NAME || 'tools',
  serverSelectionTimeoutMS: 15000,
});

const summary = {};
for (const name of COLLS) {
  const coll = mongoose.connection.db.collection(name);
  const docs = await coll.find({}).toArray();
  for (const d of docs) {
    for (const f of SECRET_FIELDS) delete d[f];
  }
  await fs.writeFile(path.join(outDir, `${name}.json`), JSON.stringify(docs, null, 2), 'utf8');
  summary[name] = docs.length;
}
console.log('导出完成 →', outDir);
console.table(summary);

await mongoose.disconnect();
