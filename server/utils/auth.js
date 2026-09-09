// 管理鉴权：写操作需要 x-admin-password 请求头；密码只存在于服务端环境变量。
import { createError, getRequestHeader } from 'h3';

export function requireAdmin(event) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) {
    throw createError({
      statusCode: 503,
      message: '服务端未配置 ADMIN_PASSWORD，管理功能不可用',
    });
  }
  const got = getRequestHeader(event, 'x-admin-password') || '';
  if (got !== expected) {
    throw createError({ statusCode: 401, statusMessage: '管理密码错误' });
  }
}

// 中转站脱敏：apiKey 永不下发前端
export function sanitizeStation(doc) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o.apiKey;
  return o;
}
