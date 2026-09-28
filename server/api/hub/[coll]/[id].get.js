// 详情：GET /api/hub/<coll>/<id>（教程正文等大字段走这里）
import { createError, getRouterParam } from 'h3';
import { getDb } from '../../../utils/db';
import { sanitizeStation } from '../../../utils/auth';
import { resolveColl } from '../../../utils/boards';

export default defineEventHandler(async (event) => {
  const coll = getRouterParam(event, 'coll');
  const id = getRouterParam(event, 'id');
  await getDb();
  const resolved = await resolveColl(coll);
  if (!resolved) {
    throw createError({ statusCode: 404, statusMessage: '未知板块' });
  }
  const { Model, filter } = resolved;

  let doc;
  try {
    doc = await Model.findOne({ _id: id, ...filter }).lean();
  } catch {
    doc = null; // id 不是合法 ObjectId
  }
  if (!doc) throw createError({ statusCode: 404, statusMessage: '记录不存在' });
  return coll === 'stations' ? sanitizeStation(doc) : doc;
});
