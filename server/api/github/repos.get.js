// GitHub 仓库列表：GET /api/github/repos?user=<login>&q=<关键词>&forks=0
// 与 Cloudflare 完全解耦——没配 CF_API_TOKEN 也能正常用；公开数据，无需鉴权。
// 返回：{ source, user, profile, total, matched, truncated, repos[] }
// repos 按最近推送时间倒序（pushedAt desc）。
import { getQuery } from 'h3';
import { getUserRepos, parseGithubUser } from '../../utils/github';

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const data = await getUserRepos({
    token: process.env.GH_TOKEN || '',
    user: parseGithubUser(q.user ?? q.github_user),
    q: q.q ?? '',
    includeForks: String(q.forks ?? '1') !== '0',
  });
  setHeader(event, 'Cache-Control', 'no-store');
  return data;
});
