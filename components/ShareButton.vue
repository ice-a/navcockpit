<script setup>
// 通用分享按钮：出现在每张卡片 / 每条热榜上，点一下生成分享链接 + 海报。
// 注意要 @click.stop.prevent：卡片本身可能是 <a>，别触发跳转。
import { useShare } from '~/lib/useShare';

const props = defineProps({
  payload: { type: Object, required: true },
  label: { type: String, default: '分享这张卡片' },
  // inline = 不做绝对定位（热榜条目、头像工具栏这类横向布局用）
  inline: { type: Boolean, default: false },
});

const { openShare } = useShare();
</script>

<template>
  <button
    class="share-btn"
    :class="{ 'is-inline': inline }"
    type="button"
    :title="label"
    :aria-label="label"
    @click.stop.prevent="openShare(payload)"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18 16.08a2.9 2.9 0 0 0-1.96.77L8.91 12.7A3.3 3.3 0 0 0 9 12c0-.24-.03-.47-.09-.7l7.05-4.11A2.93 2.93 0 1 0 15 5c0 .24.04.47.09.7L8.04 9.81a2.92 2.92 0 1 0 0 4.38l7.12 4.16c-.05.21-.08.43-.08.65a2.92 2.92 0 1 0 2.92-2.92Z"
      />
    </svg>
  </button>
</template>

<style scoped>
.share-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-dim);
  cursor: pointer;
  opacity: 0.72;
  transition: opacity 0.15s, color 0.15s, border-color 0.15s, background 0.15s, transform 0.15s;
}
.share-btn svg {
  width: 15px;
  height: 15px;
}
.share-btn:hover {
  opacity: 1;
  color: var(--text);
  border-color: var(--accent);
  background: var(--surface-3);
  transform: scale(1.06);
}
.share-btn.is-inline {
  position: static;
  flex: 0 0 auto;
  align-self: center; /* 热榜条目是 baseline 对齐，按钮单独居中 */
}

/* 触摸设备没有 hover，直接常显 */
@media (hover: none) {
  .share-btn {
    opacity: 1;
  }
}
</style>
