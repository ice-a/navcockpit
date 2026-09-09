<script setup>
// 网站导航（数据源：public/link.json；原 nav_devops 项目 525 条链接、55 分类归入 8 大类）。
// 左侧大类侧栏 + 右侧分类 chips + 卡片网格；支持搜索。可选「隐藏失效站点」：开启后后台探活并隐藏失败链接。
import { ref, computed, onMounted, watch } from 'vue';
import { categoryGroups } from '~/lib/navgroups';
import { useSettings } from '~/lib/useSettings';
import { useToast } from '~/lib/useToast';

const { settings } = useSettings();
const { toast } = useToast();

const links = ref([]);
const loading = ref(true);
const error = ref('');
const activeGroup = ref('全部');
const activeCat = ref('全部');
const keyword = ref('');

// 探活
const deadMap = ref({}); // url -> true(失效)
const checking = ref(false);
const checkedCount = ref(0);

const cats = computed(() => {
  const set = new Map();
  for (const l of links.value) {
    const c = l.catelog || '未分类';
    set.set(c, (set.get(c) || 0) + 1);
  }
  return [...set.entries()]
    .map(([name, count]) => ({ name, count, group: categoryGroups[name] || '其他' }))
    .sort((a, b) => b.count - a.count);
});

const groups = computed(() => {
  const m = new Map();
  for (const c of cats.value) m.set(c.group, (m.get(c.group) || 0) + c.count);
  return m;
});

const visibleCats = computed(() => {
  let list = cats.value;
  if (activeGroup.value !== '全部') list = list.filter((c) => c.group === activeGroup.value);
  return list;
});

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  return links.value.filter((l) => {
    const group = categoryGroups[l.catelog || '未分类'] || '其他';
    if (activeGroup.value !== '全部' && group !== activeGroup.value) return false;
    if (activeCat.value !== '全部' && (l.catelog || '未分类') !== activeCat.value) return false;
    if (kw && !`${l.name} ${l.desc} ${l.url}`.toLowerCase().includes(kw)) return false;
    if (settings.hideDeadSites && deadMap.value[l.url]) return false;
    return true;
  });
});

const grouped = computed(() => {
  const m = new Map();
  for (const l of filtered.value) {
    const c = l.catelog || '未分类';
    if (!m.has(c)) m.set(c, []);
    m.get(c).push(l);
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
});

function favicon(url) {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
  } catch {
    return '';
  }
}

async function probe(url, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, mode: 'no-cors' });
    // no-cors 下拿不到 status，但能 resolve 说明可达
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function runHealthCheck() {
  if (checking.value) return;
  checking.value = true;
  checkedCount.value = 0;
  const list = links.value;
  let i = 0;
  const CONC = 20;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      const ok = await probe(list[idx].url);
      if (!ok) deadMap.value = { ...deadMap.value, [list[idx].url]: true };
      checkedCount.value++;
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  checking.value = false;
  const dead = Object.keys(deadMap.value).length;
  toast(`探活完成：标记 ${dead} 个失效站点`, 'success');
}

// 开启「隐藏失效」时自动探活一次
watch(
  () => settings.hideDeadSites,
  (v) => {
    if (v && !checking.value && !Object.keys(deadMap.value).length) runHealthCheck();
  },
);

onMounted(async () => {
  try {
    const res = await fetch('/link.json');
    links.value = await res.json();
  } catch (e) {
    error.value = 'link.json 加载失败：' + e.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <div class="nav-layout">
      <!-- 左：大类侧栏 -->
      <aside class="nav-sidebar">
        <button :class="{ active: activeGroup === '全部' }" @click="activeGroup = '全部'; activeCat = '全部'">
          <span>全部</span><span class="cnt">{{ links.length }}</span>
        </button>
        <button
          v-for="[g, n] in groups"
          :key="g"
          :class="{ active: activeGroup === g }"
          @click="activeGroup = g; activeCat = '全部'"
        >
          <span>{{ g }}</span><span class="cnt">{{ n }}</span>
        </button>
      </aside>

      <!-- 右：内容 -->
      <div>
        <div class="toolbar">
          <input v-model="keyword" type="text" placeholder="搜索名称 / 描述 / 域名…" style="flex: 0 1 280px" />
          <span>共 {{ filtered.length }} 条</span>
          <span style="flex: 1"></span>
          <label class="toggle">
            <input type="checkbox" v-model="settings.hideDeadSites" />
            隐藏失效
          </label>
          <button class="btn small" :disabled="checking" @click="runHealthCheck">
            {{ checking ? `检测中 ${checkedCount}/${links.length}` : '检测失效' }}
          </button>
        </div>

        <div v-if="activeGroup !== '全部' || activeCat !== '全部'" class="cat-row">
          <button class="cat-chip sub" :class="{ active: activeCat === '全部' }" @click="activeCat = '全部'">全部分类</button>
          <button
            v-for="c in visibleCats"
            :key="c.name"
            class="cat-chip sub"
            :class="{ active: activeCat === c.name }"
            @click="activeCat = c.name"
          >
            {{ c.name }} <span class="link-count">{{ c.count }}</span>
          </button>
        </div>

        <div v-if="error" class="error">⚠️ {{ error }}</div>
        <div v-if="loading" class="loading">正在加载导航数据…</div>

        <template v-else>
          <section v-for="[cat, items] in grouped" :key="cat">
            <h2 class="zone">{{ cat }} <small>{{ items.length }} 条</small></h2>
            <div class="nav-cards">
              <a
                v-for="l in items"
                :key="l.url"
                class="card"
                :class="{ offline: deadMap[l.url] }"
                :href="l.url"
                target="_blank"
                rel="noopener nofollow"
              >
                <div class="card-title">
                  <img
                    v-if="favicon(l.url)"
                    :src="favicon(l.url)"
                    style="width: 16px; height: 16px; flex: 0 0 16px; border-radius: 4px"
                    loading="lazy"
                    onerror="this.style.visibility='hidden'"
                  />
                  <span class="title-text">{{ l.name }}</span>
                </div>
                <div class="card-host">{{ l.desc || l.url }}</div>
              </a>
            </div>
          </section>
          <div v-if="!grouped.length" class="empty">没有匹配的站点，换个关键词试试</div>
        </template>
      </div>
    </div>
  </div>
</template>
