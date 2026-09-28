// DELETE /api/nav/links/:id —— 后台删除链接
import { createError, getRouterParam } from 'h3';
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';
import { requireAdmin } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, 'id');
  await getDb();
  const Link = getModel('NavLink');
  const doc = await Link.findByIdAndDelete(id);
  if (!doc) throw createError({ statusCode: 404, message: '链接不存在' });
  return { ok: true };
});
