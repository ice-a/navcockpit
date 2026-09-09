// 丑头像第二引擎（自带，零依赖）：方块怪 / Blocky Monster 风格。
// 与 lib/uglyavatar.js（GordenSun 有机风格）并存，由 AvatarTab 切换；默认仍是 GordenSun。
// 设计：seed 可复现、4 种物种、随机头型/眼睛/嘴/配饰/背景，带轻微呼吸动画。可导出任意分辨率 PNG。
// 注意：原本想直接接入 txstc55/ugly-avatar，但其渲染层深度绑定 Vue 且为 CC BY-NC（非商用），
// 故改用这套独立实现，API 与引擎一保持一致（generateAvatar / renderAvatar / SPECIES）。
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPECIES = [
  { id: 'random', cn: '🎲 随机' },
  { id: 'blob', cn: '🫧 史莱姆' },
  { id: 'box', cn: '📦 方块人' },
  { id: 'ghost', cn: '👻 幽灵' },
  { id: 'bot', cn: '🤖 机器人' },
];

const PALETTES = [
  ['#ff6b6b', '#ffd93d', '#6bcb77'],
  ['#4d96ff', '#ffd3b6', '#ffaaa5'],
  ['#a66cff', '#ffd6ff', '#9bf6ff'],
  ['#06d6a0', '#ffd166', '#ef476f'],
  ['#118ab2', '#ffd166', '#f78c6b'],
];
const BG = ['#1b2338', '#241b38', '#16312b', '#33231b', '#1b2a33', '#2a1b33'];

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function generateAvatar(species, opts = {}) {
  const seed = opts.seed != null ? opts.seed >>> 0 : Math.floor(Math.random() * 1e9);
  const rng = mulberry32(seed);
  let sp = species;
  if (!sp || sp === 'random') sp = pick(rng, SPECIES.slice(1).map((s) => s.id));

  const palette = pick(rng, PALETTES);
  const head = palette[0];
  const accent = palette[1];
  const body = palette[2];
  const bg = pick(rng, BG);

  const eyeCount = 1 + Math.floor(rng() * 3); // 1-3 只眼睛
  const eyes = [];
  for (let i = 0; i < eyeCount; i++) {
    eyes.push({
      x: -0.28 + rng() * 0.56,
      y: -0.12 + rng() * 0.28,
      r: 0.06 + rng() * 0.06,
    });
  }
  const mouth = pick(rng, ['smile', 'open', 'flat', 'teeth']);
  const accessory = rng() > 0.5 ? pick(rng, ['antenna', 'horns', 'none', 'crown']) : 'none';
  const blush = rng() > 0.5;

  return {
    seed,
    species: sp,
    head,
    accent,
    body,
    bg,
    eyes,
    mouth,
    accessory,
    blush,
    bob: 0.02 + rng() * 0.03,
    phase: rng() * Math.PI * 2,
  };
}

function drawEye(ctx, av, ex, ey, r) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ex, ey, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(ex, ey + r * 0.1, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function renderAvatar(ctx, av, t, size, opts = {}) {
  const bg = opts.bgColor !== undefined ? opts.bgColor : av.bg;
  ctx.clearRect(0, 0, size, size);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  const cx = size / 2;
  const cy = size / 2;
  const bob = Math.sin(t * 1.5 + av.phase) * av.bob * size;
  const s = size * 0.32;

  ctx.save();
  ctx.translate(cx, cy + bob);

  // 配饰
  if (av.accessory === 'antenna') {
    ctx.strokeStyle = av.accent;
    ctx.lineWidth = size * 0.02;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(0, -s - size * 0.12);
    ctx.stroke();
    ctx.fillStyle = av.accent;
    ctx.beginPath();
    ctx.arc(0, -s - size * 0.13, size * 0.03, 0, Math.PI * 2);
    ctx.fill();
  } else if (av.accessory === 'horns') {
    ctx.fillStyle = av.accent;
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, -s * 0.8);
    ctx.lineTo(-s * 0.4, -s * 1.25);
    ctx.lineTo(-s * 0.2, -s * 0.8);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.6, -s * 0.8);
    ctx.lineTo(s * 0.4, -s * 1.25);
    ctx.lineTo(s * 0.2, -s * 0.8);
    ctx.fill();
  } else if (av.accessory === 'crown') {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, -s * 0.8);
    ctx.lineTo(-s * 0.7, -s * 1.15);
    ctx.lineTo(-s * 0.35, -s * 0.9);
    ctx.lineTo(0, -s * 1.2);
    ctx.lineTo(s * 0.35, -s * 0.9);
    ctx.lineTo(s * 0.7, -s * 1.15);
    ctx.lineTo(s * 0.7, -s * 0.8);
    ctx.closePath();
    ctx.fill();
  }

  // 头型
  ctx.fillStyle = av.head;
  if (av.species === 'box') {
    const r = size * 0.05;
    roundRect(ctx, -s, -s, s * 2, s * 2, r);
    ctx.fill();
  } else if (av.species === 'ghost') {
    ctx.beginPath();
    ctx.arc(0, 0, s, Math.PI, 0);
    ctx.lineTo(s, s);
    const waves = 4;
    for (let i = 0; i < waves; i++) {
      const x0 = s - (i * 2 * s) / waves;
      ctx.quadraticCurveTo(x0 - s / waves, s + size * 0.06, x0 - (2 * s) / waves, s);
    }
    ctx.closePath();
    ctx.fill();
  } else if (av.species === 'bot') {
    roundRect(ctx, -s, -s * 0.85, s * 2, s * 1.7, size * 0.08);
    ctx.fill();
  } else {
    // blob
    ctx.beginPath();
    ctx.arc(0, 0, s, 0, Math.PI * 2);
    ctx.fill();
  }

  // 身体点缀
  ctx.fillStyle = av.body;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(-s * 0.5, s * 0.5, s * 0.35, 0, Math.PI * 2);
  ctx.arc(s * 0.5, s * 0.5, s * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 腮红
  if (av.blush) {
    ctx.fillStyle = 'rgba(255,120,140,0.6)';
    ctx.beginPath();
    ctx.arc(-s * 0.55, s * 0.18, s * 0.16, 0, Math.PI * 2);
    ctx.arc(s * 0.55, s * 0.18, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  // 眼睛
  for (const e of av.eyes) {
    drawEye(ctx, av, e.x * s, e.y * s, e.r * s);
  }

  // 嘴
  ctx.strokeStyle = '#3a1f1f';
  ctx.lineWidth = size * 0.025;
  ctx.beginPath();
  const my = s * 0.42;
  if (av.mouth === 'smile') {
    ctx.arc(0, my - size * 0.02, s * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (av.mouth === 'open') {
    ctx.fillStyle = '#7a2e2e';
    ctx.beginPath();
    ctx.ellipse(0, my, s * 0.22, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (av.mouth === 'teeth') {
    ctx.arc(0, my - size * 0.02, s * 0.4, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-s * 0.3, my - size * 0.01, s * 0.6, size * 0.03);
  } else {
    ctx.moveTo(-s * 0.25, my);
    ctx.lineTo(s * 0.25, my);
    ctx.stroke();
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export const AvatarKit2 = { SPECIES, generateAvatar, renderAvatar };
export default AvatarKit2;
