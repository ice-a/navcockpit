// POST /api/hub/boards —— 新增板块（需管理密码）
// body: { key?, name, icon?, sort? }；key 省略时按名称生成
import { createError, readBody } from 'h3';
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';
import { ensureBoards, isReservedColl } from '~/server/utils/boards';
import { requireAdmin } from '~/server/utils/auth';

function slugify(s) {
  const base = String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'board-' + Date.now().toString(36);
}

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody(event);
  const name = String(body?.name || '').trim();
  if (!name) throw createError({ statusCode: 400, message: '板块名称不能为空' });

  await getDb();
  await ensureBoards();

  const HubBoard = getModel('HubBoard');
  const key = String(body.key || slugify(name)).trim();
  // 内置集合名 / 静态路由段都不能占用
  if (isReservedColl(key)) {
    throw createError({ statusCode: 409, message: `「${key}」是系统保留标识，请换一个` });
  }
  if (await HubBoard.findOne({ key })) {
    throw createError({ statusCode: 409, message: `板块标识「${key}」已存在` });
  }

  const last = await HubBoard.findOne().sort({ sort: -1 }).select('sort').lean();
  const doc = await HubBoard.create({
    key,
    name,
    icon: body.icon || 'apps',
    sort: body.sort === undefined || body.sort === null || body.sort === '' ? (last?.sort ?? -1) + 1 : Number(body.sort) || 0,
    status: 'active',
    builtin: false,
  });
  return { ok: true, board: doc };
});
