// Arco 主题切换：把设置的 theme(dark|light|auto) 写到 <body arco-theme>。
// Arco 只在 body[arco-theme='dark'] 下启用暗色 token，亮色 = 移除该属性。
export function applyArcoTheme(themeSetting) {
  if (typeof document === 'undefined' || !document.body) return;
  const body = document.body;
  let dark = themeSetting !== 'light';
  if (themeSetting === 'auto' && typeof window !== 'undefined' && window.matchMedia) {
    dark = !window.matchMedia('(prefers-color-scheme: light)').matches;
  }
  if (dark) body.setAttribute('arco-theme', 'dark');
  else body.removeAttribute('arco-theme');
}
