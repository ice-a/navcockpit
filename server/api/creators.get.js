// 热门 GitHub 用户：GET /api/creators
// 从本地 MongoDB 读取；若集合为空则用 public/creators.json 做种子初始化。
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDb } from '../utils/db';
import { getModel } from '../utils/models';

export default defineEventHandler(async () => {
  const Model = getModel('Creator');
  await getDb();
  let list = await Model.find().sort({ addedByUser: -1, sort: 1, login: 1 }).lean();
  if (!list.length) {
    try {
      const raw = await readFile(join(process.cwd(), 'public', 'creators.json'), 'utf8');
      const users = JSON.parse(raw).users || [];
      await Model.insertMany(
        users.map((u, i) => ({ login: u.login, note: u.note || '', addedByUser: false, sort: i })),
        { ordered: false },
      );
      list = await Model.find().sort({ addedByUser: -1, sort: 1, login: 1 }).lean();
    } catch {
      // 种子失败不影响返回空列表
    }
  }
  return list;
});
