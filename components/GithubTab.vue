<script setup>
// GitHub 板块（原 App.vue 的 GitHub 板块平移；仓库数据随 /api/dns 返回）。
// 热门用户改从本地库（/api/creators）加载；用户主动搜索某用户名后 upsert 进库，之后出现在热门列表。
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useToast } from '~/lib/useToast';

const { toast } = useToast();

const data = ref(null);
const error = ref('');
const loading = ref(true);
const ghInput = ref('');
const creators = ref([]);
const ghInputEl = ref(null);

const github = computed(() => {
  const g = data.value && data.value.github;
  if (!g || (!g.error && !g.repos.length)) return null;
  return g;
});

function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

async function fetchData(userInitiated = false) {
  error.value = '';
  try {
    const q = ghInput.value.trim() ? `?github_user=${encodeURIComponent(ghInput.value.trim())}` : '';
    const res = await fetch(`/api/dns${q}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
    data.value = body;
    if (body.github && body.github.user) {
      ghInput.value = body.github.user;
      // 用户主动搜索的合法用户名，回写热门用户库
      if (userInitiated && body.github.user) {
        try {
          await fetch('/api/creators', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: body.github.user }),
          });
          await loadCreators();
        } catch {}
      }
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
      <h2 class="zone">🔥 热门 GitHub 用户 <small>点击卡片查看 TA 的公开仓库 · 搜索也会加入此列表</small></h2>
      <div class="wall">
        <button
          v-for="u in creators"
          :key="u.login"
          class="user-card"
          :class="{ active: github && github.user === u.login }"
          @click="selectUser(u.login)"
          :title="`查看 @${u.login} 的公开仓库`"
        >
          <img :src="`https://github.com/${u.login}.png?size=64`" :alt="u.login" loading="lazy" />
          <span class="login">@{{ u.login }}</span>
          <span class="note">{{ u.note || (u.addedByUser ? '你搜索过' : '') }}</span>
        </button>
      </div>
    </section>

    <section v-if="github">
      <h2 class="zone">
        GitHub 仓库
        <small v-if="github.user">@{{ github.user }} · {{ github.repos.length }} 个公开仓库</small>
        <small v-else>Token 本人仓库 · {{ github.repos.length }} 个</small>
      </h2>
      <form class="gh-form" @submit.prevent="fetchData(true)">
        <input
          ref="ghInputEl"
          v-model="ghInput"
          placeholder="输入任意 GitHub 用户名后回车，如 gaearon"
          spellcheck="false"
        />
        <button type="submit">加载</button>
      </form>
      <div v-if="github.error" class="error">GitHub 仓库加载失败：{{ github.error }}</div>
      <div v-else class="grid">
        <component
          :is="repo.private ? 'div' : 'a'"
          v-for="repo in github.repos"
          :key="repo.fullName"
          class="card"
          :class="{ dead: repo.private }"
          :href="repo.private ? undefined : repo.url"
          target="_blank"
          rel="noopener"
        >
          <div class="card-title">
            <span class="repo-icon">{{ repo.private ? '🔒' : '📦' }}</span>
            <span class="title-text">{{ repo.name }}</span>
            <span class="chip" :class="repo.private ? 'private' : 'public'">
              {{ repo.private ? 'Private' : 'Public' }}
            </span>
          </div>
          <div class="card-host">{{ repo.description || repo.fullName }}</div>
          <div class="card-status repo-meta">
            <span v-if="repo.language">⬢ {{ repo.language }}</span>
            <span>⭐ {{ repo.stars }}</span>
            <span v-if="repo.archived">已归档</span>
            <span>更新于 {{ timeAgo(repo.pushedAt) }}</span>
          </div>
        </component>
      </div>
    </section>
    <div v-if="loading" class="loading">正在加载 GitHub 仓库…</div>
  </div>
</template>
