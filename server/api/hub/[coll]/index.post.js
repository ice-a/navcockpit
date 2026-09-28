// AI 资源台通用创建：POST /api/hub/<coll>（需管理密码）
import { createError, readBody, getRouterParam } from 'h3';
import { getDb } from '../../../utils/db';
import { sanitizeStation, requireAdmin } from '../../../utils/auth';
import { resolveColl } from '../../../utils/boards';

export default defineEventHandler(async (event) => {
  const coll = getRouterParam(event, 'coll');
  requireAdmin(event);
  await getDb();
  const resolved = await resolveColl(coll);
  if (!resolved) {
    throw createError({ statusCode: 404, statusMessage: '未知板块' });
  }
  const { Model, builtin } = resolved;

  const body = await readBody(event);
  // 自定义板块的条目统一打上 board 标记
  const doc = await Model.create(builtin ? body : { ...body, board: coll });
  return coll === 'stations' ? sanitizeStation(doc) : doc;
});
