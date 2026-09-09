<script setup>
// 全站壳：顶部标签导航 + 各功能板块 + 右上角全局设置 / 全局搜索。
// 分析/广告脚本按环境变量注入（留空 = 不注入），ID 在 nuxt.config / NUXT_PUBLIC_* 里配置。
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { TABS } from '~/lib/tabs';
import { useSettings } from '~/lib/useSettings';
import { useTheme } from '~/lib/useTheme';
import DnsTab from '~/components/DnsTab.vue';
import NavTab from '~/components/NavTab.vue';
import HotTab from '~/components/HotTab.vue';
import HubTab from '~/components/HubTab.vue';
import MarkdownTab from '~/components/MarkdownTab.vue';
import AvatarTab from '~/components/AvatarTab.vue';
import GithubTab from '~/components/GithubTab.vue';
import SettingsDrawer from '~/components/SettingsDrawer.vue';
import CommandPalette from '~/components/CommandPalette.vue';
import Toast from '~/components/Toast.vue';
import ConfirmDialog from '~/components/ConfirmDialog.vue';

const { gaId, adsenseClient, clarityId, bingUetId } = useRuntimeConfig().public;

useHead({
  script: [
    ...(gaId ? [{ src: `https://www.googletagmanager.com/gtag/js?id=${gaId}`, async: true }, { innerHTML: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${gaId}');` }] : []),
    ...(adsenseClient ? [{ src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`, async: true, crossorigin: 'anonymous' }] : []),
    ...(clarityId ? [{ innerHTML: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i+"?ref=bwt";y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"script","clarity","${clarityId}");` }] : []),
    ...(bingUetId ? [{ innerHTML: `(function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${bingUetId}"};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this&&this.readyState&&this.readyState!=="loaded"&&this.readyState!=="complete";(s||n.onload&&n.onload===null)&&f()},i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");` }] : []),
  ],
});

const { settings } = useSettings();
useTheme();

const activeTab = ref(localStorage.getItem('activeTab') || settings.defaultTab || 'nav');
watch(activeTab, (v) => localStorage.setItem('activeTab', v));

// 默认首页标签：设置变更时若已设置，则跳转
watch(
  () => settings.defaultTab,
  (v) => {
    if (v) activeTab.value = v;
  },
);

const settingsOpen = ref(false);
const paletteOpen = ref(false);

// 一言（hitokoto）：右上角搜索左侧展示，每次切换标签刷新一条
const yiyan = ref({ text: '', from: '' });
const yiyanLoading = ref(false);
async function fetchYiyan() {
  yiyanLoading.value = true;
  try {
    const res = await fetch('https://v1.hitokoto.cn/?encode=json&c=f&c=a');
    if (res.ok) {
      const d = await res.json();
      yiyan.value = { text: d.hitokoto || '', from: d.from || '' };
    }
  } catch (e) {
    yiyan.value = { text: '愿你今天也有好心情', from: 'local' };
  } finally {
    yiyanLoading.value = false;
  }
}
watch(activeTab, () => fetchYiyan());

function onPaletteNavigate(tabId) {
  activeTab.value = tabId;
  paletteOpen.value = false;
}
function onPaletteGithub(login) {
  activeTab.value = 'github';
  window.dispatchEvent(new CustomEvent('select-gh-user', { detail: login }));
}

function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function onKey(e) {
  if (!settings.enableShortcuts) return;
  // ⌘K / Ctrl+K 开搜索
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  if (isTyping()) return;
  if (e.key === '/') {
    if (settings.enableGlobalSearch) {
      e.preventDefault();
      paletteOpen.value = true;
    }
    return;
  }
  if (e.key === 'g') {
    if (activeTab.value === 'github') window.dispatchEvent(new CustomEvent('focus-gh-search'));
    else activeTab.value = 'github';
    return;
  }
  if (/^[1-9]$/.test(e.key)) {
    const idx = Number(e.key) - 1;
    if (TABS[idx]) activeTab.value = TABS[idx].id;
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  fetchYiyan();
  // 支持 ?tab=xxx 深链直达某模块
  const qp = new URLSearchParams(location.search).get('tab');
  if (qp && TABS.some((t) => t.id === qp)) activeTab.value = qp;
});
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <nav class="topbar">
    <span class="logo">🧭 领航舱</span>
    <div class="tabs">
      <button v-for="t in TABS" :key="t.id" :class="{ active: activeTab === t.id }" @click="activeTab = t.id">
        {{ t.icon }} {{ t.label }}
      </button>
    </div>
    <span class="spacer"></span>
    <div class="yiyan" :class="{ loading: yiyanLoading }" @click="fetchYiyan" title="点击换一句">
      <span class="yiyan-text">{{ yiyan.text || '加载中…' }}</span>
      <span v-if="yiyan.from && yiyan.from !== 'local'" class="yiyan-from">—— {{ yiyan.from }}</span>
    </div>
    <div class="top-actions">
      <button class="icon-btn" title="全局搜索 (⌘K)" @click="paletteOpen = true">🔍</button>
      <button class="icon-btn" title="全局设置" @click="settingsOpen = true">⚙</button>
    </div>
  </nav>

  <div class="app">
    <DnsTab v-show="activeTab === 'dns'" />
    <NavTab v-show="activeTab === 'nav'" />
    <HotTab v-show="activeTab === 'hot'" />
    <HubTab v-show="activeTab === 'hub'" />
    <MarkdownTab v-show="activeTab === 'md'" />
    <AvatarTab v-show="activeTab === 'avatar'" />
    <GithubTab v-show="activeTab === 'github'" />
  </div>

  <SettingsDrawer :open="settingsOpen" @close="settingsOpen = false" />
  <CommandPalette :open="paletteOpen" @close="paletteOpen = false" @navigate="onPaletteNavigate" @github-user="onPaletteGithub" />
  <Toast />
  <ConfirmDialog />
</template>

<style>
.yiyan {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 300px;
  min-width: 110px;
  max-width: 300px;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: var(--text-dim);
  white-space: nowrap;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  transition: opacity 0.2s ease, color 0.2s ease;
}
.yiyan:hover { color: var(--text); }
.yiyan.loading { opacity: 0.55; }
.yiyan-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.yiyan-from {
  flex: 0 0 auto;
  opacity: 0.7;
  font-style: italic;
}
@media (min-width: 1100px) {
  .topbar { flex-wrap: nowrap; gap: 10px; padding-left: 18px; padding-right: 18px; }
  .yiyan { flex: 0 1 300px; min-width: 0; }
}
@media (min-width: 1280px) {
  .tabs { flex-wrap: nowrap; }
}
@media (max-width: 1100px) {
  .yiyan { display: none; }
}
</style>
