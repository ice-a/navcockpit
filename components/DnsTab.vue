<script setup>
// Cloudflare DNS 看板（原 App.vue 的 DNS 板块平移，接口不变：/api/dns）
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useSettings } from '~/lib/useSettings';

const { settings } = useSettings();
const NAVIGABLE = new Set(['A', 'AAAA', 'CNAME']);

const data = ref(null);
const error = ref('');
const loading = ref(true);
const countdown = ref(settings.dnsRefreshSeconds);
const showOffline = ref(false);

let tickTimer = null;

const updatedTime = computed(() =>
  data.value ? new Date(data.value.updatedAt).toLocaleTimeString() : '',
);

const groups = computed(() => {
  if (!data.value) return [];
  return data.value.zones.map((zone) => {
    const byName = new Map();
    for (const r of zone.records) {
      if (!byName.has(r.name)) byName.set(r.name, []);
      byName.get(r.name).push(r);
    }
    const all = [...byName.entries()]
      .map(([name, entries]) => {
        const isRoot = name.toLowerCase() === zone.name.toLowerCase();
        const canLink =
          !name.includes('*') && entries.some((e) => NAVIGABLE.has(e.type));
        const check = data.value.checks ? data.value.checks[name] : null;
        const title = check && check.title ? check.title : '';
        return {
          name,
          isRoot,
          canLink,
          check,
          title,
          proxied: entries.some((e) => e.proxied),
          label: isRoot ? zone.name : name.slice(0, -(zone.name.length + 1)),
          rank: check && check.ok ? 0 : check && check.status > 0 ? 1 : 2,
        };
      })
      .filter((c) => c.canLink)
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          (a.rank === 0 && b.rank === 0 ? a.check.ms - b.check.ms : 0) ||
          a.name.localeCompare(b.name),
      );

    return {
      name: zone.name,
      visible: all.filter((c) => showOffline.value || c.rank < 2),
      hiddenCount: all.length - all.filter((c) => showOffline.value || c.rank < 2).length,
      onlineCount: all.filter((c) => c.rank === 0).length,
      total: all.length,
    };
  });
});

function statusOf(card) {
  const c = card.check;
  if (c && c.ok) return { cls: 'up', text: `在线 · ${c.ms}ms`, dot: 'green' };
  if (c && c.status > 0) return { cls: 'warn', text: `HTTP ${c.status}`, dot: 'yellow' };
  return { cls: 'down', text: '离线', dot: 'red' };
}

function href(card) {
  if (!card.canLink) return undefined;
  const c = card.check;
  return c && c.status > 0 && c.url ? c.url : `https://${card.name}`;
}

async function fetchData() {
  error.value = '';
  try {
    const res = await fetch('/api/dns');
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
    data.value = body;
    countdown.value = settings.dnsRefreshSeconds;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchData();
  tickTimer = setInterval(() => {
    if (!settings.dnsAutoRefresh) {
      countdown.value = settings.dnsRefreshSeconds;
      return;
    }
    countdown.value -= 1;
    if (countdown.value <= 0) fetchData();
  }, 1000);
});

// 设置变更时同步倒计时上限
watch(
  () => settings.dnsRefreshSeconds,
  (v) => {
    if (countdown.value > v || countdown.value === settings.dnsRefreshSeconds) countdown.value = v;
  },
);

onUnmounted(() => clearInterval(tickTimer));
</script>

<template>
  <div>
    <div class="toolbar" v-if="data">
      <label class="toggle">
        <input type="checkbox" v-model="showOffline" />
        显示离线站点
      </label>
      <span>最后更新 {{ updatedTime }} · {{ countdown }}s 后自动刷新</span>
      <button class="btn small" @click="fetchData">手动刷新</button>
    </div>

    <div v-if="error" class="error">⚠️ {{ error }}</div>
    <div v-if="loading" class="loading">正在加载 DNS 记录并检测各站点状态…</div>

    <template v-else>
      <section v-for="zone in groups" :key="zone.name">
        <h2 class="zone">
          {{ zone.name }}
          <small>{{ zone.onlineCount }}/{{ zone.total }} 在线<template v-if="zone.hiddenCount"> · {{ zone.hiddenCount }} 个离线已隐藏</template></small>
        </h2>
        <div v-if="zone.visible.length" class="grid">
          <a
            v-for="card in zone.visible"
            :key="card.name"
            class="card"
            :class="{ offline: card.rank === 2 }"
            :href="href(card)"
            target="_blank"
            rel="noopener"
          >
            <div class="card-title">
              <span class="dot" :class="statusOf(card).dot"></span>
              <span class="title-text">{{ card.title || card.label }}</span>
            </div>
            <div class="card-host">{{ card.name }}</div>
            <div class="card-status" :class="statusOf(card).cls">{{ statusOf(card).text }}</div>
            <div class="chips">
              <span v-if="card.isRoot" class="chip root">根域名</span>
              <span v-if="card.proxied" class="chip cf">CF</span>
            </div>
          </a>
        </div>
        <div v-else class="empty">该域名下暂无可访问的子域名</div>
      </section>
    </template>
  </div>
</template>
