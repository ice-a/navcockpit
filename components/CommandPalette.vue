<script setup>
// 全局搜索（命令面板）：跨「模块切换 / 网站导航 / AI 资源台 / GitHub 用户」检索。
// ⌘K / Ctrl+K 或 / 唤起（由 app.vue 控制 open）。
import { ref, computed, watch, nextTick } from 'vue';
import { TABS } from '~/lib/tabs';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'navigate', 'githubUser']);

const query = ref('');
const items = ref([]); // 合并后的可检索项
const active = ref(0);
const inputEl = ref(null);

const tabActions = TABS.map((t) => ({
  type: 'tab',
  icon: t.icon,
  title: `打开 ${t.label}`,
  sub: '切换到该模块',
  tab: t.id,
}));

async function ensureData() {
  if (items.value.length && items.value.some((i) => i.type !== 'tab')) return;
  const extra = [];
  try {
    const links = await fetch('/link.json').then((r) => r.json());
    for (const l of links.slice(0, 400)) {
      extra.push({ type: 'nav', icon: '🔗', title: l.name, sub: l.desc || l.url, url: l.url });
    }
  } catch {}
  try {
    const creators = await fetch('/api/creators').then((r) => r.json());
    for (const c of creators) {
      extra.push({ type: 'gh', icon: '👤', title: '@' + c.login, sub: c.note || 'GitHub 用户', login: c.login });
    }
  } catch {}
  try {
    const cols = ['stations', 'tools', 'skills', 'vpns', 'servers', 'tutorials'];
    const names = { stations: '🛰', tools: '🧰', skills: '🧩', vpns: '🔒', servers: '🖥', tutorials: '📚' };
    await Promise.all(
      cols.map(async (c) => {
        const list = await fetch(`/api/hub/${c}`).then((r) => (r.ok ? r.json() : []));
        for (const it of list) {
          const u = it.home || it.web || it.url || it.siteURL;
          extra.push({
            type: 'hub',
            icon: names[c],
            title: it.name || it.title,
            sub: it.desc || it.intro || it.summary || c,
            url: u,
          });
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
  return base
    .filter((i) => `${i.title} ${i.sub || ''}`.toLowerCase().includes(q))
    .slice(0, 50);
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
  <transition name="fade">
    <div v-if="open" class="palette-mask" @click.self="$emit('close')">
      <div class="palette" @keydown="onKey">
        <input
          ref="inputEl"
          class="palette-input"
          v-model="query"
          placeholder="搜索导航 / AI 资源 / GitHub 用户，或跳转模块…"
        />
        <div class="palette-list">
          <template v-if="filtered.length">
            <div
              v-for="(it, i) in filtered"
              :key="i"
              class="palette-item"
              :class="{ active: i === active }"
              @mouseenter="active = i"
              @click="activate(it)"
            >
              <span class="pi-icon">{{ it.icon }}</span>
              <span class="pi-title">{{ it.title }}</span>
              <span class="pi-sub">{{ it.sub }}</span>
            </div>
          </template>
          <div v-else class="palette-empty">没有匹配结果</div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
