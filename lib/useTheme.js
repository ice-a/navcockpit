// 主题控制：根据设置把 data-theme 写到 documentElement。
// theme: dark | light | auto（auto 跟随系统 prefers-color-scheme，由 CSS 处理）。
import { watch, onMounted } from 'vue';
import { useSettings } from './useSettings';

export function useTheme() {
  const { settings } = useSettings();

  function apply() {
    if (typeof document === 'undefined') return;
    const t = settings.theme;
    if (t === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
  }

  onMounted(apply);
  watch(() => settings.theme, apply);

  return { apply };
}
