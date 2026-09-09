// 热榜接口：GET /api/hot/<source>?latest=1（latest=1 跳过缓存强制抓取）
// source 列表见 GET /api/hot
import { createError, getQuery } from 'h3';
import { HOT_SOURCES, getHotSource } from '../../utils/hotsources';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'source');

  if (id === 'list') {
    return Object.entries(HOT_SOURCES).map(([key, s]) => ({
      id: key,
      name: s.name,
      ttl: s.ttl,
    }));
  }

  const q = getQuery(event);
  const force = q.latest !== undefined && q.latest !== 'false';
  try {
    const data = await getHotSource(id, force);
    if (!data) throw createError({ statusCode: 404, statusMessage: `未知热榜源 ${id}` });
    setHeader(event, 'Cache-Control', 'no-store');
    return data;
  } catch (e) {
    if (e.statusCode) throw e;
    throw createError({ statusCode: 502, message: `抓取失败：${e.message}` });
  }
});
