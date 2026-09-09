// OpenAI 兼容接口代理（移植自 html_to_markdown_by_ai 与 forword-api-record 的 AI 调用逻辑）：
// 配置优先级：请求里现填的 config > MongoDB 里的 GlobalAi > 环境变量 GLOBAL_AI_*。
// Key 全程在服务端请求头里，不落到页面源码。

function buildEndpointCandidates(baseURL) {
  let base = (baseURL || '').trim().replace(/\/+$/, '');
  if (!base) return [];
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return [
    `${base}/v1/chat/completions`,
    `${base}/chat/completions`,
    `${base}/api/v1/chat/completions`,
    `${base}/api/openai/v1/chat/completions`,
  ];
}

export async function resolveAiConfig(explicit) {
  if (explicit && explicit.baseUrl && explicit.apiKey) {
    return { baseUrl: explicit.baseUrl, apiKey: explicit.apiKey, model: explicit.model || 'gpt-4o-mini' };
  }
  // MongoDB 里的全局 AI 配置（可选）
  if (process.env.MONGODB_URI) {
    try {
      const { getDb } = await import('./db');
      await getDb();
      const { getModel } = await import('./models');
      const GlobalAi = getModel('GlobalAi');
      if (GlobalAi) {
        const cfg = await GlobalAi.findOne().sort({ updatedAt: -1 }).lean();
        if (cfg && cfg.baseURL && cfg.apiKey) {
          return { baseUrl: cfg.baseURL, apiKey: cfg.apiKey, model: cfg.models?.[0] || 'gpt-4o-mini' };
        }
      }
    } catch {
      // DB 不可用时静默回退环境变量
    }
  }
  if (process.env.GLOBAL_AI_BASE_URL && process.env.GLOBAL_AI_API_KEY) {
    return {
      baseUrl: process.env.GLOBAL_AI_BASE_URL,
      apiKey: process.env.GLOBAL_AI_API_KEY,
      model: process.env.GLOBAL_AI_MODEL || 'gpt-4o-mini',
    };
  }
  return null;
}

export async function callChat(config, messages, { temperature = 0.2 } = {}) {
  const body = JSON.stringify({ model: config.model, temperature, messages });
  let lastError = '未知错误';
  for (const url of buildEndpointCandidates(config.baseUrl)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120000);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body,
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      if (res.status === 401 || res.status === 403) {
        throw new Error('API Key 无效（上游返回 401/403）');
      }
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const payload = await res.json().catch(() => null);
      const text = payload?.choices?.[0]?.message?.content;
      if (text) return text;
      lastError = '响应格式异常';
    } catch (e) {
      if (/401|403/.test(e.message)) throw e;
      lastError = e.message || String(e);
    }
  }
  throw new Error(`AI 调用失败：${lastError}`);
}
