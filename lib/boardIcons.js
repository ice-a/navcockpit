// AI 资源台板块图标：HubBoard.icon 存的是这里的 key，前端映射成 Arco 图标组件。
// 新增可选图标时同时要在服务端 BUILTIN_BOARDS / 表单下拉里能选到。
import {
  IconApps,
  IconCloud,
  IconCode,
  IconSafe,
  IconThunderbolt,
  IconFile,
  IconRobot,
  IconFire,
  IconStar,
  IconBulb,
  IconDesktop,
  IconLink,
  IconCompass,
  IconPalette,
  IconArchive,
  IconBookmark,
  IconHeart,
  IconEye,
  IconLocation,
  IconGithub,
} from '@arco-design/web-vue/es/icon';

export const BOARD_ICONS = {
  apps: IconApps,
  cloud: IconCloud,
  code: IconCode,
  safe: IconSafe,
  thunderbolt: IconThunderbolt,
  file: IconFile,
  robot: IconRobot,
  fire: IconFire,
  star: IconStar,
  bulb: IconBulb,
  desktop: IconDesktop,
  link: IconLink,
  compass: IconCompass,
  palette: IconPalette,
  archive: IconArchive,
  bookmark: IconBookmark,
  heart: IconHeart,
  eye: IconEye,
  location: IconLocation,
  github: IconGithub,
};

export const BOARD_ICON_KEYS = Object.keys(BOARD_ICONS);

export function boardIcon(key) {
  return BOARD_ICONS[key] || IconApps;
}
