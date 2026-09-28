// POST /api/nav/categories/reorder —— 后台批量保存分类排序。
// body: { order: [{ key, sort }] }，按数组顺序覆盖 sort 字段。
import { createError, readBody } from 'h3';
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';
import { requireAdmin } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody(event);
  if (!body || !Array.isArray(body.order)) throw createError({ statusCode: 400, message: 'order 必须为数组' });
  await getDb();
  const Category = getModel('NavCategory');
  // 逐条更新 sort（数量不大；跨组拖拽时一并更新 group）
  const ops = body.order
    .filter((o) => o && o.key)
    .map((o) => {
      const set = { sort: Number(o.sort) || 0 };
      if (o.group !== undefined) set.group = o.group;
      return { updateOne: { filter: { key: o.key }, update: { $set: set } } };
    });
  if (ops.length) await Category.bulkWrite(ops);
  return { ok: true, updated: ops.length };
});
