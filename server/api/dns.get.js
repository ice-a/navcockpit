// DNS 看板：GET /api/dns?github_user=xxx
// 凭证只存在于服务端环境变量；同一份代码在 Vercel/Cloudflare Pages（Node preset）/本地均可运行。
import { getDnsDashboard, parseGithubUser } from '../utils/dns';

export default defineEventHandler(async (event) => {
  try {
    const q = getQuery(event);
    const data = await getDnsDashboard({
      CF_API_TOKEN: process.env.CF_API_TOKEN,
      CF_ZONE_IDS: process.env.CF_ZONE_IDS,
      GH_TOKEN: process.env.GH_TOKEN,
      GH_USERNAME: process.env.GH_USERNAME,
      githubUser: parseGithubUser(q.github_user),
    });
    setHeader(event, 'Cache-Control', 'no-store');
    return data;
  } catch (err) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
