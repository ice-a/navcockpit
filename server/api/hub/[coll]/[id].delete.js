// 删除：DELETE /api/hub/<coll>/<id>（需管理密码）
import { createError } from 'h3';
import { getDb } from '../../../utils/db';
import { getModel, collToModel } from '../../../utils/models';
import { requireAdmin } from '../../../utils/auth';

export default defineEventHandler(async (event) => {
  const coll = getRouterParam(event, 'coll');
  const id = getRouterParam(event, 'id');
  const modelName = collToModel(coll);
  if (!modelName) {
    throw createError({ statusCode: 404, statusMessage: '未知集合' });
  }
  const Model = getModel(modelName);
  requireAdmin(event);
  await getDb();

  const doc = await Model.findByIdAndDelete(id);
  if (!doc) throw createError({ statusCode: 404, statusMessage: '记录不存在' });
  return { ok: true };
});
