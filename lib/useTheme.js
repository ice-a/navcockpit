// 主题控制：根据设置把 data-theme 写到 documentElement，并同步 Arco 的 arco-theme。
// theme: dark | light | auto（auto 跟随系统 prefers-color-scheme，由 CSS / matchMedia 处理）。
import { watch, onMounted, onUnmounted } from 'vue';
import { useSettings } from './useSettings';
import { applyArcoTheme } from './arcoTheme';

export function useTheme() {
  const { settings } = useSettings();
  let mql = null;

  function apply() {
    if (typeof document === 'undefined') return;
    const t = settings.theme;
    if (t === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
    applyArcoTheme(t);
  }

  // auto 时监听系统主题变化，实时切换
  function syncSystemListener() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    if (mql) {
      mql.onchange = null;
      mql = null;
    }
    if (settings.theme === 'auto') {
      mql = window.matchMedia('(prefers-color-scheme: light)');
      mql.onchange = () => apply();
    }
  }

  // 纯 SPA：setup 时 body 已存在，先应用一次避免首屏主题闪烁
  apply();
  onMounted(() => {
    apply();
    syncSystemListener();
  });
  watch(
    () => settings.theme,
    () => {
      apply();
      syncSystemListener();
    },
  );
  onUnmounted(() => {
    if (mql) mql.onchange = null;
  });

  return { apply };
}
