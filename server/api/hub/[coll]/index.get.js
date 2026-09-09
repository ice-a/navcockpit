// AI 资源台通用列表：GET /api/hub/<coll>
// coll ∈ stations | tools | skills | vpns | servers | tutorials
import { createError, getQuery } from 'h3';
import { getDb } from '../../../utils/db';
import { getModel, collToModel } from '../../../utils/models';
import { sanitizeStation } from '../../../utils/auth';

export default defineEventHandler(async (event) => {
  const coll = getRouterParam(event, 'coll');
  const modelName = collToModel(coll);
  if (!modelName) {
    throw createError({ statusCode: 404, statusMessage: '未知集合' });
  }
  const Model = getModel(modelName);
  await getDb();

  const q = getQuery(event);
  const filter = {};
  if (q.status && q.status !== 'all') filter.status = q.status;
  if (q.category) filter.category = q.category;

  let list = await Model.find(filter).sort({ sort: 1, createdAt: -1 }).lean();
  // 列表不返回教程正文（正文可能很大），详情走 /api/hub/tutorials/<id>
  if (coll === 'tutorials') {
    list = list.map((t) => ({ ...t, content: undefined }));
  }
  if (coll === 'stations') {
    list = list.map(sanitizeStation);
  }
  return list;
});
