// 轻提示（Toast）。改用 Arco 的 Message 全局 API，无需在组件内挂载容器。
// 用法不变：const { toast } = useToast(); toast('已保存', 'success')
import { Message } from '@arco-design/web-vue';
import { useSettings } from './useSettings';

const TYPES = ['success', 'error', 'warning', 'info'];

export function useToast() {
  const { settings } = useSettings();

  function toast(message, type = 'info', duration = 2600) {
    if (!settings.enableToast) return;
    const t = TYPES.includes(type) ? type : 'info';
    Message[t]({ content: String(message), duration });
  }

  return { toast };
}
