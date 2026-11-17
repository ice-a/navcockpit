// 数据构建：把 data-export/（MongoDB 导出快照）合并成站点加载的 JSON。
// 用法：node scripts/build-data.mjs [导出目录，默认 ./data-export]
// 产物：
//   public/data/library.json   目录：大类 → 分类 → 条目（外链与文章同构）
//   public/data/articles.json  文章正文，点开阅读时才加载
// 说明：导航（navlinks）与 AI 资源（stations/tools/skills/vpns/…）在这里合成一棵树，
//       运行时只有一份数据，不再区分「导航」和「资源台」。
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const srcDir = path.resolve(process.argv[2] || path.join(root, 'data-export'));
const outDir = path.join(root, 'public', 'data');

// 大类的展示顺序；未列出的大类追加在最后
const GROUP_ORDER = [
  '商业推广',
  'AI 工具',
  '开发工具',
  '采集自动化',
  '逆向安全',
  '学习提升',
  '代理防护',
  '资源社区',
  '其他',
];

// hub 板块（board.key）→ 并入的大类 / 分类
const HUB_MERGE = {
  stations: ['商业推广', '中转站'],
  servers: ['AI 工具', '直连平台'],
  tools: ['AI 工具', 'AI 工具集'],
  skills: ['AI 工具', 'Skills'],
  tutorials: ['学习提升', '教程'],
  vpns: ['代理防护', 'VPN'],
  vps: ['商业推广', 'VPS'],
  '港卡币卡': ['商业推广', '港卡币卡'],
  ai会员: ['商业推广', 'AI 会员'],
};

// 商业推广 / VPS：厂商 → 推广链接。
// 旧数据源里 vps 板块只有一条，这里统一维护；zgovps 与 zgoesim 是同一家，只出一条。
const VPS_PROMO = [
  ['RackNerd', 'https://my.racknerd.com/aff.php?aff=13897', '比较便宜的 vps'], // racknerd
  ['Vultr', 'https://www.vultr.com/?ref=9526803', ''], // vultr
  ['JustHost', 'https://justhost.asia/?ref=387918', ''], // justhost
  ['ZgoVPS', 'https://www.zgoesim.com/?ref=llgwinzy', ''], // zgovps / zgoesim
  ['ColoCrossing', 'https://cloud.colocrossing.com/aff.php?aff=1191', ''], // colocrossing
];

const read = (name) => {
  const file = path.join(srcDir, name);
  if (!fsSync.existsSync(file)) return [];
  return JSON.parse(fsSync.readFileSync(file, 'utf8'));
};

const active = (list) => list.filter((x) => (x.status || 'active') === 'active');
const text = (v) => String(v ?? '').trim();

// ---------- 合并容器 ----------
const buckets = new Map(); // 大类名 -> Map(分类名 -> items[])
const seen = new Set();

function add(sectionName, catName, item) {
  const key =
    item.kind === 'article' ? `A|${item.name}` : `L|${item.url}|${item.name}`;
  if (!item.name || (item.kind !== 'article' && !item.url) || seen.has(key)) return;
  seen.add(key);

  if (!buckets.has(sectionName)) buckets.set(sectionName, new Map());
  const cats = buckets.get(sectionName);
  if (!cats.has(catName)) cats.set(catName, []);
  cats.get(catName).push(item);
}

const link = (name, url, desc, extra = {}) => {
  const item = { kind: 'link', name: text(name), url: text(url), desc: text(desc) };
  if (extra.tags?.length) item.tags = extra.tags;
  if (extra.meta) item.meta = extra.meta;
  return item;
};

// ---------- 1. 导航分类与链接 ----------
const categories = active(read('navcategories.json'));
const links = active(read('navlinks.json'));

const byCat = new Map();
for (const l of links) {
  const key = text(l.catelog);
  if (!byCat.has(key)) byCat.set(key, []);
  byCat.get(key).push(link(l.name, l.url, l.desc));
}

const catKeys = new Set(categories.map((c) => c.key));
for (const cat of categories) {
  const group = text(cat.group) || '其他';
  const catName = text(cat.name) || text(cat.key);
  for (const item of byCat.get(cat.key) || []) add(group, catName, item);
}

// 没有对应分类的链接归入「其他」，避免静默丢失
for (const [key, items] of byCat) {
  if (catKeys.has(key)) continue;
  for (const item of items) add('其他', text(key) || '未分类', item);
}

// ---------- 2. AI 资源各板块 ----------
const boards = active(read('hubboards.json'));
const hubItems = active(read('hubitems.json'));

const stations = active(read('stations.json')).map((s) => {
  const models = Array.isArray(s.models) ? s.models.map(text).filter(Boolean) : [];
  return link(s.name, text(s.siteURL) || text(s.baseURL), s.desc, {
    tags: models.slice(0, 6),
    meta: models.length ? `${models.length} 个模型` : '',
  });
});

const tools = active(read('tools.json')).map((t) =>
  link(t.name, t.home, text(t.desc) || (Array.isArray(t.detail) ? t.detail[0] : ''), {
    tags: Array.isArray(t.tags) ? t.tags.map(text).filter(Boolean) : [],
    meta: text(t.install) ? `安装：${text(t.install)}` : '',
  }),
);

const skills = active(read('skills.json')).map((s) =>
  link(s.name, s.web, text(s.intro) || text(s.desc)),
);

const vpns = active(read('vpns.json')).map((v) => link(v.name, v.url, text(v.desc) || v.remark));

const servers = active(read('servers.json')).map((s) =>
  link(s.name, s.url, s.desc, {
    tags: [text(s.region), text(s.category)].filter(Boolean),
  }),
);

const collections = { stations, tools, skills, vpns, servers };

for (const b of boards) {
  const key = text(b.key);
  // 教程走文章（见下），vps 由 VPS_PROMO 统一维护
  if (key === 'tutorials' || key === 'vps') continue;
  const [section, catName] = HUB_MERGE[key] || ['其他', text(b.name) || key];
  const list =
    collections[key] ||
    hubItems.filter((i) => i.board === key).map((i) =>
      link(i.name, i.url, i.desc, {
        tags: Array.isArray(i.tags) ? i.tags.map(text).filter(Boolean) : [],
        meta: text(i.install) ? `安装：${text(i.install)}` : '',
      }),
    );
  for (const item of list) add(section, catName, item);
}

// ---------- 3. 商业推广里的 VPS ----------
for (const [name, url, desc] of VPS_PROMO) add('商业推广', 'VPS', link(name, url, desc));

// ---------- 4. 文章（原教程） ----------
// 教程的 status 是 published / draft，与其它集合的 active / inactive 不同
const articles = read('tutorials.json')
  .filter((t) => (t.status || 'published') === 'published')
  .map((t) => ({
    id: text(t._id) || text(t.title),
    title: text(t.title),
    category: text(t.category),
    summary: text(t.summary),
    tags: Array.isArray(t.tags) ? t.tags.map(text).filter(Boolean) : [],
    content: String(t.content || ''),
    updatedAt: t.updatedAt || t.createdAt || '',
  }))
  .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

for (const a of articles) {
  add('学习提升', '教程', {
    kind: 'article',
    name: a.title,
    desc: a.summary,
    articleId: a.id,
    tags: [a.category, ...a.tags].filter(Boolean).slice(0, 4),
    updatedAt: a.updatedAt,
  });
}

// ---------- 5. 输出 ----------
const orderOf = (name) => {
  const i = GROUP_ORDER.indexOf(name);
  return i < 0 ? GROUP_ORDER.length : i;
};

const sections = [...buckets.entries()]
  .map(([name, cats]) => {
    const categoriesOut = [...cats.entries()]
      .map(([catName, items]) => ({ id: catName, name: catName, count: items.length, items }))
      .sort((a, b) => b.count - a.count);
    return {
      id: name,
      name,
      count: categoriesOut.reduce((n, c) => n + c.count, 0),
      categories: categoriesOut,
    };
  })
  .filter((s) => s.count > 0)
  .sort((a, b) => orderOf(a.name) - orderOf(b.name));

const updatedAt = new Date().toISOString();

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(
  path.join(outDir, 'library.json'),
  JSON.stringify({ updatedAt, sections }, null, 1),
  'utf8',
);
await fs.writeFile(
  path.join(outDir, 'articles.json'),
  JSON.stringify({ updatedAt, items: articles }, null, 1),
  'utf8',
);

const itemTotal = sections.reduce((n, s) => n + s.count, 0);
const catTotal = sections.reduce((n, s) => n + s.categories.length, 0);
console.log(`资源库：${sections.length} 个大类 / ${catTotal} 个分类 / ${itemTotal} 条（含 ${articles.length} 篇文章）`);
for (const s of sections) console.log(`  ${s.name}：${s.count}`);
console.log('输出目录：', outDir);