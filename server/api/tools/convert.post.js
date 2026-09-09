// HTML 粘贴转换：POST /api/tools/convert  body: { html }
import { createError, readBody } from 'h3';
import { convertHtml } from '../../utils/extract';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body || !body.html || !String(body.html).trim()) {
    throw createError({ statusCode: 400, statusMessage: '缺少 html' });
  }
  return convertHtml(String(body.html));
});
