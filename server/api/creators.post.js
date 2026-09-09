// 新增/更新热门 GitHub 用户：POST /api/creators  body: { login, note? }
// 用户搜索某用户名后调用，upsert 入库（addedByUser=true），去重。
import { createError, readBody } from 'h3';
import { getDb } from '../utils/db';
import { getModel } from '../utils/models';

const LOGIN_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const login = (body?.login || '').toString().trim();
  if (!LOGIN_RE.test(login)) {
    throw createError({ statusCode: 400, statusMessage: '非法的 GitHub 用户名' });
  }
  const Model = getModel('Creator');
  await getDb();
  const doc = await Model.findOneAndUpdate(
    { login },
    { $set: { login, note: body?.note || '', addedByUser: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return doc;
});
