<script setup>
// 通用分享按钮：出现在每张卡片 / 每条热榜上，点一下生成分享链接 + 海报。
// 用 Arco Button 实现；注意 @click.stop.prevent：卡片本身可能是 <a>，别触发跳转。
import { IconShareInternal } from '@arco-design/web-vue/es/icon';
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
  <a-button
    class="share-btn"
    :class="{ 'is-inline': inline }"
    type="secondary"
    shape="circle"
    size="mini"
    :title="label"
    :aria-label="label"
    @click.stop.prevent="openShare(payload)"
  >
    <template #icon><IconShareInternal /></template>
  </a-button>
</template>

<style scoped>
.share-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  opacity: 0.72;
  transition: opacity 0.15s, transform 0.15s;
}
.share-btn:hover {
  opacity: 1;
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
