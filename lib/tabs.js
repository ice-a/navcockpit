// 顶部标签定义（app.vue / 设置面板 / 命令面板共用）。Cloudflare DNS 固定在最后。
// icon 为纯文本兜底；TAB_ICONS 提供对应的 Arco 图标组件用于可视化场景。
import {
  IconCompass,
  IconFire,
  IconRobot,
  IconFile,
  IconPalette,
  IconGithub,
  IconCloud,
} from '@arco-design/web-vue/es/icon';

export const TABS = [
  { id: 'nav', label: '网站导航', icon: '🧭' },
  { id: 'hot', label: '热榜', icon: '🔥' },
  { id: 'hub', label: 'AI 资源台', icon: '🤖' },
  { id: 'md', label: '文章转 MD', icon: '📝' },
  { id: 'avatar', label: '个性头像', icon: '🎨' },
  { id: 'github', label: 'GitHub', icon: '📦' },
  { id: 'dns', label: 'Cloudflare DNS', icon: '🌐' },
];

export const TAB_ICONS = {
  nav: IconCompass,
  hot: IconFire,
  hub: IconRobot,
  md: IconFile,
  avatar: IconPalette,
  github: IconGithub,
  dns: IconCloud,
};
