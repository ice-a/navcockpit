<script setup>
// Cloudflare DNS 看板（接口不变：/api/dns）。布局沿用：工具栏 + 每个域名一个卡片网格。
// 控件全部使用 Arco Design Vue。
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useSettings } from '~/lib/useSettings';
import ShareButton from '~/components/ShareButton.vue';

const { settings } = useSettings();
const NAVIGABLE = new Set(['A', 'AAAA', 'CNAME']);

const data = ref(null);
const error = ref('');
const loading = ref(true);
const countdown = ref(settings.dnsRefreshSeconds);
const showOffline = ref(false);

let tickTimer = null;

const updatedTime = computed(() => (data.value ? new Date(data.value.updatedAt).toLocaleTimeString() : ''));

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
        const canLink = !name.includes('*') && entries.some((e) => NAVIGABLE.has(e.type));
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
      .sort((a, b) => a.rank - b.rank || (a.rank === 0 && b.rank === 0 ? a.check.ms - b.check.ms : 0) || a.name.localeCompare(b.name));

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
  if (c && c.ok) return { cls: 'up', badge: 'success', text: `在线 · ${c.ms}ms` };
  if (c && c.status > 0) return { cls: 'warn', badge: 'warning', text: `HTTP ${c.status}` };
  return { cls: 'down', badge: 'danger', text: '离线' };
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

function sharePayload(card) {
  const st = statusOf(card);
  return { type: 'dns', refId: card.name, title: card.title || card.label, desc: card.name + ' · ' + st.text, url: 'https://' + card.name, badge: '🌐 Cloudflare DNS' };
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
    <div v-if="data" class="toolbar">
      <a-switch v-model="showOffline" size="small" />
      <span>显示离线站点</span>
      <span>最后更新 {{ updatedTime }} · {{ countdown }}s 后自动刷新</span>
      <span class="spacer"></span>
      <a-button size="small" @click="fetchData">手动刷新</a-button>
    </div>

    <a-alert v-if="error" type="error" :title="error" />
    <div v-else-if="loading" class="loading">正在加载 DNS 记录并检测各站点状态…</div>

    <template v-else>
      <section v-for="zone in groups" :key="zone.name">
        <h2 class="zone">
          {{ zone.name }}
          <small>{{ zone.onlineCount }}/{{ zone.total }} 在线<template v-if="zone.hiddenCount"> · {{ zone.hiddenCount }} 个离线已隐藏</template></small>
        </h2>
        <div v-if="!zone.visible.length" class="empty">该域名下暂无可访问的子域名</div>
        <div v-else class="grid">
          <a-card
            v-for="card in zone.visible"
            :key="card.name"
            size="small"
            hoverable
            class="dns-card"
            :class="{ offline: card.rank === 2 }"
            :body-style="{ padding: '14px 16px', height: '100%' }"
          >
            <div class="dns-head">
              <a-badge :status="statusOf(card).badge" />
              <span class="dns-title">{{ card.title || card.label }}</span>
            </div>
            <div class="dns-host">{{ card.name }}</div>
            <div class="dns-status" :class="statusOf(card).cls">{{ statusOf(card).text }}</div>
            <div class="dns-chips">
              <a-tag v-if="card.isRoot" size="small" color="arcoblue">根域名</a-tag>
              <a-tag v-if="card.proxied" size="small" color="orange">CF 代理</a-tag>
            </div>
            <div class="dns-actions">
              <ShareButton :payload="sharePayload(card)" :label="'分享 ' + (card.title || card.label)" />
              <a-button v-if="href(card)" size="mini" type="text" :href="href(card)" target="_blank" rel="noopener">打开 ↗</a-button>
            </div>
          </a-card>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.dns-card {
  height: 148px;
  display: flex;
  flex-direction: column;
}
.dns-card :deep(.arco-card-body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.dns-card.offline { opacity: 0.7; }
.dns-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dns-title { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dns-host { font-size: 12px; color: var(--text-dim); margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dns-status { font-size: 12px; color: var(--text-dim); margin-top: 4px; }
.dns-status.up { color: var(--green); }
.dns-status.warn { color: var(--yellow); }
.dns-status.down { color: var(--red); }
.dns-chips { margin-top: auto; display: flex; flex-wrap: nowrap; gap: 6px; overflow: hidden; padding-top: 8px; }
.dns-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
</style>
