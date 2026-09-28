// DELETE /api/nav/categories/:key —— 后台删除分类；关联链接归入「未分类」
import { createError, getRouterParam } from 'h3';
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';
import { requireAdmin } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const key = getRouterParam(event, 'key');
  await getDb();
  const Category = getModel('NavCategory');
  const Link = getModel('NavLink');
  const doc = await Category.findOne({ key });
  if (!doc) throw createError({ statusCode: 404, message: '分类不存在' });
  // 关联链接退回未分类，避免悬空
  await Link.updateMany({ catelog: key }, { $set: { catelog: '', group: '' } });
  await Category.deleteOne({ key });
  return { ok: true };
});
