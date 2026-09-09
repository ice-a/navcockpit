// 教程点赞 +1（公开）：POST /api/hub/tutorials/<id>/like
import { createError, getRouterParam } from 'h3';
import { getDb } from '../../../../utils/db';
import { getModel } from '../../../../utils/models';

export default defineEventHandler(async (event) => {
  const coll = getRouterParam(event, 'coll');
  const id = getRouterParam(event, 'id');
  if (coll !== 'tutorials') {
    throw createError({ statusCode: 404, statusMessage: '未知集合' });
  }
  await getDb();
  const Tutorial = getModel('Tutorial');
  const doc = await Tutorial.findByIdAndUpdate(id, { $inc: { likes: 1 } }, { new: true });
  if (!doc) throw createError({ statusCode: 404, statusMessage: '教程不存在' });
  return { views: doc.views, likes: doc.likes };
});
