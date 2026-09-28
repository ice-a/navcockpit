// 从原项目 shared/cloudflare.js 平移：Cloudflare API 交互 + 子域名探活。
// GitHub 仓库已拆到 utils/github.js + /api/github/repos（与 Cloudflare 解耦，
// 不再随 DNS 看板一起返回，避免没配 CF_API_TOKEN 时把 GitHub 也一起拖挂）。
// 在 Nitro（Node runtime）中运行，三个部署平台（Vercel/Cloudflare Pages/本地）共用同一份逻辑。
const CF_API = 'https://api.cloudflare.com/client/v4';

// 探活配置：单次请求最多探测的主机数（Vercel/Node 无子请求限制，但保留分批以平滑负载）
const CHECKS_PER_REQUEST = 35;
const CHECK_TIMEOUT_MS = 4000;
const CHECK_CONCURRENCY = 12;
const CHECK_CACHE_TTL_MS = 5 * 60 * 1000;

const checkCache = new Map();

const NAVIGABLE = new Set(['A', 'AAAA', 'CNAME']);

async function cfFetch(token, path) {
  const res = await fetch(`${CF_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success === false) {
    const msg =
      (body && body.errors && body.errors.map((e) => e.message).join('; ')) ||
      `Cloudflare API request failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return body.result;
}

async function cfFetchAll(token, path) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const result = await cfFetch(token, `${path}${sep}per_page=100&page=${page}`);
    out.push(...result);
    if (result.length < 100) break;
  }
  return out;
}

function parseZoneFilter(raw) {
  return (raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

async function checkSite(hostname) {
  for (const proto of ['https', 'http']) {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(`${proto}://${hostname}`, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'NavCockpit/1.0' },
      });
      let text = '';
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let received = 0;
        while (received < 65536 && !/<\/title>/i.test(text)) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.length;
          text += decoder.decode(value, { stream: true });
        }
        reader.cancel().catch(() => {});
      }
      const m = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      return {
        ok: res.status < 400,
        status: res.status,
        title,
        ms: Date.now() - started,
        url: `${proto}://${hostname}`,
      };
    } catch (e) {
      if (proto === 'http') return { ok: false, status: 0, title: '', ms: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
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
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function getChecks(hostnames) {
  const now = Date.now();
  const stale = hostnames
    .filter((h) => {
      const c = checkCache.get(h);
      return !c || now - c.at > CHECK_CACHE_TTL_MS;
    })
    .sort((a, b) => (checkCache.get(a)?.at || 0) - (checkCache.get(b)?.at || 0));

  const batch = stale.slice(0, CHECKS_PER_REQUEST);
  await mapLimit(batch, CHECK_CONCURRENCY, async (h) => {
    const result = await checkSite(h);
    checkCache.set(h, { result, at: Date.now() });
  });

  const out = {};
  for (const h of hostnames) {
    const c = checkCache.get(h);
    if (c) out[h] = c.result;
  }
  return out;
}

export async function getDnsDashboard(opts = {}) {
  const token = opts.CF_API_TOKEN;
  if (!token) throw new Error('缺少 CF_API_TOKEN 环境变量');
  const filter = parseZoneFilter(opts.CF_ZONE_IDS);

  const allZones = await cfFetchAll(token, '/zones?status=active');
  const zones = filter.length
    ? allZones.filter(
        (z) => filter.includes(z.id.toLowerCase()) || filter.includes(z.name.toLowerCase()),
      )
    : allZones;

  const data = await Promise.all(
    zones.map(async (zone) => {
      const records = await cfFetchAll(token, `/zones/${zone.id}/dns_records`);
      return {
        id: zone.id,
        name: zone.name,
        records: records.map((r) => ({
          type: r.type,
          name: r.name,
          proxied: r.proxied,
        })),
      };
    }),
  );

  const hostnames = new Set();
  for (const zone of data) {
    for (const r of zone.records) {
      if (NAVIGABLE.has(r.type) && !r.name.includes('*')) hostnames.add(r.name);
    }
  }
  const checks = await getChecks([...hostnames]);

  return { updatedAt: new Date().toISOString(), zones: data, checks };
}
