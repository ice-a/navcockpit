// 全局设置（持久化到 localStorage）。
// 提供响应式 state + 默认值 + 读写。所有模块共享同一份实例。
import { reactive, watch } from 'vue';

const STORAGE_KEY = 'app_settings';

// 设置结构版本：升级时把老数据迁移到新默认值（见 migrate）
const SETTINGS_VERSION = 2;

const DEFAULTS = {
  _v: SETTINGS_VERSION,
  theme: 'dark', // dark | light | auto
  aiConfig: { baseURL: '', apiKey: '', model: '' }, // 替代 MongoDB globalais
  defaultTab: 'hub', // 默认首页标签；置空 = 不强制，用上次访问的标签
  dnsAutoRefresh: true,
  dnsRefreshSeconds: 60,
  hideDeadSites: false, // 网站导航：隐藏探活失败的站点
  enableToast: true,
  enableConfirm: true, // 危险操作用样式化确认框替代原生 confirm
  enableShortcuts: true, // 1-7 切标签 / / 搜索 / g GitHub 搜索
  enableGlobalSearch: true,
};

// v1 → v2：默认首页标签由「不强制（记住上次）」改为「AI 资源台」。
// 只在没有版本号的老数据上迁移一次，之后用户在设置里选的（含「不强制」）都保留。
function migrate(parsed) {
  const out = { ...DEFAULTS, ...parsed, aiConfig: { ...DEFAULTS.aiConfig, ...(parsed.aiConfig || {}) } };
  if (!parsed._v || parsed._v < SETTINGS_VERSION) {
    out.defaultTab = DEFAULTS.defaultTab;
    out._v = SETTINGS_VERSION;
  }
  return out;
}

function load() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULTS };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    const migrated = migrate(parsed);
    // 迁移结果必须立刻落盘：否则每次打开都会重跑迁移，
    // 用户在设置里选的「不强制」会被反复覆盖回默认板块。
    if (!parsed._v || parsed._v < SETTINGS_VERSION) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch {}
    }
    return migrated;
  } catch {
    return { ...DEFAULTS };
  }
}

// 模块级单例，跨组件共享
const state = reactive(load());

// 持久化
if (typeof window !== 'undefined') {
  watch(
    state,
    (val) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
      } catch {}
    },
    { deep: true },
  );
}

export function useSettings() {
  function reset() {
    Object.assign(state, JSON.parse(JSON.stringify(DEFAULTS)));
  }
  function importSettings(obj) {
    if (!obj || typeof obj !== 'object') return;
    Object.assign(state, migrate(obj));
  }
  function exportSettings() {
    return JSON.parse(JSON.stringify(state));
  }
  return { settings: state, reset, importSettings, exportSettings, DEFAULTS };
}
