// 整站恢复（需管理密码）：POST /api/hub/backup —— 用备份 JSON 覆盖恢复（按 _id upsert）
import { readBody } from 'h3';
import { getDb } from '../../utils/db';
import { getModel, HUB_COLLECTIONS } from '../../utils/models';
import { requireAdmin } from '../../utils/auth';

const EXTRA_COLLECTIONS = ['HubBoard', 'HubItem'];

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  await getDb();

  const body = await readBody(event);
  const counts = {};
  for (const name of [...HUB_COLLECTIONS, ...EXTRA_COLLECTIONS]) {
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
