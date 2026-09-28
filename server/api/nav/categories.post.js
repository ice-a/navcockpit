// POST /api/nav/categories —— 后台新增分类 { key?, name, group?, icon?, sort? }
import { createError, readBody } from 'h3';
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';
import { requireAdmin } from '~/server/utils/auth';

function slugify(s) {
  const base = String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'cat-' + Date.now().toString(36);
}

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody(event);
  if (!body || !body.name) throw createError({ statusCode: 400, message: '分类名称不能为空' });
  await getDb();
  const Category = getModel('NavCategory');
  const key = (body.key || slugify(body.name)).trim();
  const exist = await Category.findOne({ key });
  if (exist) throw createError({ statusCode: 409, message: `分类标识「${key}」已存在` });
  const doc = await Category.create({
    key,
    name: body.name.trim(),
    group: body.group || '其他',
    icon: body.icon || '',
    sort: Number(body.sort) || 0,
    status: 'active',
  });
  return { ok: true, category: { ...doc.toObject(), _id: doc._id.toString() } };
});
