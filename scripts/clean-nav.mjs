// 清理网站导航中失效的链接（连接失败 / 超时 / 非 2xx-3xx）。
// 用法：
//   node scripts/clean-nav.mjs            # 仅预览，输出 link.clean.json + 统计，不改原文件
//   node scripts/clean-nav.mjs --apply    # 真正覆盖 public/link.json（先自动备份 link.json.bak）
//
// 安全机制：若存活率过低（默认 < 40%），视为网络异常，中止覆盖以防误删。
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'public', 'link.json');
const OUT = join(ROOT, 'public', 'link.clean.json');
const BAK = join(ROOT, 'public', 'link.json.bak');

const APPLY = process.argv.includes('--apply');
const TIMEOUT_MS = 6000;
const CONCURRENCY = 16;
const MIN_ALIVE_RATIO = 0.4; // 低于此比例视为网络异常，中止

async function probe(url) {
  for (const method of ['HEAD', 'GET']) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 dns-dashboard-link-check' },
      });
      if (res.status >= 200 && res.status < 400) return true;
      if (method === 'HEAD' && (res.status === 403 || res.status === 405 || res.status === 501)) {
        // HEAD 被拒，再试 GET
        continue;
      }
      return false;
    } catch {
      if (method === 'HEAD') continue;
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

async function main() {
  let links = [];
  try {
    links = JSON.parse(await readFile(SRC, 'utf8'));
  } catch (e) {
    console.error('读取 link.json 失败：', e.message);
    process.exit(1);
  }
  console.log(`共 ${links.length} 条，开始探测（并发 ${CONCURRENCY}，超时 ${TIMEOUT_MS}ms）…`);

  const alive = new Array(links.length);
  let done = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < links.length) {
      const i = cursor++;
      alive[i] = await probe(links[i].url).catch(() => false);
      done++;
      if (done % 25 === 0 || done === links.length) {
        process.stdout.write(`\r  已探测 ${done}/${links.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log('');

  const kept = links.filter((_, i) => alive[i]);
  const dead = links.filter((_, i) => !alive[i]);
  const ratio = kept.length / links.length;

  console.log(`存活 ${kept.length}，失效 ${dead.length}（存活率 ${(ratio * 100).toFixed(1)}%）`);
  if (dead.length) {
    console.log('失效样例：');
    dead.slice(0, 10).forEach((d) => console.log(`  ✕ ${d.name}  <${d.url}>`));
  }

  if (!APPLY) {
    await writeFile(OUT, JSON.stringify(kept, null, 2));
    console.log(`\n预览模式：已写入 ${OUT}（未改动 link.json）。确认无误后加 --apply 覆盖。`);
    return;
  }

  if (ratio < MIN_ALIVE_RATIO) {
    console.error(`\n⚠️ 存活率过低（${(ratio * 100).toFixed(1)}% < ${MIN_ALIVE_RATIO * 100}%），疑似当前环境无外网，已中止覆盖以防误删。`);
    process.exit(2);
  }

  await copyFile(SRC, BAK);
  await writeFile(SRC, JSON.stringify(kept, null, 2));
  console.log(`\n已覆盖 link.json（原文件备份至 link.json.bak）。`);
}

main();
