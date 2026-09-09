// AI 调用代理：POST /api/tools/summarize
// body: { content, mode, config? }
// mode: html（总结原始 HTML 正文）| md（总结 Markdown）| polish（教程润色）| continue（续写）| summary（摘要）
// config: { baseUrl, apiKey, model }（可选，用户在页面现填、仅本次请求使用；
//         不填时服务端依次回退：MongoDB GlobalAi → 环境变量 GLOBAL_AI_*）
import { createError, readBody } from 'h3';
import { resolveAiConfig, callChat } from '../../utils/ai';

const PROMPTS = {
  html: '请总结下面的 HTML 正文内容。忽略导航、广告、脚本、样式等噪声，输出：1. 一句话概括；2. 要点列表；3. 重要事实或结论；4. 适合归档的标签。',
  md: '请总结下面已经提取成 Markdown 的文章内容，输出：1. 一句话概括；2. 要点列表；3. 重要事实或结论；4. 适合归档的标签。',
  polish: '请润色下面的 Markdown 教程，保持结构与代码块不变，让语言更通顺专业，直接输出润色后的全文。',
  continue: '请继续续写下面的 Markdown 教程，衔接上下文与语气，直接输出续写内容。',
  summary: '请为下面的教程内容生成一段 100 字以内的中文摘要。',
};

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body || !body.content) {
    throw createError({ statusCode: 400, statusMessage: '缺少 content' });
  }
  const config = await resolveAiConfig(body.config);
  if (!config) {
    throw createError({
      statusCode: 503,
      message: 'AI 未配置：可在页面填写 AI 配置，或在服务端配置 GLOBAL_AI_* / MongoDB GlobalAi',
    });
  }
  const prompt = PROMPTS[body.mode] || PROMPTS.md;
  const text = await callChat(config, [
    { role: 'system', content: '你是一个严谨的中文内容归档助手，输出简洁、结构化的中文内容。' },
    { role: 'user', content: `${prompt}\n\n---\n\n${String(body.content).slice(0, 60000)}` },
  ]);
  return { text };
});
