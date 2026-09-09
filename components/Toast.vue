<script setup>
// 全局轻提示容器（右下角堆叠）。由 lib/useToast.js 驱动。
import { useToast } from '~/lib/useToast';
const { toastState, remove } = useToast();
</script>

<template>
  <div class="toast-wrap">
    <transition-group name="toast">
      <div
        v-for="t in toastState.items"
        :key="t.id"
        class="toast"
        :class="t.type"
        @click="remove(t.id)"
      >
        <span class="toast-icon">
          <template v-if="t.type === 'success'">✓</template>
          <template v-else-if="t.type === 'error'">✕</template>
          <template v-else-if="t.type === 'warn'">!</template>
          <template v-else>i</template>
        </span>
        <span class="toast-msg">{{ t.message }}</span>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-wrap {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
  max-width: 360px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  color: var(--text);
  font-size: 14px;
}
.toast-icon {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}
.toast.success .toast-icon { background: var(--green); }
.toast.error .toast-icon { background: var(--red); }
.toast.warn .toast-icon { background: var(--yellow); color: #1a1a1a; }
.toast.info .toast-icon { background: var(--accent); }
.toast-enter-active,
.toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from { opacity: 0; transform: translateY(12px); }
.toast-leave-to { opacity: 0; transform: translateX(20px); }
</style>
