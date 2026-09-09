// 重新拉取模型列表（需管理密码）：POST /api/hub/stations/<id>/models
// 服务端持有 apiKey（库里明文、前端不可见），用 Key 调上游 /v1/models。
// 注意：必须放在 [coll] 动态路由下——若建 server/api/hub/stations/ 静态目录，
// 会遮蔽 /api/hub/stations 的通用 CRUD（Nitro 静态段优先，缺失 handler 时返回 SPA HTML）。
import { createError, getRouterParam } from 'h3';
import { getDb } from '../../../../utils/db';
import { getModel } from '../../../../utils/models';
import { requireAdmin } from '../../../../utils/auth';
import { fetchModels } from '../../../../utils/stations';

export default defineEventHandler(async (event) => {
  const coll = getRouterParam(event, 'coll');
  const id = getRouterParam(event, 'id');
  if (coll !== 'stations') {
    throw createError({ statusCode: 404, statusMessage: '未知集合' });
  }
  requireAdmin(event);
  await getDb();
  const Station = getModel('Station');
  const doc = await Station.findById(id);
  if (!doc) throw createError({ statusCode: 404, statusMessage: '中转站不存在' });

  doc.models = await fetchModels(doc.baseURL, doc.apiKey || '');
  await doc.save();
  return { models: doc.models };
});
