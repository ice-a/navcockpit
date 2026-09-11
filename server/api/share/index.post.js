// 生成分享：POST /api/share
// body: { type, coll, refId, title, desc, url, badge, avatar:{engine,species,seed} }
// 同一 coll+refId 复用同一个 sid（重复点分享不会堆垃圾数据）；头像类分享按 seed 复用。
import { createError, readBody } from 'h3';
import { randomBytes } from 'node:crypto';
import { getDb } from '../../utils/db';
import { getModel } from '../../utils/models';

const TYPES = new Set(['hub', 'nav', 'repo', 'user', 'dns', 'hot', 'avatar']);
const ENGINES = new Set(['A', 'B', 'C']);

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// 10 位 base58：比 UUID 短，够随机（58^10 ≈ 4.3e17），去掉了 0/O/I/l 避免手抄歧义
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function newSid() {
  const buf = randomBytes(10);
  let out = '';
  for (const b of buf) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) || {};
  const type = TYPES.has(body.type) ? body.type : 'card';
  const title = str(body.title, 120);
  if (!title) throw createError({ statusCode: 400, statusMessage: '缺少标题' });

  await getDb();
  const Model = getModel('Share');

  const coll = str(body.coll, 32);
  const refId = str(body.refId, 300); // 导航站用 URL 当 refId，放宽一些
  // 幂等键：有源文档用 coll+refId，否则用头像种子 / 标题兜底
  const dedupe = {};
  if (coll && refId) {
    dedupe.coll = coll;
    dedupe.refId = refId;
  } else if (type === 'avatar') {
    dedupe.type = 'avatar';
    dedupe['avatar.seed'] = Number(body?.avatar?.seed) || 0;
    dedupe.title = title;
  }

  if (Object.keys(dedupe).length) {
    const exist = await Model.findOne(dedupe).lean();
    if (exist) return exist;
  }

  const engine = ENGINES.has(body?.avatar?.engine) ? body.avatar.engine : 'A';
  const doc = await Model.create({
    sid: newSid(),
    type,
    coll,
    refId,
    title,
    desc: str(body.desc, 400),
    url: str(body.url, 600),
    badge: str(body.badge, 40),
    avatar: {
      engine,
      species: str(body?.avatar?.species, 32) || 'random',
      seed: Number.isFinite(Number(body?.avatar?.seed)) ? Number(body.avatar.seed) >>> 0 : 0,
    },
    views: 0,
  });
  return doc;
});
