// 全局状态：设置（localStorage）+ JSON 数据加载（带内存缓存）。
import { reactive, ref, watch } from 'vue';

const SETTINGS_KEY = 'ferry:settings';
const TAB_KEY = 'ferry:tab';

const DEFAULTS = {
  theme: 'auto', // auto | light | dark
  defaultTab: '', // 留空 = 记住上次访问的标签
  showDesc: true, // 导航卡片是否显示描述
  shortcuts: true, // ⌘K / 数字键切换
};

function readSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = reactive(readSettings());

watch(
  settings,
  (val) => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(val));
    } catch {
      /* 隐私模式下写不进去，忽略 */
    }
  },
  { deep: true },
);

export function resetSettings() {
  Object.assign(settings, DEFAULTS);
}

// 主题：auto 时交回给 CSS 的 prefers-color-scheme
export function applyTheme(theme = settings.theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

export function readLastTab() {
  try {
    return localStorage.getItem(TAB_KEY) || '';
  } catch {
    return '';
  }
}

export function writeLastTab(id) {
  try {
    localStorage.setItem(TAB_KEY, id);
  } catch {
    /* ignore */
  }
}

// ---------------- 数据 ----------------
export const site = ref(null);

const cache = new Map();

/** 读取 public/data/<name>.json，失败抛错交给调用方展示 */
export async function loadData(name, { fresh = false } = {}) {
  if (!fresh && cache.has(name)) return cache.get(name);
  const url = `/data/${name}.json${fresh ? `?t=${Date.now()}` : ''}`;
  const res = await fetch(url, { cache: fresh ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(`${name}.json 加载失败（HTTP ${res.status}）`);
  const json = await res.json();
  cache.set(name, json);
  return json;
}

/** 把 site.json 里配置的分析脚本注入页面（留空则完全不加载） */
export function injectAnalytics(cfg = {}) {
  const { gaId, clarityId, adsenseClient } = cfg;

  if (gaId) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(s);
    const inline = document.createElement('script');
    inline.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${gaId}');`;
    document.head.appendChild(inline);
  }

  if (clarityId) {
    const inline = document.createElement('script');
    inline.textContent = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${clarityId}");`;
    document.head.appendChild(inline);
  }

  if (adsenseClient) {
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`;
    document.head.appendChild(s);
  }
}
