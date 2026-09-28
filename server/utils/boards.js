// AI 资源台板块：内置板块与自定义板块的统一解析。
//  - 内置板块（stations/tools/skills/vpns/servers/tutorials）数据仍在各自的模型里
//  - 自定义板块的条目统一存 HubItem 集合，用 board 字段区分
import { getModel, collToModel, BUILTIN_BOARDS } from './models';

// URL 里已被静态路由占用的段（server/api/hub/boards、server/api/hub/backup），
// 不能再拿来做板块 key，否则会被静态路由遮蔽。
export const RESERVED_COLLS = ['boards', 'backup'];

export function isReservedColl(key) {
  return Boolean(collToModel(key)) || RESERVED_COLLS.includes(String(key || '').toLowerCase());
}

// 幂等补齐 6 个内置板块；已存在的保留用户改过的名字 / 图标 / 排序
export async function ensureBoards() {
  const HubBoard = getModel('HubBoard');
  const existing = await HubBoard.find().select('key').lean();
  const have = new Set(existing.map((b) => b.key));
  const missing = BUILTIN_BOARDS.filter((b) => !have.has(b.key));
  if (missing.length) {
    await HubBoard.insertMany(missing.map((b) => ({ ...b, builtin: true, status: 'active' })));
  }
  return HubBoard;
}

// 解析 URL 里的 coll → { Model, filter, builtin }
// 找不到返回 null（调用方抛 404）
export async function resolveColl(coll) {
  const modelName = collToModel(coll);
  if (modelName) {
    return { Model: getModel(modelName), filter: {}, builtin: true };
  }
  const HubBoard = await ensureBoards();
  const board = await HubBoard.findOne({ key: coll }).lean();
  if (!board) return null;
  return { Model: getModel('HubItem'), filter: { board: coll }, builtin: false, board };
}
