// DNS 看板：GET /api/dns
// 凭证只存在于服务端环境变量；同一份代码在 Vercel/Cloudflare Pages（Node preset）/本地均可运行。
// 注意：GitHub 仓库不在这里返回了，走独立的 GET /api/github/repos。
import { getDnsDashboard } from '../utils/dns';

export default defineEventHandler(async (event) => {
  try {
    const data = await getDnsDashboard({
      CF_API_TOKEN: process.env.CF_API_TOKEN,
      CF_ZONE_IDS: process.env.CF_ZONE_IDS,
    });
    setHeader(event, 'Cache-Control', 'no-store');
    return data;
  } catch (err) {
    throw createError({ statusCode: 500, message: err.message });
  }
});
