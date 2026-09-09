// 轻提示（Toast）。模块级单例队列，Toast.vue 渲染。
// 用法：const { toast } = useToast(); toast('已保存', 'success')
import { reactive } from 'vue';
import { useSettings } from './useSettings';

let seq = 0;
const state = reactive({ items: [] });

export function useToast() {
  const { settings } = useSettings();

  function toast(message, type = 'info', duration = 2600) {
    if (!settings.enableToast) return;
    const id = ++seq;
    state.items.push({ id, message, type });
    setTimeout(() => {
      const i = state.items.findIndex((t) => t.id === id);
      if (i !== -1) state.items.splice(i, 1);
    }, duration);
  }

  function remove(id) {
    const i = state.items.findIndex((t) => t.id === id);
    if (i !== -1) state.items.splice(i, 1);
  }

  return { toastState: state, toast, remove };
}
