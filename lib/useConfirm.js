// 样式化确认弹窗（替代原生 confirm）。改用 Arco 的 Modal 全局 API。
// confirm(message, opts) 返回 Promise<boolean>，用法不变。
import { Modal } from '@arco-design/web-vue';
import { useSettings } from './useSettings';

export function useConfirm() {
  const { settings } = useSettings();

  function confirm(message, opts = {}) {
    if (!settings.enableConfirm || typeof window === 'undefined') {
      return Promise.resolve(window.confirm(message));
    }
    return new Promise((resolve) => {
      Modal[opts.danger ? 'error' : 'warning']({
        title: opts.title || '请确认',
        content: String(message),
        okText: opts.confirmText || '确定',
        cancelText: opts.cancelText || '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }

  return { confirm };
}
