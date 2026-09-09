// 鏁寸珯鎭㈠锛堥渶绠＄悊瀵嗙爜锛夛細POST /api/hub/backup 鈥斺€?鐢ㄥ浠?JSON 瑕嗙洊鎭㈠锛堟寜 _id upsert锛?import { readBody } from 'h3';
import { getDb } from '../../utils/db';
import { getModel, HUB_COLLECTIONS } from '../../utils/models';
import { requireAdmin } from '../../utils/auth';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  await getDb();

  const body = await readBody(event);
  const counts = {};
  for (const name of HUB_COLLECTIONS) {
    if (!Array.isArray(body[name])) continue;
    const Model = getModel(name);
    for (const item of body[name]) {
      if (!item || !item._id) continue;
      await Model.findByIdAndUpdate(item._id, item, { upsert: true, overwrite: true });
    }
    counts[name] = body[name].length;
  }
  return { ok: true, counts };
});
