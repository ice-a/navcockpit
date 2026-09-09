// 表单内即时探测模型列表：POST /api/hub/stations/probe
// body: { baseURL, apiKey } —— 保存前先验证 Key 是否可用（需管理密码）
import { createError, getRouterParam, readBody } from 'h3';
import { requireAdmin } from '../../../utils/auth';
import { fetchModels } from '../../../utils/stations';

export default defineEventHandler(async (event) => {
  const coll = getRouterParam(event, 'coll');
  if (coll !== 'stations') {
    throw createError({ statusCode: 404, statusMessage: '未知集合' });
  }
  requireAdmin(event);
  const body = await readBody(event);
  const models = await fetchModels(body.baseURL, body.apiKey || '');
  return { models };
});
