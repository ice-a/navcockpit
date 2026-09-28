// GET /api/nav/links —— 公开列出链接，支持 ?catelog=&group=&keyword=&all=
import { getDb } from '~/server/utils/db';
import { getModel } from '~/server/utils/models';

export default defineEventHandler(async (event) => {
  await getDb();
  const Link = getModel('NavLink');
  const q = getQuery(event);
  const filter = {};
  if (q.catelog !== undefined && q.catelog !== '' && q.catelog !== '全部') filter.catelog = q.catelog;
  if (q.group !== undefined && q.group !== '' && q.group !== '全部') filter.group = q.group;
  if (q.all === undefined) filter.status = { $ne: 'inactive' };
  let cursor = Link.find(filter);
  if (q.keyword) {
    const kw = String(q.keyword).trim();
    cursor = Link.find({
      $or: [{ name: { $regex: kw, $options: 'i' } }, { desc: { $regex: kw, $options: 'i' } }, { url: { $regex: kw, $options: 'i' } }],
    });
  }
  const list = await cursor.sort({ sort: 1, createdAt: 1 }).lean();
  return list.map((l) => ({ ...l, _id: l._id.toString() }));
});
