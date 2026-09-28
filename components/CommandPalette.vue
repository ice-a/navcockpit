<script setup>
// 全局搜索（命令面板）：跨「模块切换 / 网站导航 / AI 资源台 / GitHub 用户」检索。
// 布局沿用：顶部居中的遮罩面板；控件使用 Arco Design Vue。
import { ref, computed, watch, nextTick } from 'vue';
import { TABS, TAB_ICONS } from '~/lib/tabs';
import { boardIcon } from '~/lib/boardIcons';
import { IconLink, IconUser } from '@arco-design/web-vue/es/icon';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'navigate', 'githubUser']);

const query = ref('');
const items = ref([]);
const active = ref(0);
const inputEl = ref(null);

const tabActions = TABS.map((t) => ({
  type: 'tab',
  icon: TAB_ICONS[t.id],
  title: `打开 ${t.label}`,
  sub: '切换到该模块',
  tab: t.id,
}));

async function ensureData() {
  if (items.value.length && items.value.some((i) => i.type !== 'tab')) return;
  const extra = [];
  try {
    const links = await fetch('/api/nav/links').then((r) => (r.ok ? r.json() : []));
    for (const l of links.slice(0, 500)) {
      extra.push({ type: 'nav', icon: IconLink, title: l.name, sub: l.desc || l.url, url: l.url });
    }
  } catch {}
  try {
    const creators = await fetch('/api/creators').then((r) => r.ok ? r.json() : []);
    for (const c of creators) {
      extra.push({ type: 'gh', icon: IconUser, title: '@' + c.login, sub: c.note || 'GitHub 用户', login: c.login });
    }
  } catch {}
  try {
    // 板块是动态的（后台可新增），先取板块再逐个取条目
    const boards = await fetch('/api/hub/boards').then((r) => (r.ok ? r.json() : [])).catch(() => []);
    await Promise.all(
      boards.map(async (b) => {
        const list = await fetch(`/api/hub/${b.key}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        for (const it of list) {
          const u = it.home || it.web || it.url || it.siteURL;
          extra.push({ type: 'hub', icon: boardIcon(b.icon), title: it.name || it.title, sub: it.desc || it.intro || it.summary || b.name, url: u });
        }
      }),
    );
  } catch {}
  items.value = [...tabActions, ...extra];
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      query.value = '';
      active.value = 0;
      ensureData();
      nextTick(() => inputEl.value?.focus());
    }
  },
);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const base = items.value.length ? items.value : tabActions;
  if (!q) return base.slice(0, 50);
  return base.filter((i) => `${i.title} ${i.sub || ''}`.toLowerCase().includes(q)).slice(0, 50);
});

watch(filtered, () => (active.value = 0));

function activate(it) {
  if (!it) return;
  if (it.type === 'tab') emit('navigate', it.tab);
  else if (it.type === 'gh') emit('githubUser', it.login);
  else if (it.url) window.open(it.url, '_blank', 'noopener');
  emit('close');
}

function onKey(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    active.value = (active.value + 1) % Math.max(1, filtered.value.length);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    active.value = (active.value - 1 + filtered.value.length) % Math.max(1, filtered.value.length);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    activate(filtered.value[active.value]);
  } else if (e.key === 'Escape') {
    emit('close');
  }
}
</script>

<template>
  <div v-if="open" class="palette-mask" @click.self="$emit('close')">
    <div class="palette" @keydown="onKey">
      <a-input
        ref="inputEl"
        v-model="query"
        placeholder="搜索导航 / AI 资源 / GitHub 用户，或跳转模块…"
        allow-clear
        size="large"
      />
      <div class="palette-list">
        <div
          v-for="(it, i) in filtered"
          :key="i"
          class="palette-item"
          :class="{ active: i === active }"
          @mouseenter="active = i"
          @click="activate(it)"
        >
          <span class="pi-icon"><component :is="it.icon" /></span>
          <span class="pi-title">{{ it.title }}</span>
          <span v-if="it.sub" class="pi-sub">{{ it.sub }}</span>
        </div>
        <a-empty v-if="!filtered.length" description="没有匹配结果" class="palette-empty" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette :deep(.arco-input-wrapper) {
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  padding: 16px 20px;
}
.palette :deep(.arco-input-wrapper .arco-input) { font-size: 16px; }
.pi-icon { display: inline-flex; align-items: center; font-size: 16px; }
</style>
