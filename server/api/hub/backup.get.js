// 整站备份（需管理密码）：GET /api/hub/backup —— 导出全部集合为 JSON（中转站 apiKey 已脱敏）
import { getDb } from '../../utils/db';
import { getModel, HUB_COLLECTIONS } from '../../utils/models';
import { requireAdmin, sanitizeStation } from '../../utils/auth';

// 除 6 个业务集合外，板块定义与自定义板块的条目也要一起备份
const EXTRA_COLLECTIONS = ['HubBoard', 'HubItem'];

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  await getDb();

  const out = { exportedAt: new Date().toISOString() };
  for (const name of [...HUB_COLLECTIONS, ...EXTRA_COLLECTIONS]) {
    const list = await getModel(name).find().sort({ sort: 1 }).lean();
    out[name] = name === 'Station' ? list.map(sanitizeStation) : list;
  }
  return out;
});
