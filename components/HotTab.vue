<script setup>
// 热榜（服务端抓取，前端只消费）。已移除微博/V2EX/掘金/Product Hunt 与「源项目」外链。
import { ref, onMounted } from 'vue';

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

// 分享载荷：热榜条目没有稳定 id，用链接当 refId
function sharePayload(it) {
  return {
    type: 'hot',
    refId: it.url || it.title,
    title: it.title,
    desc: it.extra || '热榜条目',
    url: it.url || '',
    badge: '🔥 热榜',
  };
}

onMounted(loadList);
</script>

<template>
  <div class="hot-wrap">
    <!-- 源切换：居中胶囊 -->
    <div class="hot-tabs">
      <button
        v-for="s in sources"
        :key="s.id"
        class="hot-tab"
        :class="{ active: activeId === s.id }"
        @click="select(s.id)"
      >
        {{ s.name }}
      </button>
    </div>

    <!-- 极简工具条 -->
    <div class="hot-toolbar" v-if="activeId">
      <span v-if="fromCache" class="cache-dot" title="来自缓存">缓存</span>
      <button class="icon-btn small" title="强制刷新" :disabled="loading" @click="select(activeId, true)">⟳</button>
    </div>

    <div v-if="error" class="error">⚠️ {{ error }}</div>
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
