// AI 调用代理：POST /api/tools/summarize（需管理密码 —— AI 功能仅后台可用）
// body: { content, mode, config? }
// mode: html（总结原始 HTML 正文）| md（总结 Markdown）| polish（教程润色）| continue（续写）| summary（摘要）
// config: { baseURL|baseUrl, apiKey, model }（可选，用户在页面现填、仅本次请求使用；
//         不填时服务端依次回退：MongoDB GlobalAi → 环境变量 GLOBAL_AI_*）
// 提示词与 ice-a/forword-api-record 的 ai/tutorial.post.ts 对齐。
import { createError, readBody } from 'h3';
import { resolveAiConfig, callChat } from '../../utils/ai';
import { requireAdmin } from '../../utils/auth';

const PROMPTS = {
  html: '请总结下面的 HTML 正文内容。忽略导航、广告、脚本、样式等噪声，输出：1. 一句话概括；2. 要点列表；3. 重要事实或结论；4. 适合归档的标签。',
  md: '请总结下面已经提取成 Markdown 的文章内容，输出：1. 一句话概括；2. 要点列表；3. 重要事实或结论；4. 适合归档的标签。',
  polish: {
    system:
      '你是资深技术教程编辑。对用户提供的 Markdown 教程正文进行润色：修正错别字与语病、优化排版与标题层级、使表达更清晰流畅。保留原有结构与代码块内容不变，只做改进。直接输出润色后的完整 Markdown，不要任何解释。',
    temperature: 0.5,
    limit: 60000,
  },
  continue: {
    system:
      '你是资深技术教程作者。根据用户提供的 Markdown 教程已有内容，自然地续写 300-600 字的后续章节，延续现有风格与层级。直接输出续写部分的 Markdown（从合适的标题或段落开始），不要重复已有内容，不要任何解释。',
    temperature: 0.5,
    limit: 3000,
    tail: true,
  },
  summary: {
    system:
      '你是技术教程摘要助手。根据用户提供的 Markdown 教程内容，生成一段简洁的中文摘要（60-120 字），概括教程主题与要点。直接输出摘要文字，不要引号、不要任何解释。',
    temperature: 0.2,
    limit: 3000,
  },
};

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody(event);
  if (!body || !body.content) {
    throw createError({ statusCode: 400, statusMessage: '缺少 content' });
  }
  const config = await resolveAiConfig(body.config);
  if (!config) {
    throw createError({
      statusCode: 503,
      message: 'AI 未配置：可在设置里填写 AI 配置（OpenAI 兼容格式），或在服务端配置 GLOBAL_AI_* / MongoDB GlobalAi',
    });
  }
  const p = PROMPTS[body.mode] || PROMPTS.md;
  const promptText = typeof p === 'string' ? p : p.system;
  const sliced = p.tail
    ? String(body.content).slice(-p.limit)
    : String(body.content).slice(0, p.limit || 60000);
  const text = await callChat(
    config,
    [
      { role: 'system', content: promptText },
      { role: 'user', content: sliced },
    ],
    { temperature: p.temperature ?? 0.2 },
  );
  if (!text) throw createError({ statusCode: 422, message: 'AI 未返回内容，请重试' });
  return { text };
});
