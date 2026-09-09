// 全局设置（持久化到 localStorage）。
// 提供响应式 state + 默认值 + 读写。所有模块共享同一份实例。
import { reactive, watch } from 'vue';

const STORAGE_KEY = 'app_settings';

const DEFAULTS = {
  theme: 'dark', // dark | light | auto
  aiConfig: { baseURL: '', apiKey: '', model: '' }, // 替代 MongoDB globalais
  defaultTab: '', // 空 = 不强制，用上次访问的标签
  dnsAutoRefresh: true,
  dnsRefreshSeconds: 60,
  hideDeadSites: false, // 网站导航：隐藏探活失败的站点
  enableToast: true,
  enableConfirm: true, // 危险操作用样式化确认框替代原生 confirm
  enableShortcuts: true, // 1-7 切标签 / / 搜索 / g GitHub 搜索
  enableGlobalSearch: true,
};

function load() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULTS };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      aiConfig: { ...DEFAULTS.aiConfig, ...(parsed.aiConfig || {}) },
    };
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
    Object.assign(state, { ...DEFAULTS, ...obj, aiConfig: { ...DEFAULTS.aiConfig, ...(obj.aiConfig || {}) } });
  }
  function exportSettings() {
    return JSON.parse(JSON.stringify(state));
  }
  return { settings: state, reset, importSettings, exportSettings, DEFAULTS };
}
