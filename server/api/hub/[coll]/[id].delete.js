// 删除：DELETE /api/hub/<coll>/<id>（需管理密码）
import { createError, getRouterParam } from 'h3';
import { getDb } from '../../../utils/db';
import { requireAdmin } from '../../../utils/auth';
import { resolveColl } from '../../../utils/boards';

export default defineEventHandler(async (event) => {
  const coll = getRouterParam(event, 'coll');
  const id = getRouterParam(event, 'id');
  requireAdmin(event);
  await getDb();
  const resolved = await resolveColl(coll);
  if (!resolved) {
    throw createError({ statusCode: 404, statusMessage: '未知板块' });
  }
  const { Model, filter } = resolved;

  let doc;
  try {
    doc = await Model.findOneAndDelete({ _id: id, ...filter });
  } catch {
    doc = null;
  }
  if (!doc) throw createError({ statusCode: 404, statusMessage: '记录不存在' });
  return { ok: true };
});
