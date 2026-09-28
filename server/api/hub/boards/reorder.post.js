// POST /api/hub/boards/reorder —— 保存板块顺序（需管理密码）
// body: { order: [{ key, sort }] } 或 { order: ['key1', 'key2'] }
import { createError, readBody } from 'h3';
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';
import { requireAdmin } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody(event);
  if (!Array.isArray(body?.order)) {
    throw createError({ statusCode: 400, message: '缺少 order 数组' });
  }

  await getDb();
  const HubBoard = getModel('HubBoard');
  let updated = 0;
  for (const [i, item] of body.order.entries()) {
    const key = typeof item === 'string' ? item : item?.key;
    if (!key) continue;
    const sort = typeof item === 'string' ? i : Number(item.sort ?? i);
    const res = await HubBoard.updateOne({ key }, { sort: Number(sort) || 0 });
    updated += res.modifiedCount || 0;
  }
  return { ok: true, updated };
});
