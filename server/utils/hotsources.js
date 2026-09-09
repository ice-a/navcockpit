// 热榜数据源（移植自 ice-a/newsnow 的服务端抓取逻辑，取其核心源）。
// 全部抓取在服务端完成（浏览器直连这些站点会被 CORS/风控拦截），
// 统一输出 { title, url, extra } 结构，带内存缓存防封。
import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function myFetch(url, opts = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return results;
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').trim();
}

// ===== 各源实现 =====

// 知乎热榜（官方内部 API）
async function zhihu() {
  const res = await myFetch(
    'https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit=20&desktop=true',
    { headers: { Referer: 'https://www.zhihu.com/hot' } },
  );
  const body = await res.json();
  return (body.data || []).map((x) => {
    const t = x.target || {};
    // 新版 API 的 target 无 url 字段，问题 ID 从 card_id（形如 Q_20809...）提取
    const qid = (t.url || '').match(/questions?\/(\d+)/)?.[1] || (x.card_id || '').replace(/^Q_/, '');
    return {
      title: stripTags(t.title_area?.text || t.title || x.title),
      url: /^\d+$/.test(qid) ? `https://www.zhihu.com/question/${qid}` : 'https://www.zhihu.com/hot',
      extra: t.metrics_area?.text || x.detail_text || '',
    };
  });
}

// 百度热搜（从 SSR 页面注释里抠内嵌 JSON，与 newsnow 同手法）
// extra 只输出短热度值（与知乎样式对齐），长描述不用，避免把榜单撑宽
async function baidu() {
  const res = await myFetch('https://top.baidu.com/board?tab=realtime');
  const html = await res.text();
  const m = html.match(/<!--s-data:(.*?)-->/s);
  if (!m) throw new Error('百度热搜页面结构已变化');
  const data = JSON.parse(m[1]);
  const items = [];
  for (const card of data.data?.cards || []) {
    for (const c of card.content || []) {
      const heat = Number(c.hotScore || 0);
      items.push({
        title: c.word || '',
        url: c.url || c.rawUrl || 'https://top.baidu.com/board?tab=realtime',
        extra: heat > 0 ? `${Math.round(heat / 10000)} 万热度` : '',
      });
    }
  }
  return items.slice(0, 30);
}

// B 站排行：优先用「热门」接口（无需签名、风控宽松），失败再回退旧排行榜接口
async function bilibili() {
  const shape = (list) =>
    (list || []).slice(0, 30).map((v) => ({
      title: v.title,
      url: `https://www.bilibili.com/video/${v.bvid || v.uri || ''}`,
      extra: `${v.stat?.view ?? 0} 播放 · ${v.stat?.like ?? 0} 点赞`,
    }));
  try {
    const res = await myFetch('https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1', {
      headers: { Referer: 'https://www.bilibili.com/' },
    });
    const body = await res.json();
    if (body.code !== 0) throw new Error(`code ${body.code}`);
    const items = shape(body.data?.list);
    if (!items.length) throw new Error('empty');
    return items;
  } catch {
    const res = await myFetch('https://api.bilibili.com/x/web-interface/ranking/v2', {
      headers: { Referer: 'https://www.bilibili.com/' },
    });
    const body = await res.json();
    return shape(body.data?.list);
  }
}

// GitHub Trending（HTML 抓取）——extra 只给星数，和知乎样式对齐
async function github() {
  const res = await myFetch('https://github.com/trending?spoken_language_code=');
  const $ = cheerio.load(await res.text());
  const items = [];
  $('main .Box div[data-hpc] > article').each((_, el) => {
    const href = $(el).find('h2 a').attr('href');
    if (!href) return;
    const stars = $(el).find('a.Link--muted').first().text().trim().replace(/\s+/g, '');
    items.push({
      title: href.replace(/^\//, ''),
      url: `https://github.com${href}`,
      extra: stars ? `⭐ ${stars}` : '',
    });
  });
  return items.slice(0, 30);
}

// Hacker News（官方 Firebase API，无风控）
async function hackernews() {
  const res = await myFetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids = (await res.json()).slice(0, 30);
  const items = await mapLimit(ids, 10, async (id) => {
    const r = await myFetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
    const it = await r.json();
    return {
      title: it.title,
      url: it.url || `https://news.ycombinator.com/item?id=${id}`,
      extra: `${it.score ?? 0} points · ${it.descendants ?? 0} comments`,
    };
  });
  return items.filter(Boolean);
}

// 已移除：微博热搜（需登录 Cookie，风控强）、V2EX 热门、掘金热榜、Product Hunt。
export const HOT_SOURCES = {
  zhihu: { name: '知乎热榜', fn: zhihu, ttl: 10 * 60 * 1000 },
  baidu: { name: '百度热搜', fn: baidu, ttl: 10 * 60 * 1000 },
  bilibili: { name: 'B站排行', fn: bilibili, ttl: 10 * 60 * 1000 },
  github: { name: 'GitHub Trending', fn: github, ttl: 30 * 60 * 1000 },
  hackernews: { name: 'Hacker News', fn: hackernews, ttl: 10 * 60 * 1000 },
};

// 内存缓存：isolate 存活期间有效，按各自 TTL 失效
const cache = new Map();

export async function getHotSource(id, force) {
  const src = HOT_SOURCES[id];
  if (!src) return null;
  const hit = cache.get(id);
  if (!force && hit && Date.now() - hit.at < src.ttl) {
    return { status: 'cache', id, updatedTime: hit.at, items: hit.items };
  }
  const items = (await src.fn()).slice(0, 30);
  if (items.length) cache.set(id, { items, at: Date.now() });
  return { status: 'success', id, updatedTime: Date.now(), items };
}
