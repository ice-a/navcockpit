<script setup>
// 样式化确认弹窗。由 lib/useConfirm.js 驱动。
import { useConfirm } from '~/lib/useConfirm';
const { confirmState, ok, cancel } = useConfirm();
</script>

<template>
  <transition name="fade">
    <div v-if="confirmState.open" class="modal-mask" @click.self="cancel">
      <div class="confirm-box" :class="{ danger: confirmState.danger }">
        <h3>{{ confirmState.title }}</h3>
        <p>{{ confirmState.message }}</p>
        <div class="confirm-actions">
          <button class="btn" @click="cancel">{{ confirmState.cancelText }}</button>
          <button class="btn" :class="confirmState.danger ? 'danger' : 'primary'" @click="ok">
            {{ confirmState.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.confirm-box {
  width: min(420px, 92vw);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 22px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
}
.confirm-box.danger { border-color: var(--red); }
.confirm-box h3 { margin: 0 0 10px; font-size: 17px; }
.confirm-box p { margin: 0 0 18px; color: var(--text-dim); line-height: 1.6; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 10px; }
.fade-enter-active,
.fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
