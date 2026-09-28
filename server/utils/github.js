// GitHub 仓库抓取（与 Cloudflare 完全解耦，没有 CF_API_TOKEN 也能用）。
//  - 取「全部」公开仓库（分页拉取，上限 GH_MAX_PAGES × 100）
//  - 默认按最近推送时间倒序（GitHub 的 sort=pushed 只是入参，这里再显式排一次，保证顺序确定）
//  - 带进程内缓存，避免反复吃 GitHub 未登录 60 次/小时的限流

const DEFAULT_GH_USER = 'ice-a';
const GH_USER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const PER_PAGE = 100;
const GH_MAX_PAGES = 10; // 最多 1000 个仓库，防止超大户把分页打满
const GH_CACHE_TTL_MS = 10 * 60 * 1000;

const repoCache = new Map();
const profileCache = new Map();

export function parseGithubUser(raw) {
  const s = (raw || '').trim();
  return GH_USER_RE.test(s) ? s : '';
}

function ghHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'NavCockpit',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function mapRepo(r) {
  return {
    name: r.name,
    fullName: r.full_name,
    private: Boolean(r.private),
    fork: Boolean(r.fork),
    archived: Boolean(r.archived),
    url: r.html_url,
    description: r.description || '',
    language: r.language || '',
    topics: Array.isArray(r.topics) ? r.topics : [],
    stars: r.stargazers_count || 0,
    forks: r.forks_count || 0,
    homepage: r.homepage || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    pushedAt: r.pushed_at,
  };
}

// 时间倒序：优先最近推送，其次最近更新，最后按名字稳定排序
function byTimeDesc(a, b) {
  const at = Date.parse(b.pushedAt || b.updatedAt || 0) || 0;
  const bt = Date.parse(a.pushedAt || a.updatedAt || 0) || 0;
  return at - bt || a.name.localeCompare(b.name);
}

// 拉全部仓库（带缓存）。username 为空且给了 token 时取 token 本人（含私有）。
export async function fetchAllRepos({ token = '', username = '' } = {}) {
  const requested = parseGithubUser(username);
  const configured = parseGithubUser(process.env.GH_USERNAME || '');
  const name = requested || configured;
  const mode = name ? 'user' : token ? 'own' : 'user';
  const user = mode === 'user' ? name || DEFAULT_GH_USER : '';
  const cacheKey = mode === 'own' ? ':own:' : `user:${user.toLowerCase()}`;

  const hit = repoCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GH_CACHE_TTL_MS) return hit.data;

  const headers = ghHeaders(token);
  const base =
    mode === 'own'
      ? `https://api.github.com/user/repos?per_page=${PER_PAGE}&sort=pushed&direction=desc&visibility=all&affiliation=owner`
      : `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=${PER_PAGE}&sort=pushed&direction=desc`;

  const repos = [];
  let error = '';
  let truncated = false;

  try {
    for (let page = 1; page <= GH_MAX_PAGES; page++) {
      const res = await fetch(`${base}&page=${page}`, { headers });
      if (!res.ok) {
        const hint = res.status === 403 || res.status === 429 ? '（可能触发 GitHub 限流，请稍后再试或配置 GH_TOKEN）' : '';
        throw new Error(`GitHub API HTTP ${res.status}${hint}`);
      }
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) break;
      repos.push(...list.map(mapRepo));
      if (list.length < PER_PAGE) break;
      if (page === GH_MAX_PAGES) truncated = true;
    }
  } catch (e) {
    // 已经拿到一部分就先给出去，别整块失败
    if (!repos.length) {
      const data = { source: mode, user, error: e.message, repos: [], total: 0, truncated: false };
      repoCache.set(cacheKey, { data, at: Date.now() - GH_CACHE_TTL_MS + 60 * 1000 });
      return data;
    }
    error = e.message;
  }

  repos.sort(byTimeDesc);
  const data = { source: mode, user, error, repos, total: repos.length, truncated };
  repoCache.set(cacheKey, { data, at: Date.now() });
  return data;
}

// 用户资料（用于显示「公开仓库总数」等）——失败不影响主流程
export async function fetchUserProfile({ token = '', username = '' } = {}) {
  const requested = parseGithubUser(username);
  const configured = parseGithubUser(process.env.GH_USERNAME || '');
  const name = requested || configured;
  const mode = name ? 'user' : token ? 'own' : 'user';
  const user = mode === 'user' ? name || DEFAULT_GH_USER : '';
  const cacheKey = mode === 'own' ? ':own:' : `user:${user.toLowerCase()}`;

  const hit = profileCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GH_CACHE_TTL_MS) return hit.data;

  const url = mode === 'own' ? 'https://api.github.com/user' : `https://api.github.com/users/${encodeURIComponent(user)}`;
  let profile = null;
  try {
    const res = await fetch(url, { headers: ghHeaders(token) });
    if (res.ok) {
      const u = await res.json();
      profile = {
        login: u.login || user,
        name: u.name || '',
        avatar: u.avatar_url || '',
        bio: u.bio || '',
        htmlUrl: u.html_url || (u.login ? `https://github.com/${u.login}` : ''),
        publicRepos: u.public_repos ?? null,
        followers: u.followers ?? null,
      };
    }
  } catch {
    profile = null;
  }
  profileCache.set(cacheKey, { data: profile, at: Date.now() });
  return profile;
}

// 关键词过滤：名称 / 描述 / 语言 / 标签 / 完整名
export function filterRepos(repos, keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return repos;
  const parts = q.split(/\s+/).filter(Boolean);
  return repos.filter((r) => {
    const hay = `${r.name} ${r.fullName} ${r.description} ${r.language} ${(r.topics || []).join(' ')}`.toLowerCase();
    return parts.every((p) => hay.includes(p));
  });
}

// 对外统一入口
export async function getUserRepos({ token = '', user = '', q = '', includeForks = true } = {}) {
  const [repoData, profile] = await Promise.all([
    fetchAllRepos({ token, username: user }),
    fetchUserProfile({ token, username: user }).catch(() => null),
  ]);
  const base = includeForks ? repoData.repos : repoData.repos.filter((r) => !r.fork);
  const filtered = filterRepos(base, q);
  return {
    source: repoData.source,
    user: repoData.user,
    error: repoData.error,
    profile,
    total: base.length,
    matched: filtered.length,
    truncated: repoData.truncated,
    repos: filtered,
  };
}
