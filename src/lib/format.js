// 纯展示用的小工具：首字母色块、域名、日期。
const PALETTE = [
  '#5b6ee1',
  '#c2643f',
  '#3f8f6f',
  '#a05bb5',
  '#b3803a',
  '#4a86b8',
  '#b05a72',
  '#5f7a3f',
  '#7a6bd6',
  '#a76b46',
];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/** 名称首字符：英文转大写，中文保留 */
export function initial(name = '') {
  const s = String(name).trim();
  if (!s) return '·';
  return s[0].toUpperCase();
}

/** 由名称稳定映射到一个柔和的底色 */
export function markColor(name = '') {
  return PALETTE[hash(String(name)) % PALETTE.length];
}

export function hostOf(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${formatDate(value)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
