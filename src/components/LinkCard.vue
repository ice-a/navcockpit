<script setup>
// 导航站卡片：首字母色块 + 名称 + 描述，整块可点。
import ShareIcon from './ShareIcon.vue';
import { initial, markColor, hostOf } from '../lib/format';

const props = defineProps({
  link: { type: Object, required: true },
  showDesc: { type: Boolean, default: true },
});

const domain = hostOf(props.link.url);
</script>

<template>
  <a
    class="card"
    :href="link.url"
    target="_blank"
    rel="noopener noreferrer"
    :title="`${link.name}${link.desc ? ' · ' + link.desc : ''}`"
  >
    <span class="mark" :style="{ background: markColor(link.name) }">{{ initial(link.name) }}</span>
    <span class="card-body">
      <span class="card-name">{{ link.name }}</span>
      <span v-if="showDesc && link.desc" class="card-desc">{{ link.desc }}</span>
      <span v-else-if="domain" class="card-meta">{{ domain }}</span>
    </span>
    <ShareIcon :title="link.name" :url="link.url" />
  </a>
</template>
