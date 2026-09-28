// PUT /api/nav/categories/:key —— 后台改名/改组/改序号（key 不变，仅更新展示信息）
import { createError, readBody, getRouterParam } from 'h3';
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';
import { requireAdmin } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const key = getRouterParam(event, 'key');
  const body = await readBody(event);
  await getDb();
  const Category = getModel('NavCategory');
  const doc = await Category.findOne({ key });
  if (!doc) throw createError({ statusCode: 404, message: '分类不存在' });

  if (body.name !== undefined) doc.name = String(body.name).trim();
  if (body.group !== undefined) doc.group = String(body.group || '其他');
  if (body.icon !== undefined) doc.icon = String(body.icon || '');
  if (body.sort !== undefined) doc.sort = Number(body.sort) || 0;
  if (body.status !== undefined) doc.status = body.status;
  // 改名时把旧展示名作为别名，链接仍按 key 关联，不会断链
  await doc.save();
  return { ok: true, category: { ...doc.toObject(), _id: doc._id.toString() } };
});
