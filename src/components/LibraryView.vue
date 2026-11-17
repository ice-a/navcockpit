<script setup>
// 资源库：导航与外链资源合成一棵树，左侧大类 + 分类胶囊 + 卡片网格。
// 数据来自 /data/library.json；文章条目额外从 /data/articles.json 取正文。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Brand from './Brand.vue';
import Icon from './Icon.vue';
import LinkCard from './LinkCard.vue';
import ShareIcon from './ShareIcon.vue';
import TutorialReader from './TutorialReader.vue';
import { initial, markColor } from '../lib/format';
import { loadData, settings } from '../lib/store';

const data = ref(null);
const loading = ref(true);
const error = ref('');
const query = ref('');
const sectionId = ref('all');
const catId = ref('all');
const reading = ref(null);

const sections = computed(() => data.value?.sections || []);
const total = computed(() => sections.value.reduce((n, s) => n + s.count, 0));
const activeSection = computed(() => sections.value.find((s) => s.id === sectionId.value) || null);
const categories = computed(() => activeSection.value?.categories || []);

const keyword = computed(() => query.value.trim().toLowerCase());

function match(item) {
  if (!keyword.value) return true;
  return `${item.name} ${item.desc || ''} ${item.url || ''} ${(item.tags || []).join(' ')}`
    .toLowerCase()
    .includes(keyword.value);
}

const visible = computed(() => {
  const list = sectionId.value === 'all' ? sections.value : [activeSection.value].filter(Boolean);

  return list
    .map((s) => {
      const cats = (catId.value === 'all'
        ? s.categories
        : s.categories.filter((c) => c.id === catId.value)
      )
        .map((c) => ({ ...c, items: c.items.filter(match) }))
        .filter((c) => c.items.length);
      return { ...s, categories: cats, count: cats.reduce((n, c) => n + c.items.length, 0) };
    })
    .filter((s) => s.count);
});

const resultCount = computed(() => visible.value.reduce((n, s) => n + s.count, 0));

function pickSection(id) {
  sectionId.value = id;
  catId.value = 'all';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function openArticleById(id) {
  if (!id) return;
  try {
    const { items } = await loadData('articles');
    const found = items.find((a) => a.id === id);
    if (found) reading.value = found;
  } catch (e) {
    error.value = e.message;
  }
}

function openArticle(item) {
  openArticleById(item.articleId);
}

// 命令面板命中的文章在这里打开
function onOpenArticleEvent(e) {
  openArticleById(e.detail);
}

onMounted(async () => {
  window.addEventListener('library:open-article', onOpenArticleEvent);
  try {
    data.value = await loadData('library');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => window.removeEventListener('library:open-article', onOpenArticleEvent));
</script>

<template>
  <div class="view">
    <div class="page-head">
      <div>
        <h1 class="page-title">资源库</h1>
        <p class="page-sub">
          <template v-if="data">{{ total }} 条资源 · {{ sections.length }} 个大类</template>
          <template v-else>正在整理…</template>
        </p>
      </div>
      <div class="page-side">
        <Brand />
        <div class="input-wrap">
          <span class="input-icon"><Icon name="search" :size="15" /></span>
          <input
            v-model="query"
            class="input"
            type="search"
            placeholder="搜索名称、描述、标签或域名"
            aria-label="搜索资源"
          />
          <button v-if="query" class="input-clear" title="清空" @click="query = ''">
            <Icon name="x" :size="13" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="empty">{{ error }}</div>
    <div v-else-if="loading" class="grid">
      <div v-for="i in 12" :key="i" class="skeleton"></div>
    </div>

    <div v-else class="nav-layout">
      <aside class="rail" aria-label="大类">
        <button class="rail-item" :class="{ active: sectionId === 'all' }" @click="pickSection('all')">
          全部
          <span class="rail-count">{{ total }}</span>
        </button>
        <button
          v-for="s in sections"
          :key="s.id"
          class="rail-item"
          :class="{ active: sectionId === s.id }"
          @click="pickSection(s.id)"
        >
          {{ s.name }}
          <span class="rail-count">{{ s.count }}</span>
        </button>
      </aside>

      <div>
        <div v-if="categories.length > 1" class="chips">
          <button class="chip" :class="{ active: catId === 'all' }" @click="catId = 'all'">
            全部
            <span class="chip-num">{{ activeSection.count }}</span>
          </button>
          <button
            v-for="c in categories"
            :key="c.id"
            class="chip"
            :class="{ active: catId === c.id }"
            @click="catId = c.id"
          >
            {{ c.name }}
            <span class="chip-num">{{ c.count }}</span>
          </button>
        </div>

        <section v-for="s in visible" :key="s.id" class="section">
          <div v-if="sectionId === 'all'" class="section-head">
            <h2 class="section-title">{{ s.name }}</h2>
            <span class="section-count">{{ s.count }}</span>
          </div>

          <template v-for="c in s.categories" :key="c.id">
            <h3 v-if="sectionId !== 'all' || s.categories.length > 1" class="cat-title">{{ c.name }}</h3>
            <div class="grid">
              <template v-for="item in c.items" :key="(item.url || '') + item.name">
                <button
                  v-if="item.kind === 'article'"
                  class="card card-button"
                  :title="item.name"
                  @click="openArticle(item)"
                >
                  <span class="mark" :style="{ background: markColor(item.name) }">
                    {{ initial(item.name) }}
                  </span>
                  <span class="card-body">
                    <span class="card-name">{{ item.name }}</span>
                    <span v-if="settings.showDesc && item.desc" class="card-desc">{{ item.desc }}</span>
                    <span class="tag-row" v-if="item.tags?.length">
                      <span v-for="tag in item.tags" :key="tag" class="tag">{{ tag }}</span>
                    </span>
                  </span>
                  <ShareIcon :title="item.name" />
                </button>
                <LinkCard v-else :link="item" :show-desc="settings.showDesc" />
              </template>
            </div>
          </template>
        </section>

        <div v-if="!resultCount" class="empty">没有匹配的资源</div>
      </div>
    </div>

    <TutorialReader :item="reading" @close="reading = null" />
  </div>
</template>

<style scoped>
.card-button {
  width: 100%;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  appearance: none;
}
</style>