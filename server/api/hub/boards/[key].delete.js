// DELETE /api/hub/boards/:key —— 删除自定义板块（连同其下条目）；内置板块不可删
import { createError, getRouterParam } from 'h3';
import { getDb } from '~/server/utils/db';
import { getModel, isBuiltinBoard } from '~/server/utils/models';
import { requireAdmin } from '~/server/utils/auth';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const key = getRouterParam(event, 'key');
  if (isBuiltinBoard(key)) {
    throw createError({ statusCode: 400, message: '内置板块不能删除，只能改名' });
  }

  await getDb();
  const doc = await getModel('HubBoard').findOneAndDelete({ key });
  if (!doc) throw createError({ statusCode: 404, message: '板块不存在' });

  const removed = await getModel('HubItem').deleteMany({ board: key });
  return { ok: true, removedItems: removed.deletedCount || 0 };
});
