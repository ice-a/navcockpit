// AI 资源台通用列表：GET /api/hub/<coll>
// coll = 内置板块 stations | tools | skills | vpns | servers | tutorials，
//        或后台新增的自定义板块 key（条目存 HubItem）
import { createError, getQuery, getRouterParam } from 'h3';
import { getDb } from '../../../utils/db';
import { sanitizeStation } from '../../../utils/auth';
import { resolveColl } from '../../../utils/boards';

export default defineEventHandler(async (event) => {
  const coll = getRouterParam(event, 'coll');
  await getDb();
  const resolved = await resolveColl(coll);
  if (!resolved) {
    throw createError({ statusCode: 404, statusMessage: '未知板块' });
  }
  const { Model, filter } = resolved;

  const q = getQuery(event);
  const query = { ...filter };
  if (q.status && q.status !== 'all') query.status = q.status;
  if (q.category) query.category = q.category;

  let list = await Model.find(query).sort({ sort: 1, createdAt: -1 }).lean();
  // 列表不返回教程正文（正文可能很大），详情走 /api/hub/tutorials/<id>
  if (coll === 'tutorials') {
    list = list.map((t) => ({ ...t, content: undefined }));
  }
  if (coll === 'stations') {
    list = list.map(sanitizeStation);
  }
  return list;
});
