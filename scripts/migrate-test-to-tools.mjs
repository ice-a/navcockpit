// 一次性数据迁移：把旧的「test」数据库里的 6 个集合搬到当前项目连接的数据库（tools 文档集合所在库）。
// 用法：
//   OLD_MONGODB_URI="mongodb+srv://.../test" node scripts/migrate-test-to-tools.mjs
//   OLD_MONGODB_URI="..." OLD_DB_NAME=test DST_DB_NAME=tools node scripts/migrate-test-to-tools.mjs
//   --dry  仅统计源库条数，不写入
//
// 集合名（mongoose 默认复数）：stations / tools / skills / vpns / servers / tutorials。
import mongoose from 'mongoose';

const SRC_URI = process.env.OLD_MONGODB_URI;
const DST_URI = process.env.MONGODB_URI;
const SRC_DB = process.env.OLD_DB_NAME || 'test';
const DST_DB = process.env.DST_DB_NAME || '';
const DRY = process.argv.includes('--dry');

const COLLS = ['stations', 'tools', 'skills', 'vpns', 'servers', 'tutorials'];

if (!SRC_URI || !DST_URI) {
  console.error('需要 OLD_MONGODB_URI 与 MONGODB_URI 两个环境变量。');
  process.exit(1);
}

const srcCon = await mongoose.createConnection(SRC_URI).asPromise();
const dstCon = await mongoose.createConnection(DST_URI).asPromise();
const srcDb = SRC_DB ? srcCon.client.db(SRC_DB) : srcCon.db;
const dstDb = DST_DB ? dstCon.client.db(DST_DB) : dstCon.db;

for (const c of COLLS) {
  const from = srcDb.collection(c);
  const to = dstDb.collection(c);
  const docs = await from.find({}).toArray();
  console.log(`[${c}] 源库 ${docs.length} 条`);
  if (DRY || !docs.length) continue;
  let n = 0;
  for (const d of docs) {
    await to.updateOne({ _id: d._id }, { $set: d }, { upsert: true });
    n++;
  }
  console.log(`  → 已 upsert ${n} 条到目标库`);
}

await srcCon.close();
await dstCon.close();
console.log(DRY ? '\n（dry-run 结束，未写入）' : '\n迁移完成。');
