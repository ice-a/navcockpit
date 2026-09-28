// GET /api/hub/boards —— AI 资源台板块列表（首次请求会幂等补齐 6 个内置板块）
import { getDb } from '~/server/utils/db';
import { ensureBoards } from '~/server/utils/boards';

export default defineEventHandler(async () => {
  await getDb();
  const HubBoard = await ensureBoards();
  return HubBoard.find({ status: { $ne: 'inactive' } })
    .sort({ sort: 1, createdAt: 1 })
    .lean();
});
