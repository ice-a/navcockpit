<script setup>
// 页头品牌：从顶栏搬下来的站点标识，读 site.json 的 name / en / mark。
import { computed, onMounted, ref } from 'vue';
import { loadData } from '../lib/store';

const site = ref(null);

const mark = computed(() => site.value?.site?.mark || (site.value?.site?.name || '渡').slice(0, 1));
const name = computed(() => site.value?.site?.name || '');
const en = computed(() => site.value?.site?.en || '');

onMounted(async () => {
  try {
    site.value = await loadData('site');
  } catch {
    /* 拿不到就用兜底字 */
  }
});
</script>

<template>
  <div class="brand-hero">
    <span class="brand-hero-left">
      <span class="brand-hero-mark">{{ mark }}</span>
      <span class="brand-hero-name">{{ name }}</span>
    </span>
    <span v-if="en" class="brand-hero-en">{{ en }}</span>
  </div>
</template>

<style scoped>
.brand-hero {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.brand-hero-left {
  display: inline-flex;
  align-items: center;
  gap: 13px;
}

.brand-hero-mark {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--text);
  color: var(--bg);
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

.brand-hero-name {
  font-size: 21px;
  font-weight: 650;
  letter-spacing: -0.015em;
}

.brand-hero-en {
  font-size: 12px;
  color: var(--text-3);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
</style>