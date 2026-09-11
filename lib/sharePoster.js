// 分享海报：把一条分享内容画成 900×1200 的 PNG。
// 组成：渐变底 + 丑头像（复用 lib/uglyavatar* 三引擎）+ 标题/描述 + 来源链接 + 二维码 + 品牌页脚。
// 全部用 Canvas 2D 手绘，不引第三方截图库；头像用离屏 canvas 渲染后再贴进来
//（三套引擎的 renderAvatar 都会重置变换矩阵，不能直接往主画布上画）。
import { AvatarKit2 as KitA } from './uglyavatar';
import { AvatarKit2 as KitB } from './uglyavatar2';
import { AvatarKit2 as KitC } from './uglyavatar-txstc55';
import { qrEncode, drawQr } from './qrcode';

const KITS = { A: KitA, B: KitB, C: KitC };
const FONT = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', system-ui, sans-serif";

const W = 900;
const H = 1200;
const PAD = 40; // 海报外边距
const CARD_PAD = 44; // 卡片内边距

const CJK = /[　-〿一-鿿＀-￯]/;

/** 中英文混排分词：CJK 按字断，拉丁按词断 */
function tokenize(text) {
  const tokens = [];
  let buf = '';
  for (const ch of String(text)) {
    if (CJK.test(ch)) {
      if (buf) tokens.push(buf);
      buf = '';
      tokens.push(ch);
    } else if (ch === ' ' || ch === '\n' || ch === '\t') {
      if (buf) tokens.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);
  return tokens;
}

/** 按最大宽度折行，超过 maxLines 时末行加省略号 */
function wrap(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  for (const tk of tokenize(text)) {
    const test = line ? line + tk : tk;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = tk;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = last + '…';
  return kept;
}

/** 单行超宽时截断 */
function ellipsis(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 用离屏 canvas 渲染一枚丑头像并贴到主画布 */
function drawAvatar(ctx, cfg, x, y, size, radius) {
  const kit = KITS[cfg.engine] || KitA;
  const off = document.createElement('canvas');
  off.width = off.height = 512;
  const av = kit.generateAvatar(cfg.species || 'random', { seed: (cfg.seed || 0) >>> 0 });
  kit.renderAvatar(off.getContext('2d'), av, 3.2, 512, {});
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  ctx.drawImage(off, x, y, size, size);
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawBadge(ctx, text, right, centerY) {
  if (!text) return;
  ctx.save();
  ctx.font = `600 22px ${FONT}`;
  const w = ctx.measureText(text).width + 30;
  const x = right - w;
  const h = 44;
  roundRect(ctx, x, centerY - h / 2, w, h, 22);
  ctx.fillStyle = 'rgba(108,140,255,0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(108,140,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#a9bcff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, centerY + 1);
  ctx.restore();
}

/**
 * 渲染分享海报。
 * @param {object} payload { title, desc, url, badge, sid, avatar:{engine,species,seed}, shareUrl, createdAt }
 * @returns {HTMLCanvasElement}
 */
export function renderSharePoster(payload) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ---- 背景 ----
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, '#0b1020');
  bg.addColorStop(0.55, '#141d38');
  bg.addColorStop(1, '#0d1327');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.5, -120, 40, W * 0.5, -120, 760);
  glow.addColorStop(0, 'rgba(108,140,255,0.34)');
  glow.addColorStop(1, 'rgba(108,140,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.1, H + 60, 40, W * 0.1, H + 60, 620);
  glow2.addColorStop(0, 'rgba(52,211,153,0.16)');
  glow2.addColorStop(1, 'rgba(52,211,153,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // ---- 卡片 ----
  const cx = PAD;
  const cy = PAD;
  const cw = W - PAD * 2;
  const ch = H - PAD * 2;
  roundRect(ctx, cx, cy, cw, ch, 44);
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const innerL = cx + CARD_PAD;
  const innerR = cx + cw - CARD_PAD;
  const innerW = innerR - innerL;

  // ---- 顶部品牌 + 标签 ----
  ctx.save();
  ctx.font = `700 26px ${FONT}`;
  ctx.fillStyle = '#e8ecf5';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('🧭 领航舱', innerL, cy + 62);
  ctx.font = `400 20px ${FONT}`;
  ctx.fillStyle = '#8b95ad';
  ctx.fillText('NavCockpit', innerL + 118, cy + 64);
  ctx.restore();
  drawBadge(ctx, payload.badge || '分享', innerR, cy + 62);

  // ---- 丑头像 ----
  const avSize = 380;
  drawAvatar(ctx, payload.avatar || {}, (W - avSize) / 2, 170, avSize, 32);

  // ---- 标题 ----
  let y = 640;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `700 46px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  const titleLines = wrap(ctx, payload.title || '未命名', innerW, 2);
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y);
    y += 60;
  }

  // ---- 描述 ----
  if (payload.desc) {
    y += 14;
    ctx.font = `400 25px ${FONT}`;
    ctx.fillStyle = '#9aa6c2';
    for (const line of wrap(ctx, payload.desc, innerW, 3)) {
      ctx.fillText(line, W / 2, y);
      y += 36;
    }
  }

  // ---- 来源链接 ----
  if (payload.url) {
    y += 14;
    ctx.font = `400 21px ${FONT}`;
    ctx.fillStyle = '#6c8cff';
    let host = payload.url;
    try {
      const u = new URL(payload.url);
      host = u.host + (u.pathname === '/' ? '' : u.pathname);
    } catch {}
    ctx.fillText(ellipsis(ctx, host, innerW), W / 2, y);
  }

  // ---- 页脚：二维码 + 说明 ----
  const qrSize = 190;
  const qrY = cy + ch - CARD_PAD - qrSize;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(innerL, qrY - 34);
  ctx.lineTo(innerR, qrY - 34);
  ctx.stroke();
  ctx.restore();

  const qr = qrEncode(payload.shareUrl || payload.url || 'https://example.com', 'M');
  const modulePx = Math.floor(qrSize / (qr.size + 8));
  drawQr(ctx, qr, innerL, qrY, modulePx, { radius: 16, dark: '#0b1020', light: '#ffffff' });

  const tx = innerL + qrSize + 32;
  const ty = qrY + qrSize / 2;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = '#e8ecf5';
  ctx.fillText('扫码打开分享页', tx, ty - 34);
  ctx.font = `400 20px ${FONT}`;
  ctx.fillStyle = '#8b95ad';
  ctx.fillText(`分享码 ${payload.sid || '—'}`, tx, ty + 2);
  ctx.fillText(`生成于 ${formatDate(payload.createdAt)}`, tx, ty + 36);
  ctx.restore();

  return canvas;
}

function formatDate(v) {
  const d = v ? new Date(v) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('zh-CN');
  return d.toLocaleDateString('zh-CN');
}

/** 把海报存成 PNG 下载 */
export function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

/**
 * 由分享内容稳定派生头像参数：同一条内容永远拿到同一张脸。
 * seed 用 FNV-1a 哈希，engine/species 也由哈希决定，保证「随机但可复现」。
 */
export function avatarFor(key) {
  let h = 2166136261;
  for (const ch of String(key || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  return {
    engine: ['A', 'B', 'C'][h % 3],
    species: 'random',
    seed: h,
  };
}
