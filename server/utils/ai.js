// OpenAI 兼容接口代理（移植自 html_to_markdown_by_ai 与 forword-api-record 的 AI 调用逻辑）：
// 配置优先级：请求里现填的 config > MongoDB 里的 GlobalAi > 环境变量 GLOBAL_AI_*。
// Key 全程在服务端请求头里，不落到页面源码。

function buildEndpointCandidates(baseURL) {
  let base = (baseURL || '').trim().replace(/\/+$/, '');
  if (!base) return [];
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  // 用户直接填了完整端点
  if (/\/chat\/completions$/i.test(base)) return [base];
  // 依次尝试：版本前缀式（/v1、/v4、/api/paas/v4 等直接拼）→ 裸域名补 /v1 → 其他常见变体
  return [...new Set([
    `${base}/chat/completions`,
    `${base}/v1/chat/completions`,
    `${base}/api/v1/chat/completions`,
    `${base}/api/openai/v1/chat/completions`,
  ])];
}

export async function resolveAiConfig(explicit) {
  // 兼容 baseUrl / baseURL 两种键名（前端 useSettings 存的是 baseURL）
  const eBase = explicit && (explicit.baseURL || explicit.baseUrl);
  const eKey = explicit && explicit.apiKey;
  if (eBase && eKey) {
    return { baseUrl: eBase, apiKey: eKey, model: explicit.model || 'gpt-4o-mini' };
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickUpstreamMessage(errBody) {
  try {
    const j = JSON.parse(errBody);
    return j?.error?.message || j?.message || errBody.slice(0, 120);
  } catch {
    return (errBody || '').slice(0, 120);
  }
}

export async function callChat(config, messages, { temperature = 0.2 } = {}) {
  const body = JSON.stringify({ model: config.model, temperature, messages });
  const candidates = buildEndpointCandidates(config.baseUrl);
  if (!candidates.length) {
    throw new Error('Base URL 为空，无法调用 AI');
  }
  let lastError = '未知错误';
  let firstError = ''; // 第一个候选端点（最可能是正确路径）的错误，作为主报告
  const tried = [];

  for (const url of candidates) {
    tried.push(url);
    // 每个候选端点最多尝试 3 次：429/5xx 属瞬时错误（如免费模型过载），退避后重试
    for (let attempt = 0; attempt < 3; attempt++) {
      let nextCandidate = true;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 60000);
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
        if (res.ok) {
          const payload = await res.json().catch(() => null);
          const text = payload?.choices?.[0]?.message?.content;
          if (text) return text;
          lastError = '响应格式异常';
        } else {
          const upstream = pickUpstreamMessage(await res.text().catch(() => ''));
          lastError = `HTTP ${res.status}${upstream ? '：' + upstream : ''}`;
          if (res.status === 429 || res.status >= 500) {
            nextCandidate = false; // 退避后重试同一端点
          }
        }
      } catch (e) {
        if (/401|403/.test(e.message)) throw e;
        lastError = /abort|timeout/i.test(e.message)
          ? '请求超时（上游长时间无响应，可能过载或网络不通）'
          : e.message || String(e);
      }
      if (nextCandidate) break;
      await sleep(1500 * (attempt + 1));
    }
    if (!firstError) firstError = lastError;
  }
  // 主报告第一个端点的错误（它最可能是正确路径），避免后续错误端点的 404 掩盖真实原因
  const others = tried.length > 1 ? `（另试过 ${tried.length - 1} 个备用路径）` : '';
  throw new Error(
    `${firstError}${others}。` +
      `429/模型过载请稍后再试或换模型；404 请检查 Base URL（示例：https://api.openai.com 、https://open.bigmodel.cn/api/paas/v4）`,
  );
}
