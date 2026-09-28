// PUT /api/nav/links/:id —— 后台编辑链接
import { createError, readBody, getRouterParam } from 'h3';
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';
import { requireAdmin } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, 'id');
  const body = await readBody(event);
  await getDb();
  const Link = getModel('NavLink');
  const doc = await Link.findById(id);
  if (!doc) throw createError({ statusCode: 404, message: '链接不存在' });
  if (body.name !== undefined) doc.name = String(body.name).trim();
  if (body.url !== undefined) doc.url = String(body.url).trim();
  if (body.catelog !== undefined) doc.catelog = body.catelog || '';
  if (body.group !== undefined) doc.group = body.group || '';
  if (body.desc !== undefined) doc.desc = String(body.desc || '');
  if (body.sort !== undefined) doc.sort = Number(body.sort) || 0;
  if (body.status !== undefined) doc.status = body.status;
  await doc.save();
  return { ok: true, link: { ...doc.toObject(), _id: doc._id.toString() } };
});
