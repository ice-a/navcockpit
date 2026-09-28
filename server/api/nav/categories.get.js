// GET /api/nav/categories —— 公开列出所有分类（按 group、sort 排序）
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';

export default defineEventHandler(async () => {
  await getDb();
  const Category = getModel('NavCategory');
  const list = await Category.find({ status: { $ne: 'inactive' } }).sort({ group: 1, sort: 1, name: 1 }).lean();
  return list.map((c) => ({ ...c, _id: c._id.toString() }));
});
