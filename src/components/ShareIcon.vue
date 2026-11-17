<script setup>
// 卡片角标分享：优先调系统分享面板，不支持则把链接复制到剪贴板。
// 根元素用 span[role=button]，这样嵌在 <a>（导航卡）或 <button>（文章卡）里都不会破坏结构。
import { ref } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({
  title: { type: String, default: '' },
  url: { type: String, default: '' },
});

const copied = ref(false);
let busy = false;
let timer = 0;

function resolveUrl() {
  if (props.url) return props.url;
  return typeof location === 'undefined' ? '' : location.origin + location.pathname;
}

function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

async function share(e) {
  e.preventDefault();
  e.stopPropagation();
  if (busy) return;

  const url = resolveUrl();
  if (!url) return;
  const title = props.title || document.title;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    busy = true;
    try {
      await navigator.share({ title, url });
    } catch {
      /* 用户取消或系统不支持，静默 */
    } finally {
      busy = false;
    }
    return;
  }

  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else legacyCopy(url);
  } catch {
    legacyCopy(url);
  }
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), 1600);
}
</script>

<template>
  <span
    class="share-mini"
    :class="{ done: copied }"
    role="button"
    tabindex="0"
    :aria-label="title ? `分享 ${title}` : '分享'"
    :title="copied ? '链接已复制' : '分享'"
    @click="share"
    @keydown.enter.prevent="share"
    @keydown.space.prevent="share"
  >
    <Icon :name="copied ? 'check' : 'share'" :size="13" />
  </span>
</template>

<style scoped>
.share-mini {
  width: 24px;
  height: 24px;
  display: inline-grid;
  place-items: center;
  border-radius: 7px;
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
  transition:
    color 0.15s ease,
    background 0.15s ease,
    opacity 0.15s ease;
}

.share-mini:hover {
  color: var(--text);
  background: var(--surface-2);
}

.share-mini.done {
  color: var(--accent-text);
  background: var(--accent-soft);
}

.share-mini:focus-visible {
  outline: none;
  box-shadow: var(--ring);
}
</style>