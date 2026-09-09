// 文章正文提取（移植自 ice-a/html_to_markdown_by_ai 的 src/server.js 核心启发式）：
// 抓网页 → cheerio 选正文节点 → 图片转存公开图床（失败保留原图）→ Turndown 转 Markdown。
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { randomUUID } from 'node:crypto';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
turndown.addRule('removeNoise', {
  filter: ['script', 'style', 'noscript', 'iframe', 'svg'],
  replacement: () => '',
});

export function pickArticleNode($) {
  const candidates = [
    'article',
    'main article',
    'main',
    '[role="main"]',
    '.article',
    '.post',
    '.entry-content',
    '.post-content',
    '.article-content',
    '#content',
  ];
  let best = null;
  let bestScore = 0;
  for (const sel of candidates) {
    $(sel).each((_, el) => {
      const text = $(el).text() || '';
      const paragraphs = $(el).find('p').length;
      const score = text.trim().length + paragraphs * 120;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });
  }
  // 正文评分阈值 300，低于则回退 body
  return bestScore > 300 ? best : $('body').get(0);
}

function absolutize($, node, base) {
  $(node)
    .find('a[href]')
    .each((_, el) => {
      const href = $(el).attr('href');
      try {
        $(el).attr('href', new URL(href, base).href);
      } catch {}
    });
  $(node)
    .find('img[src]')
    .each((_, el) => {
      const src = $(el).attr('src');
      try {
        $(el).attr('src', new URL(src, base).href);
      } catch {}
    });
}

// 免费公开图床（tmpfiles.org，7 天有效）；失败返回 null，调用方保留原图地址
async function uploadToTmpfiles(buffer, filename, contentType) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType }), filename);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: form,
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const url = body?.data?.url;
    return url ? url.replace('tmpfiles.org/', 'tmpfiles.org/dl/') : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadImages($, node, maxImages = 20) {
  const imgs = $(node).find('img[src^="http"]').toArray().slice(0, maxImages);
  let uploaded = 0;
  for (const el of imgs) {
    const src = $(el).attr('src');
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(src, {
        signal: ctrl.signal,
        headers: { 'User-Agent': UA },
      }).finally(() => clearTimeout(timer));
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      const ext = (contentType.split('/')[1] || 'jpg').split(';')[0];
      const newUrl = await uploadToTmpfiles(buffer, `${randomUUID()}.${ext}`, contentType);
      if (newUrl) {
        $(el).attr('src', newUrl);
        uploaded += 1;
      }
    } catch {
      // 单张图片失败不影响整体，保留原外链
    }
  }
  return uploaded;
}

export async function extractArticle(url, { uploadImages: shouldUpload = true } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  let html;
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    });
    if (!res.ok) throw new Error(`抓取页面失败：HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim() ||
    new URL(url).hostname;

  const node = pickArticleNode($);
  absolutize($, node, url);
  let uploaded = 0;
  if (shouldUpload) {
    uploaded = await uploadImages($, node);
  }

  const articleHtml = $.html(node) || '';
  const markdownBody = turndown
    .turndown(articleHtml)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const markdown = `# ${title}\n\n> 原文: ${url}\n\n${markdownBody}\n`;

  return {
    title,
    sourceUrl: url,
    markdown,
    uploadedImages: uploaded,
    filename: `${randomUUID()}.md`,
  };
}

// 用户粘贴的 HTML 直接转换（无需抓取，不转存图片）
export function convertHtml(html) {
  const $ = cheerio.load(html);
  const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || '';
  const node = pickArticleNode($);
  const articleHtml = $.html(node) || html;
  const markdownBody = turndown.turndown(articleHtml).replace(/\n{3,}/g, '\n\n').trim();
  return {
    title,
    markdown: title ? `# ${title}\n\n${markdownBody}\n` : `${markdownBody}\n`,
  };
}
