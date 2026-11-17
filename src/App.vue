<script setup>
// 应用外壳：顶栏品牌、单视图内容、命令面板 / 设置抽屉。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from './components/Icon.vue';
import LibraryView from './components/LibraryView.vue';
import CommandPalette from './components/CommandPalette.vue';
import SettingsSheet from './components/SettingsSheet.vue';
import {
  applyTheme,
  injectAnalytics,
  loadData,
  readLastTab,
  settings,
  site,
  writeLastTab,
} from './lib/store';

const VIEWS = { library: LibraryView };
const year = new Date().getFullYear();

const ready = ref(false);
const loadError = ref('');
const activeTab = ref('');
const paletteOpen = ref(false);
const settingsOpen = ref(false);
const systemDark = ref(false);
const quote = ref('');
const quoteFrom = ref('');
let quoteLoading = false;

const tabs = computed(() => site.value?.tabs || []);
const social = computed(() => site.value?.social || []);
const currentView = computed(() => VIEWS[activeTab.value] || null);
const isDark = computed(
  () => settings.theme === 'dark' || (settings.theme === 'auto' && systemDark.value),
);

function validTab(id) {
  return tabs.value.some((t) => t.id === id) ? id : '';
}

function switchTab(id) {
  if (!id) return;
  activeTab.value = id;
  paletteOpen.value = false;
}

function isTyping() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function toggleTheme() {
  settings.theme = isDark.value ? 'light' : 'dark';
}

// 一言：hitokoto 开源接口，可在 site.json → hitokoto 里关掉或换地址
async function fetchQuote() {
  const cfg = site.value?.hitokoto;
  if (!cfg || cfg.enabled === false || quoteLoading) return;
  quoteLoading = true;
  try {
    const base = cfg.endpoint || 'https://v1.hitokoto.cn/?encode=json';
    const url = `${base}${base.includes('?') ? '&' : '?'}_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.hitokoto) {
      const from = data.from || '';
      const who = data.from_who || '';
      quote.value = data.hitokoto;
      quoteFrom.value = from && who && from !== who ? `${from} · ${who}` : from || who;
    }
  } catch {
    /* 接口不可用时保持安静，不显示占位 */
  } finally {
    quoteLoading = false;
  }
}

function reload() {
  location.reload();
}

function onKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  if (e.key === 'Escape') {
    paletteOpen.value = false;
    settingsOpen.value = false;
    return;
  }
  if (!settings.shortcuts || isTyping()) return;
  if (e.key === '/') {
    e.preventDefault();
    paletteOpen.value = true;
    return;
  }
  if (/^[1-9]$/.test(e.key)) {
    const tab = tabs.value[Number(e.key) - 1];
    if (tab) activeTab.value = tab.id;
  }
}

let mql = null;
function onSchemeChange(e) {
  systemDark.value = e.matches;
}

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  mql = window.matchMedia('(prefers-color-scheme: dark)');
  systemDark.value = mql.matches;
  mql.addEventListener('change', onSchemeChange);

  try {
    site.value = await loadData('site');
    injectAnalytics(site.value.analytics || {});
    document.title = `${site.value.site?.name || '渡口'} · ${site.value.site?.tagline || ''}`;
    fetchQuote();
    const fromUrl = new URLSearchParams(location.search).get('tab');
    activeTab.value =
      [
        validTab(fromUrl),
        validTab(settings.defaultTab),
        validTab(readLastTab()),
        validTab(site.value.defaultTab),
        tabs.value[0]?.id,
      ].find(Boolean) || '';
  } catch (e) {
    loadError.value = e.message;
  } finally {
    ready.value = true;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  mql?.removeEventListener('change', onSchemeChange);
});

watch(activeTab, (id) => {
  if (!id) return;
  writeLastTab(id);
  if (tabs.value.length > 1) {
    const url = new URL(location.href);
    url.searchParams.set('tab', id);
    history.replaceState(null, '', url);
  }
  window.scrollTo({ top: 0 });
});

watch(() => settings.theme, (v) => applyTheme(v));
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="wrap topbar-inner">
        <nav v-if="tabs.length > 1" class="tabs" aria-label="板块">
          <button
            v-for="t in tabs"
            :key="t.id"
            class="tab"
            :class="{ active: activeTab === t.id }"
            @click="switchTab(t.id)"
          >
            <Icon :name="t.icon" :size="14" />
            {{ t.label }}
          </button>
        </nav>

        <button
          v-if="quote"
          class="hitokoto"
          :title="`${quote}${quoteFrom ? ' —— ' + quoteFrom : ''}（点击换一句）`"
          @click="fetchQuote"
        >
          <span class="hitokoto-text">{{ quote }}</span>
          <span v-if="quoteFrom" class="hitokoto-from">—— {{ quoteFrom }}</span>
        </button>

        <div class="topbar-actions">
          <button class="search-trigger" title="全局搜索 (⌘K)" @click="paletteOpen = true">
            <Icon name="search" :size="14" />
            <span>搜索</span>
            <kbd class="kbd">⌘K</kbd>
          </button>
          <a
            v-for="s in social"
            :key="s.url"
            class="icon-btn topbar-social"
            :href="s.url"
            target="_blank"
            rel="noopener noreferrer"
            :title="s.label"
            :aria-label="s.label"
          >
            <Icon :name="s.icon" :size="16" />
          </a>
          <button class="icon-btn" :title="isDark ? '切换到浅色' : '切换到深色'" @click="toggleTheme">
            <Icon :name="isDark ? 'sun' : 'moon'" :size="16" />
          </button>
          <button class="icon-btn" title="设置" @click="settingsOpen = true">
            <Icon name="sliders" :size="16" />
          </button>
        </div>
      </div>
    </header>

    <main class="app-main">
      <div class="wrap">
        <div v-if="loadError" class="empty">
          {{ loadError }}
          <div style="margin-top: 10px">
            <button class="btn" @click="reload">重试</button>
          </div>
        </div>
        <div v-else-if="!ready" class="grid">
          <div v-for="i in 9" :key="i" class="skeleton"></div>
        </div>
        <KeepAlive v-else-if="currentView">
          <component :is="currentView" />
        </KeepAlive>
      </div>
    </main>

    <footer class="footer">
      <div class="wrap footer-inner">
        <span>© {{ year }} {{ site?.site?.author || '' }}</span>
        <a
          v-for="l in site?.footer?.links || []"
          :key="l.url"
          :href="l.url"
          target="_blank"
          rel="noopener"
        >
          {{ l.label }}
        </a>
      </div>
    </footer>

    <CommandPalette :open="paletteOpen" @close="paletteOpen = false" @navigate="switchTab" />
    <SettingsSheet :open="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>
