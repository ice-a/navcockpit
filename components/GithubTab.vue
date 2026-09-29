<script setup>
// GitHub 板块：热门用户墙 + 仓库列表。
// 仓库有两种搜索模式（顶部「当前用户 / GitHub 全站」分段切换）：
//   · 当前用户：拉该用户「全部」公开仓库（/api/github/repos），关键词在已加载列表上本地过滤（即时）
//   · GitHub 全站：走 /api/github/search，按相关度搜全站仓库
// 没配 CF_API_TOKEN 也能用；配 GH_TOKEN 可读私有仓库并放宽限流。
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { IconGithub, IconLock, IconStar, IconCode, IconArchive, IconClockCircle, IconSearch, IconLaunch } from '@arco-design/web-vue/es/icon';
import ShareButton from '~/components/ShareButton.vue';

const data = ref(null);
const error = ref('');
const loading = ref(true);
const ghInput = ref('');
const keyword = ref('');
const creators = ref([]);
const ghInputEl = ref(null);

const PAGE_STEP = 60;
const visibleCount = ref(PAGE_STEP);

// ── 搜索模式与全站搜索结果 ──
const mode = ref('user'); // 'user' | 'all'
const ghQuery = ref('');
const ghItems = ref([]);
const ghTotal = ref(0);
const ghIncomplete = ref(false);
const ghPage = ref(0);
const ghSearching = ref(false);
const ghLoadingMore = ref(false);
const ghSearchError = ref('');
const GH_PAGE_SIZE = 30;
const GH_SEARCH_MAX = 1000; // GitHub 搜索最多返回 1000 条

const repos = computed(() => (data.value && Array.isArray(data.value.repos) ? data.value.repos : []));
const profile = computed(() => (data.value && data.value.profile) || null);
const loadedUser = computed(() => (data.value && data.value.user) || '');

// 当前用户模式：关键词搜索，与后端 filterRepos 同口径，在已加载的全量列表上本地过滤（即时、不再打 GitHub）
const filtered = computed(() => {
  const parts = keyword.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return repos.value;
  return repos.value.filter((r) => {
    const hay = `${r.name} ${r.fullName} ${r.description} ${r.language} ${(r.tags || r.topics || []).join(' ')}`.toLowerCase();
    return parts.every((p) => hay.includes(p));
  });
});

const visibleRepos = computed(() => filtered.value.slice(0, visibleCount.value));
const remaining = computed(() => Math.max(0, filtered.value.length - visibleCount.value));

watch(keyword, () => { visibleCount.value = PAGE_STEP; });

// 两个模式共用一个输入框：按当前模式读写各自的搜索词
const searchText = computed({
  get: () => (mode.value === 'user' ? keyword.value : ghQuery.value),
  set: (v) => { if (mode.value === 'user') keyword.value = v; else ghQuery.value = v; },
});

const displayRepos = computed(() => (mode.value === 'user' ? visibleRepos.value : ghItems.value));

const replyLimit = computed(() => Math.min(ghTotal.value, GH_SEARCH_MAX));
const hasMore = computed(() => (mode.value === 'user' ? remaining.value > 0 : ghItems.value.length < replyLimit.value));

// 请求失败或 GitHub 返回的限流/报错，统一在页面上显示出来
const errorText = computed(() => {
  if (mode.value === 'all') return ghSearchError.value;
  return error.value || (data.value && data.value.error) || '';
});

const showLoading = computed(() => (mode.value === 'user' ? loading.value : ghSearching.value && !ghItems.value.length));

const countText = computed(() => {
  if (mode.value === 'user') return `匹配 ${filtered.value.length} / 共 ${repos.value.length} 个`;
  if (!ghQuery.value.trim()) return ''; // 还没搜，不显示「共 0 个结果」
  const bits = [`共 ${ghTotal.value} 个结果`];
  if (ghItems.value.length && ghItems.value.length < replyLimit.value) bits.push(`已加载 ${ghItems.value.length} 个`);
  if (ghIncomplete.value) bits.push('GitHub 统计不完整');
  return bits.join(' · ');
});

const moreText = computed(() => (mode.value === 'user' ? `还有 ${remaining.value} 个` : `还剩 ${replyLimit.value - ghItems.value.length} 个`));

const emptyText = computed(() => {
  if (mode.value === 'user') return repos.value.length ? '没有匹配该关键词的仓库' : '';
  if (ghSearchError.value) return ''; // 出错时上面已有 alert，不再重复提示
  if (!ghQuery.value.trim()) return '输入关键词即可搜索 GitHub 全站仓库，支持 language: / stars: / owner: 等限定语法';
  return '没有搜索到相关仓库，换个关键词试试';
});

const summary = computed(() => {
  if (mode.value === 'all') return 'GitHub 全站搜索 · 按相关度排序';
  const p = profile.value;
  const totalPublic = p && p.publicRepos != null ? p.publicRepos : null;
  const loaded = repos.value.length;
  const bits = [];
  if (totalPublic != null) bits.push(`${totalPublic} 个公开仓库`);
  if (totalPublic != null && loaded && loaded !== totalPublic) bits.push(`已加载 ${loaded} 个`);
  else if (totalPublic == null && loaded) bits.push(`${loaded} 个仓库`);
  if (data.value && data.value.truncated) bits.push('（超出单次上限，仅展示前 1000 个）');
  bits.push('按最近推送时间排序');
  return bits.join(' · ');
});

function shareUser(u) {
  return { type: 'user', refId: u.login, title: `@${u.login}`, desc: u.note || 'GitHub 用户', url: `https://github.com/${u.login}`, badge: '👤 GitHub 用户' };
}
function shareRepo(repo) {
  return { type: 'repo', refId: repo.fullName, title: repo.name, desc: repo.description || repo.fullName, url: repo.url || '', badge: repo.private ? '🔒 私有仓库' : '📦 公开仓库' };
}
function repoTitle(repo) {
  return mode.value === 'all' && repo.fullName ? repo.fullName : repo.name;
}

function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return `${Math.floor(s / 86400 / 30)} 个月前`;
}
function fullTime(iso) {
  return iso ? new Date(iso).toLocaleString() : '';
}

async function fetchData(userInitiated = false) {
  error.value = '';
  loading.value = true;
  try {
    const u = ghInput.value.trim();
    const res = await fetch(`/api/github/repos${u ? `?user=${encodeURIComponent(u)}` : ''}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || body.statusMessage || `HTTP ${res.status}`);
    data.value = body;
    if (body.user) ghInput.value = body.user;
    visibleCount.value = PAGE_STEP;
    if (userInitiated && body.user) {
      try {
        await fetch('/api/creators', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: body.user }) });
        await loadCreators();
      } catch {}
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

// GitHub 全站搜索：reset=true 从头搜，否则续页
async function runGhSearch({ reset = true } = {}) {
  const q = ghQuery.value.trim();
  if (!q) {
    ghItems.value = [];
    ghTotal.value = 0;
    ghPage.value = 0;
    ghSearchError.value = '';
    return;
  }
  if (reset) {
    ghSearching.value = true;
    ghItems.value = [];
    ghTotal.value = 0;
    ghPage.value = 0;
    ghSearchError.value = '';
  } else {
    if (ghItems.value.length >= replyLimit.value) return;
    ghLoadingMore.value = true;
  }
  try {
    const page = ghPage.value + 1;
    const res = await fetch(`/api/github/search?q=${encodeURIComponent(q)}&page=${page}&per_page=${GH_PAGE_SIZE}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || body.statusMessage || `HTTP ${res.status}`);
    if (body.error) throw new Error(body.error);
    ghTotal.value = body.total || 0;
    ghIncomplete.value = Boolean(body.incomplete);
    const items = Array.isArray(body.items) ? body.items : [];
    ghItems.value = reset ? items : [...ghItems.value, ...items];
    ghPage.value = page;
  } catch (e) {
    ghSearchError.value = e.message;
  } finally {
    ghSearching.value = false;
    ghLoadingMore.value = false;
  }
}

let ghTimer = null;
watch(ghQuery, () => {
  clearTimeout(ghTimer);
  ghTimer = setTimeout(() => runGhSearch({ reset: true }), 400);
});
// 切到全站模式时，若已有输入但还没结果，补一次搜索
watch(mode, (m) => {
  if (m === 'all' && ghQuery.value.trim() && !ghItems.value.length && !ghSearchError.value) runGhSearch({ reset: true });
});

function loadMore() {
  if (mode.value === 'all') runGhSearch({ reset: false });
  else visibleCount.value += PAGE_STEP;
}

function onSearchEnter() {
  if (mode.value === 'all') {
    clearTimeout(ghTimer);
    runGhSearch({ reset: true });
  }
}

async function loadCreators() {
  try {
    creators.value = await fetch('/api/creators').then((r) => (r.ok ? r.json() : []));
  } catch {
    creators.value = [];
  }
}

function selectUser(login) {
  mode.value = 'user';
  if (ghInput.value === login) return;
  ghInput.value = login;
  fetchData();
}

function onSelectEvent(e) {
  selectUser(e.detail);
}
function onFocusEvent() {
  ghInputEl.value?.focus();
}

onMounted(() => {
  fetchData();
  loadCreators();
  window.addEventListener('select-gh-user', onSelectEvent);
  window.addEventListener('focus-gh-search', onFocusEvent);
});
onUnmounted(() => {
  clearTimeout(ghTimer);
  window.removeEventListener('select-gh-user', onSelectEvent);
  window.removeEventListener('focus-gh-search', onFocusEvent);
});
</script>

<template>
  <div>
    <section v-if="creators.length">
      <h2 class="zone">
        热门 GitHub 用户
        <small>点击卡片查看 TA 的公开仓库 · 搜索也会加入此列表</small>
      </h2>
      <div class="wall">
        <a-card
          v-for="u in creators"
          :key="u.login"
          size="small"
          hoverable
          class="gh-user"
          :class="{ active: loadedUser === u.login }"
          :body-style="{ padding: '14px 8px' }"
          @click="selectUser(u.login)"
        >
          <img :src="`https://github.com/${u.login}.png?size=64`" :alt="u.login" class="gh-avatar" loading="lazy" />
          <div class="gh-login">@{{ u.login }}</div>
          <div class="gh-note">{{ u.note || (u.addedByUser ? '你搜索过' : '') }}</div>
          <ShareButton :payload="shareUser(u)" :label="`分享 @${u.login}`" />
        </a-card>
      </div>
    </section>

    <section>
      <h2 class="zone">
        GitHub 仓库
        <small>{{ summary }}</small>
      </h2>

      <a-radio-group v-model="mode" type="button" size="small" class="repo-mode">
        <a-radio value="user">当前用户</a-radio>
        <a-radio value="all">GitHub 全站</a-radio>
      </a-radio-group>

      <div v-if="mode === 'user'" class="gh-form">
        <a-input ref="ghInputEl" v-model="ghInput" class="flex-1" placeholder="输入任意 GitHub 用户名后回车，如 gaearon" @keyup.enter="fetchData(true)" />
        <a-button type="primary" :loading="loading" @click="fetchData(true)">加载</a-button>
      </div>

      <a-alert v-if="errorText" type="error" :title="errorText" />

      <div v-if="mode === 'all' || (!errorText && repos.length)" class="repo-toolbar">
        <a-input
          v-model="searchText"
          allow-clear
          class="repo-search"
          :placeholder="mode === 'user' ? '搜索仓库：名称 / 描述 / 语言 / 标签（空格分隔多个关键词）' : '搜索 GitHub 全站仓库，如 vue dashboard'"
          @keyup.enter="onSearchEnter"
        >
          <template #prefix><IconSearch /></template>
        </a-input>
        <a-button v-if="mode === 'all'" :loading="ghSearching" @click="runGhSearch({ reset: true })">搜索</a-button>
        <span class="repo-count">{{ countText }}</span>
      </div>

      <div v-if="displayRepos.length" class="grid">
        <a-card
          v-for="repo in displayRepos"
          :key="repo.fullName"
          size="small"
          hoverable
          class="gh-repo"
          :class="{ dead: repo.private }"
          :body-style="{ padding: '14px 16px', height: '100%' }"
        >
          <div class="repo-head">
            <IconLock v-if="repo.private" />
            <IconGithub v-else />
            <span class="repo-name">{{ repoTitle(repo) }}</span>
            <a-tag v-if="repo.private" size="small" color="orange">Private</a-tag>
            <a-tag v-else-if="repo.fork" size="small" color="gray">Fork</a-tag>
          </div>
          <div class="gh-desc">{{ repo.description || repo.fullName }}</div>
          <div class="repo-meta">
            <span v-if="repo.language"><IconCode /> {{ repo.language }}</span>
            <span><IconStar /> {{ repo.stars }}</span>
            <span v-if="repo.archived"><IconArchive /> 已归档</span>
            <span :title="'最近推送：' + fullTime(repo.pushedAt)"><IconClockCircle /> 更新于 {{ timeAgo(repo.pushedAt) }}</span>
          </div>
          <div class="repo-actions">
            <ShareButton :payload="shareRepo(repo)" :label="'分享 ' + repo.name" />
            <a-button v-if="repo.url" size="mini" type="text" :href="repo.url" target="_blank" rel="noopener">
              <template #icon><IconLaunch /></template>
              打开
            </a-button>
          </div>
        </a-card>
      </div>

      <div v-if="hasMore" class="repo-more">
        <a-button :loading="ghLoadingMore" @click="loadMore">显示更多（{{ moreText }}）</a-button>
      </div>

      <a-empty v-if="!showLoading && !errorText && !displayRepos.length && emptyText">
        <div class="empty-title">{{ emptyText }}</div>
        <a-tooltip v-if="mode === 'all' && !ghQuery.trim()" position="top" :content-style="{ maxWidth: '420px' }">
          <template #content>
            <div class="gh-syntax-tip">
              <div class="tip-head">可用限定语法（多个条件用空格分隔即为「与」）</div>
              <div><code>language:rust</code> 按编程语言筛选</div>
              <div><code>stars:&gt;1000</code> 按 Star 数筛选，支持 <code>&gt;</code> <code>&gt;=</code> <code>&lt;</code> <code>&lt;=</code> 区间</div>
              <div><code>owner:nuxt</code> 按仓库作者筛选</div>
              <div><code>topic:cli</code> 按标签筛选</div>
              <div><code>fork:true</code> 包含 fork 仓库</div>
            </div>
          </template>
          <span class="empty-sub">例：vue dashboard · language:rust stars:&gt;1000 · owner:nuxt</span>
        </a-tooltip>
      </a-empty>
      <div v-if="showLoading" class="loading">{{ mode === 'user' ? '正在加载 GitHub 仓库…' : '正在搜索 GitHub…' }}</div>
    </section>
  </div>
</template>

<style scoped>
.gh-user {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  cursor: pointer;
  position: relative;
  height: 100%;
}
.gh-user :deep(.arco-card-body) { display: flex; flex-direction: column; align-items: center; height: 100%; }
.gh-user.active { box-shadow: 0 0 0 1px rgb(var(--primary-6)); }
.gh-avatar { width: 44px; height: 44px; border-radius: 50%; background: var(--border); flex: 0 0 44px; }
.gh-login { font-size: 13px; font-weight: 600; margin-top: 6px; }
.gh-note { font-size: 11px; color: var(--text-dim); }

.repo-mode { margin-bottom: 12px; }

.repo-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.repo-search { flex: 1 1 320px; min-width: min(320px, 100%); }
.repo-count { font-size: 12px; color: var(--text-dim); white-space: nowrap; }

.gh-repo { position: relative; height: 148px; display: flex; flex-direction: column; }
.gh-repo :deep(.arco-card-body) { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.gh-repo.dead { opacity: 0.6; }
/* 右上角是绝对定位的分享按钮，标题行给它留出位置，避免和 Fork/Private 标签叠在一起 */
.repo-head { display: flex; align-items: center; gap: 8px; min-width: 0; padding-right: 30px; }
.repo-name { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.repo-head .arco-tag { margin-left: auto; }
.gh-desc { font-size: 12px; color: var(--text-dim); margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.repo-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--text-dim); margin-top: auto; padding-top: 8px; }
.repo-meta > span { display: inline-flex; align-items: center; gap: 4px; }
.repo-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.repo-more { display: flex; justify-content: center; margin-top: 16px; }
.empty-title { color: var(--text-dim); }
.empty-sub {
  display: inline-block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-dim);
  opacity: 0.75;
  cursor: help;
  border-bottom: 1px dashed currentColor;
}
.empty-sub:hover { opacity: 1; }
</style>

<!-- Arco Tooltip 的内容会被 teleport 到 body，scoped 样式够不到，故用带前缀的全局类 -->
<style>
.gh-syntax-tip { display: flex; flex-direction: column; gap: 4px; line-height: 1.6; }
.gh-syntax-tip > div { white-space: nowrap; }
.gh-syntax-tip .tip-head { opacity: 0.7; margin-bottom: 2px; }
.gh-syntax-tip code {
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(127, 127, 127, 0.22);
  font-size: 12px;
}
</style>
