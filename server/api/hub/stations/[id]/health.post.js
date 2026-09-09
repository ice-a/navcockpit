// 中转站探活（公开接口）：POST /api/hub/stations/<id>/health
// 服务端请求 baseURL，HTTP < 500 算可达，结果回写状态位。
import { createError } from 'h3';
import { getDb } from '../../../../utils/db';
import { getModel } from '../../../../utils/models';
import { probeUrl } from '../../../../utils/stations';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  await getDb();
  const Station = getModel('Station');
  const doc = await Station.findById(id);
  if (!doc) throw createError({ statusCode: 404, statusMessage: '中转站不存在' });

  const result = await probeUrl(doc.baseURL);
  doc.status = result.ok ? 'active' : 'inactive';
  await doc.save();
  return { ...result, status: doc.status };
});
