// 鏁寸珯澶囦唤锛堥渶绠＄悊瀵嗙爜锛夛細GET /api/hub/backup 鈥斺€?瀵煎嚭鍏ㄩ儴闆嗗悎涓?JSON锛堜腑杞珯 apiKey 宸茶劚鏁忥級
import { getDb } from '../../utils/db';
import { getModel, HUB_COLLECTIONS } from '../../utils/models';
import { requireAdmin, sanitizeStation } from '../../utils/auth';

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  await getDb();

  const out = { exportedAt: new Date().toISOString() };
  for (const name of HUB_COLLECTIONS) {
    const list = await getModel(name).find().sort({ sort: 1 }).lean();
    out[name] = name === 'Station' ? list.map(sanitizeStation) : list;
  }
  return out;
});
