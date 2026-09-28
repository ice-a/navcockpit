<script setup>
// 热榜（服务端抓取，前端只消费）。布局沿用：居中源胶囊 + 极简工具条 + 榜单列表。
// 控件全部使用 Arco Design Vue。
import { ref, onMounted } from 'vue';
import { IconRefresh } from '@arco-design/web-vue/es/icon';
import ShareButton from '~/components/ShareButton.vue';

const sources = ref([]);
const activeId = ref('');
const items = ref([]);
const loading = ref(false);
const error = ref('');
const updatedTime = ref('');
const fromCache = ref(false);

async function loadList() {
  try {
    const res = await fetch('/api/hot/list');
    sources.value = await res.json();
    if (sources.value.length) select(sources.value[0].id);
  } catch (e) {
    error.value = e.message;
  }
}

async function select(id, force = false) {
  activeId.value = id;
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch(`/api/hot/${id}${force ? '?latest=1' : ''}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
    items.value = body.items || [];
    updatedTime.value = body.updatedTime ? new Date(body.updatedTime).toLocaleTimeString() : '';
    fromCache.value = body.status === 'cache';
  } catch (e) {
    error.value = e.message;
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function sharePayload(it) {
  return { type: 'hot', refId: it.url || it.title, title: it.title, desc: it.extra || '热榜条目', url: it.url || '', badge: '🔥 热榜' };
}

onMounted(loadList);
</script>

<template>
  <div class="hot-wrap">
    <!-- 源切换：居中胶囊 -->
    <div class="hot-tabs">
      <a-button
        v-for="s in sources"
        :key="s.id"
        size="small"
        shape="round"
        :type="activeId === s.id ? 'primary' : 'secondary'"
        @click="select(s.id)"
      >
        {{ s.name }}
      </a-button>
    </div>

    <!-- 极简工具条 -->
    <div v-if="activeId" class="hot-toolbar">
      <a-tag v-if="fromCache" size="small" title="来自缓存">缓存</a-tag>
      <span v-if="updatedTime">更新于 {{ updatedTime }}</span>
      <a-tooltip content="强制刷新" position="top">
        <a-button size="mini" shape="circle" :loading="loading" @click="select(activeId, true)">
          <template #icon><IconRefresh /></template>
        </a-button>
      </a-tooltip>
    </div>

    <a-alert v-if="error" type="error" :title="error" />
    <div v-if="loading" class="loading">加载中…</div>
    <ol v-else-if="items.length" class="hot-list">
      <li v-for="(it, i) in items" :key="i" class="hot-item">
        <span class="hot-rank" :class="{ top1: i === 0, top2: i === 1, top3: i === 2 }">{{ i + 1 }}</span>
        <a class="hot-title" :href="it.url" target="_blank" rel="noopener">{{ it.title }}</a>
        <span v-if="it.extra" class="hot-extra">{{ it.extra }}</span>
        <ShareButton :payload="sharePayload(it)" inline :label="'分享 ' + it.title" />
      </li>
    </ol>
    <div v-else-if="activeId" class="empty">暂无数据</div>
  </div>
</template>

<style scoped>
.hot-toolbar { gap: 8px; }
</style>
