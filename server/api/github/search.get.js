// GitHub 全站仓库搜索：GET /api/github/search?q=<关键词>&page=1&per_page=30
// 与「按用户拉仓库」完全独立，公开数据、无需鉴权；配 GH_TOKEN 可放宽限流。
// 返回：{ q, total, page, perPage, incomplete, items[], error }
import { getQuery } from 'h3';
import { searchGithubRepos } from '../../utils/github';

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const data = await searchGithubRepos({
    token: process.env.GH_TOKEN || '',
    q: q.q ?? q.query ?? '',
    page: Number(q.page) || 1,
    perPage: Number(q.per_page) || 30,
  });
  setHeader(event, 'Cache-Control', 'no-store');
  return data;
});
