<script setup>
// 分享弹窗：左边是海报预览（含丑头像 + 二维码），右边是链接与操作。
// 由 lib/useShare.js 驱动；?share=<sid> 深链打开时是只读模式（展示别人的分享）。
import { ref, watch, nextTick } from 'vue';
import { useShare } from '~/lib/useShare';
import { useToast } from '~/lib/useToast';
import { renderSharePoster, downloadCanvas } from '~/lib/sharePoster';

const { shareState, closeShare } = useShare();
const { toast } = useToast();

const box = ref(null);
const linkInput = ref(null);
const poster = ref(null); // 最近一次渲染出来的 canvas（用 ref，按钮的 disabled 才会跟着变）

function draw() {
  if (!box.value || !shareState.doc) return;
  poster.value = renderSharePoster({ ...shareState.doc, shareUrl: shareState.shareUrl });
  box.value.replaceChildren(poster.value);
}

watch(
  () => [shareState.open, shareState.doc, shareState.shareUrl],
  () => nextTick(draw),
);

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('链接已复制', 'success');
  } catch {
    // 剪贴板权限被拒时退回「选中输入框让用户自己复制」
    linkInput.value?.select();
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
  <transition name="fade">
    <div v-if="shareState.open" class="modal-mask" @click.self="closeShare">
      <div class="share-box">
        <div class="share-head">
          <h3>{{ shareState.readonly ? '🔗 分享详情' : '🔗 分享这块内容' }}</h3>
          <button class="icon-btn small" title="关闭" @click="closeShare">✕</button>
        </div>

        <div class="share-body">
          <div ref="box" class="share-poster">
            <div v-if="shareState.loading || !shareState.doc" class="share-placeholder">正在生成…</div>
          </div>

          <div class="share-side">
            <p class="share-tip">
              海报里的头像由内容自动派生，同一条内容永远是同一张脸；扫码或点链接都能打开这张分享卡。
            </p>

            <label class="field-row">
              <span>分享链接</span>
              <div class="share-link-row">
                <input ref="linkInput" :value="shareState.shareUrl" readonly @focus="$event.target.select()" />
                <button class="btn small" @click="copyText(shareState.shareUrl)">复制</button>
              </div>
            </label>

            <div class="share-actions">
              <button class="btn primary" :disabled="!poster || shareState.loading" @click="downloadCanvas(poster, fileName())">
                ⬇ 下载图片
              </button>
              <button class="btn" :disabled="!poster || shareState.loading" @click="copyImage">🖼 复制图片</button>

              <button class="btn" :disabled="!shareState.shareUrl" @click="openPage">↗ 打开分享页</button>
            </div>

            <div v-if="shareState.error" class="notice">
              ⚠️ 链接没能存到服务端（{{ shareState.error }}），当前是本地临时分享：图片可用，但链接别人打不开。
            </div>
            <div v-else-if="shareState.readonly && shareState.doc" class="share-meta">
              已被查看 {{ shareState.doc.views ?? 0 }} 次
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.share-box {
  width: min(760px, 96vw);
  max-height: 90vh;
  overflow: auto;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-2);
}
.share-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.share-head h3 {
  margin: 0;
  font-size: 16px;
}
.share-body {
  display: grid;
  grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  gap: 20px;
  padding: 20px;
}
.share-poster {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 200px;
}
.share-poster :deep(canvas) {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}
.share-placeholder {
  color: var(--text-dim);
  font-size: 13px;
  padding: 60px 0;
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
.share-link-row input {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
}
.share-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.share-meta {
  font-size: 12px;
  color: var(--text-dim);
}
@media (max-width: 720px) {
  .share-body {
    grid-template-columns: 1fr;
  }
  .share-poster {
    max-width: 300px;
    margin: 0 auto;
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
