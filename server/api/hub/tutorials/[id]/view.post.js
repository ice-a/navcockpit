// 教程浏览量 +1（公开）：POST /api/hub/tutorials/<id>/view
import { createError } from 'h3';
import { getDb } from '../../../../utils/db';
import { getModel } from '../../../../utils/models';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  await getDb();
  const Tutorial = getModel('Tutorial');
  const doc = await Tutorial.findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true });
  if (!doc) throw createError({ statusCode: 404, statusMessage: '教程不存在' });
  return { views: doc.views, likes: doc.likes };
});
