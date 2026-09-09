// AI 辅助录入：POST /api/ai/assist（需管理密码 —— AI 功能仅后台可用）
// body: { coll, fields: {...}, config? }
// 按 coll 生成表单内容并强校验后返回，前端直接回填。逻辑对齐
// ice-a/forword-api-record 的 ai/generate-tool.post.ts（JSON 输出 + 解析回填 + 强校验）。
import { createError, readBody } from 'h3';
import { resolveAiConfig, callChat } from '../../utils/ai';
import { requireAdmin } from '../../utils/auth';

function asString(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join('，');
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}
function asStringArray(v) {
  if (Array.isArray(v)) return v.map((x) => asString(x)).filter(Boolean);
  return asString(v)
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
// 从 AI 原始输出里抠出 JSON（容忍 ```json 围栏与前后噪声）
function parseAiJson(raw) {
  let s = String(raw || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 未返回 JSON 内容');
  }
  return JSON.parse(s.slice(start, end + 1));
}
function assertHasContent(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) {
      throw createError({ statusCode: 422, message: `AI 未生成「${k}」，请重试或手动填写` });
    }
  }
}

// 每个集合的系统提示词：只输出一个 JSON 对象，字段与表单对应
const SPEC = {
  tools: {
    need: ['desc', 'tags', 'detail'],
    system: `你是资深技术文档助手。根据工具名称与官网生成结构化的录入内容，必须只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块包裹，字段如下：
{
  "desc": "一句话中文简介（20-40字，说明这个工具是什么、用于什么场景）",
  "tags": ["3-5 个中文标签"],
  "detail": ["详细配置步骤第1条", "第2条", "..."]
}
要求：detail 是可直接复制到配置表中的具体命令与步骤，每行一条；不要编造不存在的命令；如不确定安装命令写通用说明。`,
    user: (f) => `工具名称：${f.name || '（未提供）'}${f.home ? `\n官网地址：${f.home}` : ''}\n${f.desc ? `已有描述（可参考润色）：${f.desc}` : ''}\n请生成该工具的录入内容（仅返回 JSON）。`,
  },
  skills: {
    need: ['intro'],
    system: `你是资深技术推荐助手。根据 Skill 名称与链接生成中文推荐语，必须只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块包裹，字段如下：
{
  "intro": "一段 40-80 字的中文简介，说明它是什么、解决什么问题、适合谁用",
  "desc": "一句话备注（10-20字）",
  "tags": ["2-4 个中文标签"]
}
要求：语言自然、不夸大；若信息不足按名称合理推断，不要编造具体版本号。`,
    user: (f) => `Skill 名称：${f.name || '（未提供）'}${f.web ? `\n链接：${f.web}` : ''}\n请生成推荐内容（仅返回 JSON）。`,
  },
  vpns: {
    need: ['desc'],
    system: `你是网络工具推荐助手。根据名称生成简短中文说明，必须只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块包裹，字段如下：
{
  "desc": "一句话中文说明（15-40字），说明定位与适用场景"
}
要求：中性客观，不承诺服务可用性。`,
    user: (f) => `名称：${f.name || '（未提供）'}${f.url ? `\n链接：${f.url}` : ''}\n请生成说明（仅返回 JSON）。`,
  },
  servers: {
    need: ['desc'],
    system: `你是 AI 接入平台信息助手。根据平台名称与接入地址生成中文说明，必须只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块包裹，字段如下：
{
  "desc": "一句话中文说明（15-50字），说明该 AI 直连平台的定位（如官方直连、聚合接入等）",
  "category": "分类，只能是：官方 / 国内 / 国际 之一",
  "region": "区域，如：美国 / 国内 / 全球"
}
要求：信息不足时 category 填"国际"、region 填"全球"，不要编造。`,
    user: (f) => `平台名称：${f.name || '（未提供）'}${f.url ? `\n接入地址：${f.url}` : ''}\n请生成说明（仅返回 JSON）。`,
  },
  tutorials: {
    need: ['summary', 'content'],
    system: `你是资深技术教程作者。根据标题生成一篇可直接发布的中文 Markdown 技术教程，必须只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块包裹整体，字段如下：
{
  "summary": "一句话摘要（30-60字）",
  "tags": ["3-5 个中文标签"],
  "content": "完整 Markdown 正文，使用 ## 二级标题分节，含引言/准备/步骤/常见问题，代码块用 \\"\\"\\" 语言围栏"
}
要求：内容实用、结构清晰；不确定的细节用通用写法，不要编造具体下载链接。`,
    user: (f) => `教程标题：${f.title || '（未提供）'}${f.category ? `\n分类：${f.category}` : ''}\n${f.summary ? `已有摘要：${f.summary}` : ''}\n请生成教程（仅返回 JSON）。`,
  },
};

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody(event);
  const spec = SPEC[body?.coll];
  if (!spec) throw createError({ statusCode: 400, statusMessage: '不支持该集合的 AI 生成' });
  const fields = body.fields || {};

  const keyField = fields.name || fields.title;
  if (!keyField || !String(keyField).trim()) {
    throw createError({ statusCode: 400, message: '请先填写名称/标题，再使用 AI 生成' });
  }

  const config = await resolveAiConfig(body.config);
  if (!config) {
    throw createError({
      statusCode: 503,
      message: 'AI 未配置：可在设置里填写 AI 配置（OpenAI 兼容格式），或在服务端配置 GLOBAL_AI_* / MongoDB GlobalAi',
    });
  }

  let raw;
  try {
    raw = await callChat(config, [
      { role: 'system', content: spec.system },
      { role: 'user', content: spec.user(fields) },
    ], { temperature: 0.5 });
  } catch (e) {
    throw createError({ statusCode: 502, message: '调用 AI 失败：' + (e?.message || e) });
  }

  let parsed;
  try {
    parsed = parseAiJson(raw);
  } catch (e) {
    throw createError({ statusCode: 422, message: e.message || 'AI 返回内容解析失败' });
  }

  const result = { ...parsed };
  if (result.tags !== undefined) result.tags = asStringArray(result.tags);
  for (const k of Object.keys(result)) {
    if (k !== 'tags' && k !== 'detail' && k !== 'content') result[k] = asString(result[k]);
  }
  if (typeof result.content === 'string' && result.content) result.content = parsed.content; // 正文保持原样（含换行）
  assertHasContent(result, spec.need);
  return result;
});
