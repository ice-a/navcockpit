// 样式化确认弹窗（替代原生 confirm）。ConfirmDialog.vue 渲染 state。
// confirm(message, opts) 返回 Promise<boolean>。
// 若设置关闭了「人性化确认」，则回退到原生 window.confirm。
import { reactive } from 'vue';
import { useSettings } from './useSettings';

const state = reactive({
  open: false,
  message: '',
  title: '请确认',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
  resolve: null,
});

export function useConfirm() {
  const { settings } = useSettings();

  function confirm(message, opts = {}) {
    if (!settings.enableConfirm) {
      return Promise.resolve(window.confirm(message));
    }
    return new Promise((resolve) => {
      state.open = true;
      state.message = message;
      state.title = opts.title || '请确认';
      state.confirmText = opts.confirmText || '确定';
      state.cancelText = opts.cancelText || '取消';
      state.danger = !!opts.danger;
      state.resolve = resolve;
    });
  }

  function ok() {
    state.open = false;
    state.resolve?.(true);
    state.resolve = null;
  }
  function cancel() {
    state.open = false;
    state.resolve?.(false);
    state.resolve = null;
  }

  return { confirmState: state, confirm, ok, cancel };
}
