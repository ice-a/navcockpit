// 把资源库里的技术类内容导出成 VitePress 文档页。
// 用法：node scripts/export-tech-docs.mjs [输出目录]
// 默认输出到 ../less_is_more_cn/docs/07技术资源
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const libFile = path.join(root, 'public', 'data', 'library.json');
const outDir = path.resolve(process.argv[2] || path.join(root, '..', 'less_is_more_cn', 'docs', '07技术资源'));

// 只导出技术相关的大类：资源社区 / 商业推广 属于生活与推广，不入档
const TECH_GROUPS = ['AI 工具', '开发工具', '采集自动化', '逆向安全', '学习提升'];

const INTRO = {
  'AI 工具': 'AI 绘画、对话、编程与 Skills 等工具，含中转站与直连平台。',
  开发工具: '前端、后端、Python 库、接口调试与在线工具。',
  采集自动化: '爬虫、抓包、Hook、指纹与打码等采集链路上的工具。',
  逆向安全: '反编译、脱壳、混淆、调试与安全研究相关的站点。',
  学习提升: '文档教程、刷题、比赛与站内文章。',
};

const lib = JSON.parse(await fs.readFile(libFile, 'utf8'));
const sections = (lib.sections || []).filter((s) => TECH_GROUPS.includes(s.name));

function cell(value, max = 70) {
  const s = String(value || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function tableFor(category) {
  const rows = category.items.map((it) => {
    const name = it.url ? `[${cell(it.name, 40)}](${it.url})` : `${cell(it.name, 40)}（站内文章）`;
    return `| ${name} | ${cell(it.desc)} |`;
  });
  return [`## ${category.name}`, '', '| 名称 | 说明 |', '| --- | --- |', ...rows, ''].join('\n');
}

await fs.mkdir(outDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const indexLines = [
  '---',
  'title: 技术资源',
  `date: ${today}`,
  '---',
  '',
  '# 技术资源',
  '',
  '平时常用的技术站点与工具，按大类分好，随手可查。',
  '',
  '| 大类 | 数量 | 页面 |',
  '| --- | --- | --- |',
];

const files = [];
for (const [i, s] of sections.entries()) {
  indexLines.push(`| ${s.name} | ${s.count} | [查看](/07技术资源/${encodeURIComponent(s.name)}) |`);

  const body = [
    '---',
    `title: ${s.name}`,
    `date: ${today}`,
    `order: ${i + 1}`,
    '---',
    '',
    `# ${s.name}`,
    '',
    `${INTRO[s.name] || ''} 共 ${s.count} 条、${s.categories.length} 个子分类。`,
    '',
    '> 由资源库自动生成，请勿手工编辑；本地重新生成即可更新。',
    '',
    ...s.categories.map(tableFor),
    '---',
    '',
    '返回 [技术资源总览](/07技术资源/)',
    '',
  ].join('\n');

  const file = path.join(outDir, `${s.name}.md`);
  await fs.writeFile(file, body, 'utf8');
  files.push(file);
}

await fs.writeFile(path.join(outDir, 'index.md'), `${indexLines.join('\n')}\n`, 'utf8');

console.log(`已生成 ${files.length + 1} 个文档 →`, outDir);