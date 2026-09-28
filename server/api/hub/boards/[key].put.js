// PUT /api/hub/boards/:key —— 板块改名 / 改图标 / 改排序（需管理密码）
// 内置板块也可以改名（key 不变，条目不受影响）
import { createError, readBody, getRouterParam } from 'h3';
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';
import { ensureBoards } from '~/server/utils/boards';
import { requireAdmin } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const key = getRouterParam(event, 'key');
  const body = await readBody(event);

  await getDb();
  await ensureBoards();

  const patch = {};
  if (body?.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw createError({ statusCode: 400, message: '板块名称不能为空' });
    patch.name = name;
  }
  if (body?.icon !== undefined) patch.icon = String(body.icon || '');
  if (body?.sort !== undefined) patch.sort = Number(body.sort) || 0;

  const doc = await getModel('HubBoard').findOneAndUpdate({ key }, patch, { new: true });
  if (!doc) throw createError({ statusCode: 404, message: '板块不存在' });
  return { ok: true, board: doc };
});
