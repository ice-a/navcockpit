// 更新：PUT /api/hub/<coll>/<id>（需管理密码）
import { createError, readBody, getRouterParam } from 'h3';
import { getDb } from '../../../utils/db';
import { sanitizeStation, requireAdmin } from '../../../utils/auth';
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

  const body = await readBody(event);
  delete body._id;
  delete body.createdAt;
  delete body.updatedAt;
  delete body.board; // 条目不允许跨板块搬移

  let doc;
  try {
    doc = await Model.findOneAndUpdate({ _id: id, ...filter }, body, { new: true });
  } catch {
    doc = null;
  }
  if (!doc) throw createError({ statusCode: 404, statusMessage: '记录不存在' });
  return coll === 'stations' ? sanitizeStation(doc) : doc;
});
