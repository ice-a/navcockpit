// 详情：GET /api/hub/<coll>/<id>（教程正文等大字段走这里）
import { createError } from 'h3';
import { getDb } from '../../../utils/db';
import { getModel, collToModel } from '../../../utils/models';
import { sanitizeStation } from '../../../utils/auth';

export default defineEventHandler(async (event) => {
  const coll = getRouterParam(event, 'coll');
  const id = getRouterParam(event, 'id');
  const modelName = collToModel(coll);
  if (!modelName) {
    throw createError({ statusCode: 404, statusMessage: '未知集合' });
  }
  const Model = getModel(modelName);
  await getDb();

  const doc = await Model.findById(id).lean();
  if (!doc) throw createError({ statusCode: 404, statusMessage: '记录不存在' });
  return coll === 'stations' ? sanitizeStation(doc) : doc;
});
