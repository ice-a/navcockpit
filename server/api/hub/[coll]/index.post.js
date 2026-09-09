// AI 资源台通用创建：POST /api/hub/<coll>（需管理密码）
import { createError, readBody } from 'h3';
import { getDb } from '../../../utils/db';
import { getModel, collToModel } from '../../../utils/models';
import { requireAdmin } from '../../../utils/auth';

export default defineEventHandler(async (event) => {
  const coll = getRouterParam(event, 'coll');
  const modelName = collToModel(coll);
  if (!modelName) {
    throw createError({ statusCode: 404, statusMessage: '未知集合' });
  }
  const Model = getModel(modelName);
  requireAdmin(event);
  await getDb();

  const body = await readBody(event);
  const doc = await Model.create(body);
  return coll === 'stations' ? sanitizeStation(doc) : doc;
});
