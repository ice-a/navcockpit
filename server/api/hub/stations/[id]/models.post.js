// 重新拉取模型列表（需管理密码）：POST /api/hub/stations/<id>/models
// 服务端持有 apiKey（库里明文、前端不可见），用 Key 调上游 /v1/models。
import { createError } from 'h3';
import { getDb } from '../../../../utils/db';
import { getModel } from '../../../../utils/models';
import { requireAdmin } from '../../../../utils/auth';
import { fetchModels } from '../../../../utils/stations';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  requireAdmin(event);
  await getDb();
  const Station = getModel('Station');
  const doc = await Station.findById(id);
  if (!doc) throw createError({ statusCode: 404, statusMessage: '中转站不存在' });

  doc.models = await fetchModels(doc.baseURL, doc.apiKey || '');
  await doc.save();
  return { models: doc.models };
});
