<script setup>
// 分享弹窗：左边海报预览（丑头像 + 二维码），右边链接与操作。由 lib/useShare.js 驱动。
// 用 Arco Modal 承载，布局沿用左右双栏。
import { ref, watch, nextTick } from 'vue';
import { IconDownload, IconCopy, IconLaunch } from '@arco-design/web-vue/es/icon';
import { useShare } from '~/lib/useShare';
import { useToast } from '~/lib/useToast';
import { renderSharePoster, downloadCanvas } from '~/lib/sharePoster';

const { shareState, closeShare } = useShare();
const { toast } = useToast();

const box = ref(null);
const poster = ref(null);

function draw() {
  if (!box.value || !shareState.doc) return;
  poster.value = renderSharePoster({ ...shareState.doc, shareUrl: shareState.shareUrl });
  box.value.replaceChildren(poster.value);
}

watch(
  () => [shareState.open, shareState.doc, shareState.shareUrl],
  () => nextTick(draw),
);

function onLinkFocus(e) {
  e.target?.select?.();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('链接已复制', 'success');
  } catch {
    toast('复制失败，请手动复制输入框里的链接', 'error');
  }
}

async function copyImage() {
  if (!poster.value) return;
  try {
    const blob = await new Promise((r) => poster.value.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('图片已复制到剪贴板', 'success');
  } catch {
    downloadCanvas(poster.value, fileName());
    toast('当前浏览器不支持复制图片，已改为下载', 'info');
  }
}

function fileName() {
  return `领航舱分享-${shareState.doc?.sid || 'poster'}.png`;
}
function openPage() {
  window.open(shareState.shareUrl, '_blank', 'noopener');
}
</script>

<template>
  <a-modal
    :visible="shareState.open"
    :width="'min(760px, 96vw)'"
    :footer="false"
    :mask-closable="true"
    unmount-on-close
    :title="shareState.readonly ? '分享详情' : '分享这块内容'"
    @cancel="closeShare"
  >
    <div class="share-body">
      <div ref="box" class="share-poster">
        <span v-if="shareState.loading || !shareState.doc" class="share-loading">正在生成…</span>
      </div>

      <div class="share-side">
        <p class="share-tip">
          海报里的头像由内容自动派生，同一条内容永远是同一张脸；扫码或点链接都能打开这张分享卡。
        </p>

        <div class="field-row">
          <label>分享链接</label>
          <div class="share-link-row">
            <a-input :model-value="shareState.shareUrl" readonly @focus="onLinkFocus" />
            <a-button size="small" @click="copyText(shareState.shareUrl)">
              <template #icon><IconCopy /></template>
              复制
            </a-button>
          </div>
        </div>

        <a-space class="share-actions" wrap>
          <a-button type="primary" :disabled="!poster || shareState.loading" @click="downloadCanvas(poster, fileName())">
            <template #icon><IconDownload /></template>
            下载图片
          </a-button>
          <a-button :disabled="!poster || shareState.loading" @click="copyImage">
            <template #icon><IconCopy /></template>
            复制图片
          </a-button>
          <a-button :disabled="!shareState.shareUrl" @click="openPage">
            <template #icon><IconLaunch /></template>
            打开分享页
          </a-button>
        </a-space>

        <p v-if="shareState.error" class="share-warn">
          链接没能存到服务端（{{ shareState.error }}），当前是本地临时分享：图片可用，但链接别人打不开。
        </p>
        <p v-else-if="shareState.readonly && shareState.doc" class="share-meta">
          已被查看 {{ shareState.doc.views ?? 0 }} 次
        </p>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.share-body {
  display: grid;
  grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  gap: 20px;
}
.share-poster {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 200px;
}
.share-loading { color: var(--text-dim); font-size: 13px; }
.share-poster :deep(canvas) {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 10px;
  border: 1px solid var(--border);
}
.share-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.share-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-dim);
}
.share-link-row {
  display: flex;
  gap: 8px;
}
.share-link-row :deep(.arco-input-wrapper) {
  flex: 1;
  min-width: 0;
}
.share-warn { font-size: 12px; color: var(--yellow); margin: 0; line-height: 1.6; }
.share-meta { font-size: 12px; color: var(--text-dim); margin: 0; }
@media (max-width: 720px) {
  .share-body {
    grid-template-columns: 1fr;
  }
  .share-poster {
    max-width: 300px;
    margin: 0 auto;
  }
}
</style>
