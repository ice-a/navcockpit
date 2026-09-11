// 读取分享：GET /api/share/<sid>（同时自增浏览量）
import { createError } from 'h3';
import { getDb } from '../../utils/db';
import { getModel } from '../../utils/models';

export default defineEventHandler(async (event) => {
  const sid = (getRouterParam(event, 'sid') || '').trim();
  if (!sid) throw createError({ statusCode: 400, statusMessage: '缺少 sid' });

  await getDb();
  const Model = getModel('Share');
  const doc = await Model.findOneAndUpdate(
    { sid },
    { $inc: { views: 1 } },
    { new: true },
  ).lean();
  if (!doc) throw createError({ statusCode: 404, statusMessage: '分享不存在或已删除' });
  return doc;
});
