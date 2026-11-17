<script setup>
// 教程阅读器：抽屉式浮层，Markdown 由 marked 渲染。
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { marked } from 'marked';
import Icon from './Icon.vue';
import { formatDate } from '../lib/format';

const props = defineProps({
  item: { type: Object, default: null },
});
const emit = defineEmits(['close']);

const html = computed(() => (props.item?.content ? marked.parse(props.item.content) : ''));

function onKey(e) {
  if (e.key === 'Escape' && props.item) emit('close');
}

watch(
  () => props.item,
  (val) => {
    document.body.style.overflow = val ? 'hidden' : '';
  },
);

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <div v-if="item" class="reader-mask" @click.self="emit('close')">
      <div class="reader" role="dialog" aria-modal="true" :aria-label="item.title">
        <div class="reader-head">
          <button class="icon-btn" title="关闭 (Esc)" @click="emit('close')">
            <Icon name="x" :size="16" />
          </button>
          <span class="tag" v-if="item.category">{{ item.category }}</span>
          <span style="margin-left: auto; color: var(--text-3); font-size: 12px">
            {{ formatDate(item.updatedAt) }}
          </span>
        </div>
        <div class="reader-body">
          <article class="article" v-html="html"></article>
        </div>
      </div>
    </div>
  </Teleport>
</template>
