<script setup>
// Google AdSense 广告位：只在配置了 adsenseClient（环境变量 NUXT_PUBLIC_ADSENSE_CLIENT）时渲染。
// slotId 为广告单元 ID；未配置或未填 slotId 时只渲染占位框（开发环境可见，线上无痕迹可留空）。
const props = defineProps({
  slotId: { type: String, default: '' },
  format: { type: String, default: 'auto' },
});

const { adsenseClient } = useRuntimeConfig().public;

onMounted(() => {
  if (adsenseClient && props.slotId) {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  }
});
</script>

<template>
  <div v-if="adsenseClient" class="ad-slot">
    <ins
      class="adsbygoogle"
      style="display: block; width: 100%"
      :data-ad-client="adsenseClient"
      :data-ad-slot="slotId || undefined"
      :data-ad-format="format"
      data-full-width-responsive="true"
    ></ins>
  </div>
  <div v-else-if="!slotId" class="ad-slot"><span class="ad-label">广告位（未配置 AdSense）</span></div>
</template>
