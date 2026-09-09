// 校验管理密码：POST /api/verify  body: { password }
// 密码比对只发生在服务端；前端把密码存 sessionStorage，写操作时经 x-admin-password 头带上。
import { createError, readBody } from 'h3';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) {
    throw createError({ statusCode: 503, message: '服务端未配置 ADMIN_PASSWORD，管理功能不可用' });
  }
  if (!body || body.password !== expected) {
    throw createError({ statusCode: 401, statusMessage: '管理密码错误' });
  }
  return { ok: true };
});
