// 文章提取：POST /api/tools/extract  body: { url }
// 服务端抓取（绕开浏览器 CORS）→ 正文选取 → 图片转存公开图床 → Markdown
import { createError, readBody } from 'h3';
import { extractArticle } from '../../utils/extract';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body || !body.url) {
    throw createError({ statusCode: 400, statusMessage: '缺少 url' });
  }
  let target = body.url.trim();
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
  try {
    return await extractArticle(target, { uploadImages: body.uploadImages !== false });
  } catch (e) {
    throw createError({ statusCode: 502, message: e.message || '提取失败' });
  }
});
