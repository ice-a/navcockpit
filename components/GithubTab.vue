<script setup>
// GitHub 板块：热门用户墙 + 仓库列表。
// 仓库走独立的 /api/github/repos（不依赖 Cloudflare，没配 CF_API_TOKEN 也能用）：
//   · 拉该用户「全部」公开仓库，按最近推送时间倒序
//   · 支持关键词搜索（名称 / 描述 / 语言 / 标签，空格分隔多个关键词）
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

const repos = computed(() => (data.value && Array.isArray(data.value.repos) ? data.value.repos : []));
const profile = computed(() => (data.value && data.value.profile) || null);
const loadedUser = computed(() => (data.value && data.value.user) || '');

// 关键词搜索：与后端 filterRepos 同口径，在已加载的全量列表上本地过滤（即时、不再打 GitHub）
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

// 请求失败或 GitHub 返回的限流/报错，统一在页面上显示出来
const errorText = computed(() => error.value || (data.value && data.value.error) || '');

const summary = computed(() => {
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

async function loadCreators() {
  try {
    creators.value = await fetch('/api/creators').then((r) => (r.ok ? r.json() : []));
  } catch {
    creators.value = [];
  }
}

function selectUser(login) {
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

      <div class="gh-form">
        <a-input ref="ghInputEl" v-model="ghInput" class="flex-1" placeholder="输入任意 GitHub 用户名后回车，如 gaearon" @keyup.enter="fetchData(true)" />
        <a-button type="primary" :loading="loading" @click="fetchData(true)">加载</a-button>
      </div>

      <a-alert v-if="errorText" type="error" :title="errorText" />

      <div v-if="!errorText && repos.length" class="repo-toolbar">
        <a-input v-model="keyword" allow-clear class="repo-search" placeholder="搜索仓库：名称 / 描述 / 语言 / 标签（空格分隔多个关键词）">
          <template #prefix><IconSearch /></template>
        </a-input>
        <span class="repo-count">匹配 {{ filtered.length }} / 共 {{ repos.length }} 个</span>
      </div>

      <div v-if="visibleRepos.length" class="grid">
        <a-card
          v-for="repo in visibleRepos"
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
            <span class="repo-name">{{ repo.name }}</span>
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

      <div v-if="remaining" class="repo-more">
        <a-button @click="visibleCount += PAGE_STEP">显示更多（还有 {{ remaining }} 个）</a-button>
      </div>

      <a-empty v-if="!loading && !errorText && repos.length && !filtered.length" description="没有匹配该关键词的仓库" />
      <div v-if="loading" class="loading">正在加载 GitHub 仓库…</div>
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
</style>
