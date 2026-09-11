// 中转站相关服务端工具：OpenAI 兼容接口的模型列表拉取 + 站点连通性探测。
// 这些请求都在服务端发（浏览器直连中转站会被 CORS 拦截，且 apiKey 不该暴露）。
import { createError } from 'h3';

function normalizeBase(baseURL) {
  let base = (baseURL || '').trim().replace(/\/+$/, '');
  if (!base) throw createError({ statusCode: 400, statusMessage: 'baseURL 不能为空' });
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base;
}

// Base URL 只填根域名也行：依次尝试 OpenAI 兼容的多种模型列表路径
function modelEndpointCandidates(baseURL) {
  const base = normalizeBase(baseURL);
  return [
    `${base}/v1/models`,
    `${base}/api/v1/models`,
    `${base}/models`,
    `${base}/api/models`,
  ];
}

export async function fetchModels(baseURL, apiKey) {
  let lastError = '未知错误';
  for (const url of modelEndpointCandidates(baseURL)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      if (res.status === 401 || res.status === 403) {
        throw createError({ statusCode: 401, statusMessage: 'API Key 无效（上游返回 401/403）' });
      }
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const body = await res.json().catch(() => null);
      const list = body && (body.data || body.models || body.result);
      if (!Array.isArray(list) || !list.length) {
        lastError = '响应里没有模型列表';
        continue;
      }
      const ids = list
        .map((m) => (typeof m === 'string' ? m : m.id || m.name || m.model))
        .filter(Boolean)
        .sort();
      return ids;
    } catch (e) {
      if (e.statusCode === 401) throw e;
      lastError = e.message || String(e);
    }
  }
  throw createError({ statusCode: 502, statusMessage: `拉取模型失败：${lastError}` });
}

// 站点连通性探测：HTTP < 500 算可达（403/404 也说明服务在运行）
export async function probeUrl(url) {
  let target = (url || '').trim().replace(/\/+$/, '');
  if (!target) throw createError({ statusCode: 400, statusMessage: 'url 不能为空' });
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
  const started = Date.now();
  for (const proto of ['https', 'http']) {
    const u = target.replace(/^https?:\/\//i, `${proto}://`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(u, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'NavCockpit/2.0' },
      });
      return { ok: res.status < 500, status: res.status, ms: Date.now() - started };
    } catch (e) {
      if (proto === 'http') {
        return { ok: false, status: 0, ms: Date.now() - started };
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
