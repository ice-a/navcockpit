<script setup>
// 全局命令面板：⌘K / Ctrl+K 打开，支持搜索资源、文章与外链。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { loadData, site } from '../lib/store';

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'navigate']);

const query = ref('');
const cursor = ref(0);
const inputEl = ref(null);
const index = ref([]);
let loaded = false;

const tabs = computed(() => site.value?.tabs || []);

async function ensureIndex() {
  if (loaded) return;
  loaded = true;
  const lib = await loadData('library').catch(() => ({ sections: [] }));

  const items = [];
  for (const s of lib.sections || []) {
    for (const c of s.categories || []) {
      for (const it of c.items || []) {
        const tags = (it.tags || []).join(' ');
        items.push({
          kind: it.kind === 'article' ? '文章' : s.name,
          title: it.name,
          sub: it.desc || it.url || c.name,
          url: it.url || '',
          articleId: it.articleId || '',
          text: `${it.name} ${it.desc || ''} ${it.url || ''} ${tags} ${s.name} ${c.name}`.toLowerCase(),
        });
      }
    }
  }
  index.value = items;
}

const results = computed(() => {
  const kw = query.value.trim().toLowerCase();
  const tabItems =
    tabs.value.length > 1
      ? tabs.value
          .filter((t) => !kw || `${t.label} ${t.id}`.toLowerCase().includes(kw))
          .map((t) => ({ kind: '跳转', title: t.label, sub: '', tab: t.id, text: t.label }))
      : [];

  if (!kw) return [...index.value.slice(0, 10)];
  return [...tabItems, ...index.value.filter((i) => i.text.includes(kw)).slice(0, 40)];
});

function choose(item) {
  if (!item) return;
  if (item.tab) {
    emit('navigate', item.tab);
  } else if (item.articleId) {
    window.dispatchEvent(new CustomEvent('library:open-article', { detail: item.articleId }));
  } else if (item.url) {
    window.open(item.url, '_blank', 'noopener');
  }
  emit('close');
}

function onKey(e) {
  if (!props.open) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cursor.value = (cursor.value + 1) % Math.max(results.value.length, 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cursor.value = (cursor.value - 1 + results.value.length) % Math.max(results.value.length, 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    choose(results.value[cursor.value]);
  } else if (e.key === 'Escape') {
    emit('close');
  }
}

watch(
  () => props.open,
  async (val) => {
    if (val) {
      query.value = '';
      cursor.value = 0;
      await ensureIndex();
      await nextTick();
      inputEl.value?.focus();
    }
  },
);

watch(query, () => (cursor.value = 0));

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="palette-mask" @mousedown.self="emit('close')">
      <div class="palette" role="dialog" aria-modal="true" aria-label="全局搜索">
        <input
          ref="inputEl"
          v-model="query"
          class="palette-input"
          type="text"
          placeholder="搜索站点、资源或文章…"
          autocomplete="off"
          spellcheck="false"
        />
        <div class="palette-list">
          <div
            v-for="(item, i) in results"
            :key="item.kind + item.title + i"
            class="palette-item"
            :class="{ active: i === cursor }"
            @mouseenter="cursor = i"
            @click="choose(item)"
          >
            <Icon :name="item.articleId ? 'book' : item.tab ? 'compass' : 'link'" :size="14" />
            <span class="pi-title">{{ item.title }}</span>
            <span class="pi-sub">{{ item.sub }}</span>
            <span class="pi-kind">{{ item.kind }}</span>
          </div>
          <div v-if="!results.length" class="palette-empty">没有找到匹配项</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
