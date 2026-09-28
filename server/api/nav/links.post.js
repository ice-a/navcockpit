// POST /api/nav/links —— 后台新增链接 { name, url, catelog?, group?, desc?, sort? }
import { createError, readBody } from 'h3';
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';
import { requireAdmin } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody(event);
  if (!body || !body.name || !body.url) throw createError({ statusCode: 400, message: '名称和链接不能为空' });
  await getDb();
  const Link = getModel('NavLink');
  const doc = await Link.create({
    name: body.name.trim(),
    url: body.url.trim(),
    catelog: body.catelog || '',
    group: body.group || '',
    desc: body.desc || '',
    sort: Number(body.sort) || 0,
    status: 'active',
  });
  return { ok: true, link: { ...doc.toObject(), _id: doc._id.toString() } };
});
