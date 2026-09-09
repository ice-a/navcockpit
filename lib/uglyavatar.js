'use strict';
/* ==========================================================
   丑丑头像绘制引擎 · 第 2 版「抽象凌乱丑」
   - 沸腾线：所有线条每秒重新抖动几次（低帧率手绘感）
   - 错位填色：填充和轮廓故意对不齐，像劣质印刷
   - 五官独立随机：左右眼可以完全不同款
   - 依旧全部是时间 t 的纯函数，任意帧可精确重绘
   ========================================================== */
(function () {
  const TAU = Math.PI * 2;

  /* ---------- 随机数 ---------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeR(rng) {
    return {
      f: (a = 0, b = 1) => a + (b - a) * rng(),
      i: (a, b) => Math.floor(a + (b - a + 1) * rng()),
      pick: (arr) => arr[Math.floor(rng() * arr.length)],
      chance: (p) => rng() < p,
      sign: () => (rng() < 0.5 ? -1 : 1),
    };
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  /* ---------- 时间函数 ---------- */
  function blinkAmt(t, phase, interval) {
    const bt = (((t + phase) % interval) + interval) % interval;
    const dur = 0.24;
    if (bt >= dur) return 0;
    const p = bt / dur;
    return p < 0.5 ? smooth(p / 0.5) : smooth((1 - p) / 0.5);
  }
  function pulse(t, interval, dur) {
    const bt = ((t % interval) + interval) % interval;
    if (bt >= dur) return 0;
    return Math.sin((bt / dur) * Math.PI);
  }
  function popScale(age) {
    if (age == null || age < 0 || age > 2) return 1;
    return 1 - 0.14 * Math.exp(-age * 5) * Math.cos(age * 8.5);
  }

  /* ---------- 沸腾线抖动 ----------
     每帧(低帧率)换一个种子，同一帧内序列稳定，
     所以同一时刻 t 在任何分辨率下重绘结果一致 */
  function makeJ(av, t) {
    const frame = Math.floor(t * av.boilFps);
    const seed = (av.seed ^ Math.imul(frame + 13, 2654435761)) >>> 0;
    const rng = mulberry32(seed);
    return { n: (k = 1) => (rng() * 2 - 1) * av.jitterAmp * k, r: () => rng() };
  }

  /* ---------- 涂鸦几何 ---------- */
  function ellPts(x, y, rx, ry, n = 16, rot = 0, irr = null) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const k = irr ? 1 + irr[i % irr.length] : 1;
      const px = Math.cos(a) * rx * k, py = Math.sin(a) * ry * k;
      pts.push({
        x: x + px * Math.cos(rot) - py * Math.sin(rot),
        y: y + px * Math.sin(rot) + py * Math.cos(rot),
      });
    }
    return pts;
  }
  function qSample(p0, p1, p2, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n, u = 1 - s;
      pts.push({
        x: u * u * p0.x + 2 * u * s * p1.x + s * s * p2.x,
        y: u * u * p0.y + 2 * u * s * p1.y + s * s * p2.y,
      });
    }
    return pts;
  }
  // 抖动折线路径：把每段再细分，逐点加噪声
  function jPath(ctx, pts, J, close, ampK = 1) {
    ctx.beginPath();
    const step = 14;
    let first = true;
    const m = pts.length;
    const segs = close ? m : m - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % m];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.round(d / step));
      for (let k = first ? 0 : 1; k <= n; k++) {
        const p = k / n;
        const x = a.x + (b.x - a.x) * p + J.n(ampK);
        const y = a.y + (b.y - a.y) * p + J.n(ampK);
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
    }
    if (close) ctx.closePath();
  }
  function strokeJ(ctx, pts, J, o = {}) {
    jPath(ctx, pts, J, o.close || false, o.ampK == null ? 1 : o.ampK);
    ctx.lineWidth = o.lw || 5;
    ctx.strokeStyle = o.color || '#1c1c1c';
    ctx.stroke();
    if (o.double) {
      jPath(ctx, pts, J, o.close || false, (o.ampK == null ? 1 : o.ampK) * 1.4);
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = (o.lw || 5) * 0.7;
      ctx.stroke();
      ctx.restore();
    }
  }
  function bbox(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return { x0, y0, x1, y1 };
  }
  // 错位填色：solid=整块错位 / hatch=斜线排线 / squig=蛇形涂抹
  function fillMessy(ctx, av, J, basePts, color, mode) {
    const m = mode || av.fillMode;
    const dx = av.fillOff.x + J.n(0.4), dy = av.fillOff.y + J.n(0.4);
    const pts = basePts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    if (m === 'solid') {
      jPath(ctx, pts, J, true);
      ctx.fillStyle = color; ctx.fill();
      return;
    }
    // 打底淡色
    jPath(ctx, pts, J, true);
    ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = color; ctx.fill(); ctx.restore();
    // 排线/涂抹
    jPath(ctx, pts, J, true);
    ctx.save();
    ctx.clip();
    const b = bbox(pts);
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    if (m === 'hatch') {
      ctx.lineWidth = av.hatchLw;
      const ang = av.hatchAng, ca = Math.cos(ang), sa = Math.sin(ang);
      const diag = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      for (let d = -diag / 2; d < diag / 2; d += av.hatchGap) {
        const px = cx + (-sa) * d, py = cy + ca * d;
        strokeJ(ctx, [
          { x: px - ca * diag / 2, y: py - sa * diag / 2 },
          { x: px + ca * diag / 2, y: py + sa * diag / 2 },
        ], J, { lw: av.hatchLw, color, ampK: 1.3 });
      }
    } else {
      // squig：一条来回蛇形的粗线
      ctx.lineWidth = av.hatchGap * 0.85;
      const rows = [];
      let flip = false;
      for (let y = b.y0 + av.hatchGap / 2; y < b.y1; y += av.hatchGap) {
        rows.push(flip ? { x: b.x1, y } : { x: b.x0, y });
        rows.push(flip ? { x: b.x0, y } : { x: b.x1, y });
        flip = !flip;
      }
      if (rows.length > 1) strokeJ(ctx, rows, J, { lw: av.hatchGap * 0.85, color, ampK: 1.6 });
    }
    ctx.restore();
  }
  function shapeMessy(ctx, av, J, pts, fill, o = {}) {
    if (fill) fillMessy(ctx, av, J, pts, fill, o.fillMode);
    strokeJ(ctx, pts, J, { close: true, lw: o.lw || av.lw, color: o.line || av.palette.line, double: o.double != null ? o.double : av.doubleStroke });
  }
  function dotScribble(ctx, J, x, y, r, color) {
    ctx.fillStyle = color;
    jPath(ctx, ellPts(x, y, r, r, 10), J, true, 0.7);
    ctx.fill();
    jPath(ctx, ellPts(x + J.n(0.8), y + J.n(0.8), r * 0.8, r * 0.8, 8), J, true, 0.7);
    ctx.fill();
  }

  /* ---------- 调色板 ---------- */
  const BG2 = ['#eaf25c', '#ff9de2', '#7de0ff', '#ffc24b', '#b9f7a8', '#ff8a7a', '#e8e3d5', '#cdb4ff', '#9ef2c9', '#f2f26b', '#dedede', '#ffb3c7'];
  const HEADC = ['#f5e14a', '#ff8fd8', '#8fe855', '#ffa54f', '#6fe0d0', '#ff7752', '#d9b8ff', '#bfe36b', '#8fd8ff', '#f2ede2', '#e56bd6', '#c9c9a3', '#a3f26b', '#ffd9b3', '#e0a878', '#b57a4b'];
  const LINEC = ['#1c1c1c', '#1c1c1c', '#26224d', '#3a1f1f', '#123524'];
  const ACC = ['#ff2e88', '#2e5bff', '#00b247', '#ff7a00', '#8a2eff', '#00b8b8', '#d6d600', '#e83030'];
  const COW_FUR = ['#f2b705', '#ffce33', '#e8a812', '#d9b23c', '#f2b705', '#c9f25a'];
  const COW_MUZ = ['#cfc2ce', '#c4b6cc', '#d8c5c5', '#b8c4cf'];

  const SPECIES = [
    { id: 'human', cn: '人类', emoji: '??' },
    { id: 'cow', cn: '牛牛', emoji: '??' },
    { id: 'cat', cn: '小猫', emoji: '??' },
    { id: 'bird', cn: '小鸟', emoji: '??' },
  ];

  /* ==========================================================
     参数生成
     ========================================================== */
  const EYE_STYLES_ALL = ['ring', 'dot', 'googly', 'spiral', 'x', 'blood', 'lash', 'sleepy', 'stack'];

  function genEye(R, styles) {
    return {
      style: R.pick(styles),
      size: R.f(11, 34),
      dy: R.f(-22, 20),
      dxk: R.f(0.8, 1.25),
      rot: R.f(-0.3, 0.3),
      lid: R.f(0.35, 0.7),
      pupilK: R.f(0.3, 0.62),
    };
  }

  function generateAvatar(speciesId, opts = {}) {
    // 支持外部传入 seed（同 seed 永远生成同一张头像）；不传则随机
    const seed = opts.seed != null ? opts.seed >>> 0 : (Math.random() * 0xffffffff) >>> 0;
    const rng = mulberry32(seed);
    const R = makeR(rng);
    const id = !speciesId || speciesId === 'random' ? R.pick(SPECIES).id : speciesId;
    const av = { species: id, seed, bornT: null };

    /* 画风参数：每只的“画得烂的方式”都不一样 */
    av.boilFps = R.f(4.5, 7);
    av.jitterAmp = R.f(1.6, 3.4);
    av.lw = R.f(4.5, 9);
    av.doubleStroke = R.chance(0.55);
    av.fillMode = R.pick(['solid', 'solid', 'hatch', 'squig']);
    av.fillOff = { x: R.f(-9, 9), y: R.f(-8, 8) };
    if (Math.abs(av.fillOff.x) + Math.abs(av.fillOff.y) < 5) av.fillOff.x = 7 * R.sign();
    av.hatchAng = R.f(-1.2, 1.2);
    av.hatchGap = R.f(9, 16);
    av.hatchLw = R.f(3.5, 6.5);

    const bg = R.pick(BG2);
    let head = R.pick(HEADC);
    if (head === bg) head = R.pick(HEADC);
    av.palette = {
      bg,
      head,
      line: R.pick(LINEC),
      acc1: R.pick(ACC),
      acc2: R.pick(ACC),
      neck: R.chance(0.7) ? head : R.pick(HEADC),
    };

    /* 头型：点数少=硬边多边形，点数多=烂土豆 */
    av.headCy = 248 + R.f(-16, 10);
    av.baseRot = R.f(-0.09, 0.09);
    const type = R.pick(['blob', 'blob', 'poly', 'spiky', 'tall', 'wide']);
    av.headType = type;
    let rx = R.f(120, 182), ry = R.f(112, 172);
    if (type === 'tall') { ry = R.f(150, 190); rx = R.f(100, 135); }
    if (type === 'wide') { rx = R.f(150, 190); ry = R.f(100, 135); }
    av.headRx = rx; av.headRy = ry;
    const n = type === 'poly' ? R.i(5, 8) : type === 'spiky' ? R.i(12, 16) : R.i(12, 18);
    const irr = type === 'poly' ? R.f(0.1, 0.24) : type === 'spiky' ? R.f(0.1, 0.2) : R.f(0.05, 0.16);
    av.headPts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - Math.PI / 2;
      let k = 1 + R.f(-irr, irr);
      if (type === 'spiky' && i % 2 === 0) k += R.f(0.06, 0.16);
      av.headPts.push({ x: Math.cos(a) * rx * k, y: Math.sin(a) * ry * k });
    }
    // 底部滴落
    av.drips = [];
    if (R.chance(0.3)) {
      const dn = R.i(1, 3);
      for (let i = 0; i < dn; i++) {
        av.drips.push({ x: R.f(-0.5, 0.5) * rx, len: R.f(20, 55), w: R.f(12, 26), ph: R.f(0, TAU) });
      }
    }

    /* 脖子 */
    av.neck = {
      w: R.f(64, 150),
      skewT: R.f(-18, 18),
      skewB: R.f(-24, 24),
      stripes: R.chance(0.35) ? R.i(2, 3) : 0,
    };

    /* 动画 */
    av.anim = {
      bobSpeed: R.f(1.2, 2.6), bobAmp: R.f(5, 12),
      tiltAmp: R.f(0.03, 0.09), tiltSpeed: R.f(0.7, 1.6),
      squash: R.f(0.015, 0.05),
      blinkInt: R.f(2.2, 5), blinkPhase: R.f(0, 10),
      lookP1: R.f(0, TAU), lookP2: R.f(0, TAU), lookAmp: R.f(4, 12),
      phase: R.f(0, TAU),
    };

    /* 混乱元素 */
    av.chaos = {
      flies: R.chance(0.45) ? R.i(1, 3) : 0,
      flyOrbit: { x: R.f(-70, 70), y: -ry - R.f(10, 50), r: R.f(28, 64), sp: R.f(1.4, 3), ph: R.f(0, TAU) },
      sweat: R.chance(0.3),
      sweatSide: R.sign(),
      bandaid: R.chance(0.3) ? { x: R.f(-0.6, 0.6) * rx, y: R.f(-0.8, -0.1) * ry, rot: R.f(-1, 1) } : null,
      stitch: R.chance(0.25) ? { x: R.f(-0.7, 0.7) * rx, y: R.f(-0.4, 0.5) * ry, rot: R.f(-0.8, 0.8), len: R.f(30, 55) } : null,
      stickers: [],
      stink: R.chance(0.22),
      graffiti: R.chance(0.14),
      blush: R.chance(0.55),
      blushMess: R.chance(0.5),
    };
    const stCount = R.chance(0.4) ? R.i(1, 2) : 0;
    for (let i = 0; i < stCount; i++) {
      av.chaos.stickers.push({
        x: R.f(-0.8, 0.8) * rx, y: R.f(-0.9, 0.4) * ry,
        type: R.pick(['tri', 'star', 'ring', 'cross']),
        s: R.f(10, 22), rot: R.f(0, TAU), color: R.pick(ACC),
      });
    }

    /* 背景涂鸦 */
    av.bgStuff = [];
    const bn = R.i(3, 6);
    for (let i = 0; i < bn; i++) {
      const ang = (i / bn) * TAU + R.f(-0.5, 0.5);
      const rad = R.f(200, 250);
      av.bgStuff.push({
        x: clamp(256 + Math.cos(ang) * rad, 26, 486),
        y: clamp(250 + Math.sin(ang) * rad, 26, 486),
        type: R.pick(['squig', 'ring', 'tri', 'cross', 'splat', 'zig']),
        s: R.f(14, 34), rot: R.f(0, TAU),
        color: R.chance(0.6) ? R.pick(ACC) : av.palette.line,
        seedK: R.i(1, 999),
      });
    }
    av.frame = R.chance(0.55) ? { lw: R.f(4, 7), inset: R.f(10, 20), dbl: R.chance(0.4) } : null;

    GEN2[id](R, av);
    return av;
  }

  /* ---------- 各物种参数 ---------- */
  const GEN2 = {
    human(R, av) {
      av.eyes = {
        ex: R.f(44, 78),
        cyclops: R.chance(0.1),
        L: genEye(R, EYE_STYLES_ALL),
        Rt: genEye(R, EYE_STYLES_ALL),
      };
      if (av.eyes.cyclops) { av.eyes.L.size = R.f(30, 46); av.eyes.L.style = R.pick(['ring', 'googly', 'blood', 'lash']); }
      av.brows = { mode: av.eyes.cyclops ? 'one' : R.pick(['both', 'both', 'one', 'uni', 'none']), w: R.f(6, 13), tilt: R.f(-0.5, 0.5), gap: R.f(12, 30) };
      av.spec = {
        hairC: R.pick([...ACC, '#1c1c1c', '#6b4a2f', '#e0a12b', '#f2f0ea']),
        hair: R.pick(['mess', 'mess', 'antenna', 'balding', 'fringe', 'none']),
        hairN: R.i(6, 16),
        nose: R.pick(['droop', 'droop', 'ball', 'tri', 'dots']),
        noseLen: R.f(26, 62), noseW: R.f(12, 24), noseDx: R.f(-14, 14),
        mouth: R.pick(['zig', 'grin', 'scream', 'wavy', 'o', 'stitch', 'frown', 'grin']),
        mouthW: R.f(40, 110), mouthDx: R.f(-28, 28), mouthDy: R.f(46, 86), mouthRot: R.f(-0.22, 0.22),
        teethN: R.i(3, 7), missTooth: R.i(0, 2), goldTooth: R.chance(0.2),
        stubble: R.chance(0.3),
        glasses: R.chance(0.25),
        mole: R.chance(0.2) ? { x: R.f(-0.6, 0.6), y: R.f(0, 0.5) } : null,
        earL: R.f(12, 30), earR: R.f(12, 30),
      };
    },
    cow(R, av) {
      // 保留参考图特征：黄毛、灰紫大嘴厚唇、灰角、困眼浓眉——但更歪更烂
      av.palette.head = R.pick(COW_FUR);
      av.eyes = {
        ex: R.f(48, 72),
        cyclops: false,
        L: genEye(R, ['sleepy', 'sleepy', 'blood', 'dot', 'ring']),
        Rt: genEye(R, ['sleepy', 'sleepy', 'dot', 'x', 'ring']),
      };
      av.eyes.L.dy -= 20; av.eyes.Rt.dy -= 20;
      av.brows = { mode: 'both', w: R.f(9, 16), tilt: R.f(0.05, 0.45), gap: R.f(10, 24) };
      av.spec = {
        muzzleC: R.pick(COW_MUZ),
        mrx: R.f(96, 126), mry: R.f(70, 96),
        mdx: R.f(-16, 16), mrot: R.f(-0.09, 0.09), muzY: R.f(0.42, 0.56),
        hornL: { len: R.f(75, 155), ang: R.f(0.25, 0.8), w: R.f(18, 32), curve: R.f(-42, 42) },
        hornR: { len: R.f(75, 155), ang: R.f(0.25, 0.8), w: R.f(18, 32), curve: R.f(-42, 42) },
        hornC: R.pick(['#a7abb5', '#9aa0ab', '#8f96a3', '#b8b39e']),
        earL: { len: R.f(48, 88), w: R.f(26, 44), droop: R.f(0.1, 0.7) },
        earR: { len: R.f(48, 88), w: R.f(26, 44), droop: R.f(0.1, 0.7) },
        chewSpeed: R.f(1.6, 2.8),
        straw: R.chance(0.5),
        drool: R.chance(0.4),
        stubbleChin: R.chance(0.5),
        tuft: R.chance(0.5),
      };
    },
    cat(R, av) {
      av.eyes = {
        ex: R.f(44, 74),
        cyclops: false,
        L: genEye(R, ['sleepy', 'x', 'ring', 'googly', 'spiral', 'dot']),
        Rt: genEye(R, ['sleepy', 'dot', 'ring', 'blood', 'stack', 'lash']),
      };
      av.brows = { mode: R.pick(['both', 'one', 'none', 'none']), w: R.f(5, 10), tilt: R.f(-0.4, 0.4), gap: R.f(10, 22) };
      av.spec = {
        earL: { w: R.f(46, 80), h: R.f(50, 95), rot: R.f(-0.5, 0.1), bent: R.chance(0.35) },
        earR: { w: R.f(46, 80), h: R.f(50, 95), rot: R.f(-0.1, 0.5), bent: R.chance(0.35) },
        inner: R.pick(['#ff8fd8', '#f2a9b8', '#e56bd6']),
        noseY: R.f(8, 28), noseDx: R.f(-10, 10),
        mouth: R.pick(['w', 'w', 'grin', 'zig', 'o']),
        mouthW: R.f(36, 90),
        teethN: R.i(3, 6), missTooth: R.i(0, 1), goldTooth: R.chance(0.15),
        whiskerN: R.i(2, 4),
        whiskers: [],
        fang: R.chance(0.45),
        tongue: R.chance(0.25),
        stripes: R.chance(0.6) ? R.i(2, 4) : 0,
      };
      for (let s = 0; s < 2; s++) {
        for (let i = 0; i < av.spec.whiskerN; i++) {
          av.spec.whiskers.push({
            side: s === 0 ? -1 : 1,
            len: R.f(36, 96), y: R.f(-8, 34),
            ang: R.f(-0.35, 0.3), kink: R.f(-16, 16),
          });
        }
      }
    },
    bird(R, av) {
      av.eyes = {
        ex: R.f(40, 66),
        cyclops: false,
        L: genEye(R, ['googly', 'googly', 'ring', 'dot', 'spiral']),
        Rt: genEye(R, ['googly', 'ring', 'dot', 'x', 'lash']),
      };
      av.eyes.L.dy -= 14; av.eyes.Rt.dy -= 14;
      av.brows = { mode: R.pick(['none', 'none', 'both', 'one']), w: R.f(5, 10), tilt: R.f(-0.5, 0.5), gap: R.f(8, 20) };
      av.spec = {
        beakC: R.pick(['#ffb03a', '#ff7a00', '#f2d13d', '#ff8a7a']),
        bw: R.f(48, 92), bh: R.f(30, 56), bdx: R.f(-18, 18), by: R.f(8, 34), brot: R.f(-0.14, 0.14),
        chirpInt: R.f(3, 5.5),
        comb: R.i(2, 5), combC: R.pick(ACC),
        worm: R.chance(0.3),
        collar: R.chance(0.5),
      };
    },
  };

  /* ==========================================================
     背景
     ========================================================== */
  function drawBgStuff(ctx, av, J, t) {
    for (const el of av.bgStuff) {
      ctx.save();
      ctx.translate(el.x, el.y + Math.sin(t * 1.1 + el.seedK) * 4);
      ctx.rotate(el.rot);
      const c = el.color;
      if (el.type === 'squig') {
        const rw = mulberry32(el.seedK * 7919 + av.seed);
        const pts = [];
        let px = -el.s, py = 0;
        for (let i = 0; i < 7; i++) {
          pts.push({ x: px, y: py });
          px += el.s * 0.4;
          py = (rw() * 2 - 1) * el.s * 0.8;
        }
        strokeJ(ctx, pts, J, { lw: 4.5, color: c });
      } else if (el.type === 'ring') {
        strokeJ(ctx, ellPts(0, 0, el.s * 0.6, el.s * 0.6, 12), J, { close: true, lw: 4.5, color: c });
      } else if (el.type === 'tri') {
        strokeJ(ctx, [
          { x: 0, y: -el.s * 0.7 }, { x: el.s * 0.65, y: el.s * 0.5 }, { x: -el.s * 0.65, y: el.s * 0.5 },
        ], J, { close: true, lw: 4.5, color: c });
      } else if (el.type === 'cross') {
        strokeJ(ctx, [{ x: -el.s * 0.5, y: -el.s * 0.5 }, { x: el.s * 0.5, y: el.s * 0.5 }], J, { lw: 5, color: c });
        strokeJ(ctx, [{ x: el.s * 0.5, y: -el.s * 0.5 }, { x: -el.s * 0.5, y: el.s * 0.5 }], J, { lw: 5, color: c });
      } else if (el.type === 'splat') {
        const rw = mulberry32(el.seedK * 104729 + av.seed);
        for (let i = 0; i < 6; i++) {
          const a = rw() * TAU, rr2 = rw() * el.s;
          dotScribble(ctx, J, Math.cos(a) * rr2, Math.sin(a) * rr2, 2.5 + rw() * 3.5, c);
        }
      } else if (el.type === 'zig') {
        const pts = [];
        for (let i = 0; i < 6; i++) pts.push({ x: (i - 2.5) * el.s * 0.4, y: (i % 2 === 0 ? -1 : 1) * el.s * 0.35 });
        strokeJ(ctx, pts, J, { lw: 4.5, color: c });
      }
      ctx.restore();
    }
    if (av.frame) {
      const i = av.frame.inset;
      strokeJ(ctx, [
        { x: i, y: i }, { x: 512 - i, y: i }, { x: 512 - i, y: 512 - i }, { x: i, y: 512 - i },
      ], J, { close: true, lw: av.frame.lw, color: av.palette.line });
      if (av.frame.dbl) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        strokeJ(ctx, [
          { x: i + 9, y: i + 9 }, { x: 512 - i - 9, y: i + 9 }, { x: 512 - i - 9, y: 512 - i - 9 }, { x: i + 9, y: 512 - i - 9 },
        ], J, { close: true, lw: av.frame.lw * 0.7, color: av.palette.acc1 });
        ctx.restore();
      }
    }
  }

  /* ==========================================================
     通用部件
     ========================================================== */
  function drawNeck(ctx, av, J) {
    const N = av.neck, y0 = av.headRy * 0.35;
    const pts = [
      { x: -N.w / 2 + N.skewT, y: y0 },
      { x: N.w / 2 + N.skewT, y: y0 },
      { x: N.w / 2 + N.skewB, y: 300 },
      { x: -N.w / 2 + N.skewB, y: 300 },
    ];
    shapeMessy(ctx, av, J, pts, av.palette.neck);
    for (let i = 0; i < N.stripes; i++) {
      const y = av.headRy + 24 + i * 26;
      const k = (y - y0) / (300 - y0);
      const sk = N.skewT + (N.skewB - N.skewT) * k;
      strokeJ(ctx, [{ x: -N.w / 2 + sk + 6, y }, { x: N.w / 2 + sk - 6, y }], J, { lw: 5, color: av.palette.acc2 });
    }
  }

  function headPtsOff(av, dx = 0, dy = 0) {
    return av.headPts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
  function drawHead(ctx, av, J, t) {
    // 滴落（画在头后面，与头同色）
    for (const d of av.drips) {
      const wob = Math.sin(t * 0.8 + d.ph) * 5;
      const yTop = av.headRy * 0.7;
      const pts = [
        { x: d.x - d.w / 2, y: yTop },
        { x: d.x - d.w * 0.4, y: yTop + d.len * 0.7 + wob },
        { x: d.x, y: yTop + d.len + wob },
        { x: d.x + d.w * 0.4, y: yTop + d.len * 0.65 + wob },
        { x: d.x + d.w / 2, y: yTop },
      ];
      shapeMessy(ctx, av, J, pts, av.palette.head, { fillMode: 'solid' });
    }
    shapeMessy(ctx, av, J, headPtsOff(av), av.palette.head);
  }

  /* ---------- 眼睛（每只独立） ---------- */
  function drawUglyEye(ctx, av, J, A, E, x) {
    const P = av.palette;
    const y = E.dy;
    const r = E.size;
    const blink = blinkAmt(A.t, av.anim.blinkPhase + (x > 0 ? 0.35 : 0), av.anim.blinkInt);
    const lookX = clamp(A.lookX, -r * 0.4, r * 0.4);
    const lookY = clamp(A.lookY, -r * 0.3, r * 0.3);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(E.rot);
    const closable = ['ring', 'dot', 'blood', 'lash', 'sleepy', 'stack'].includes(E.style);
    if (closable && blink > 0.88) {
      strokeJ(ctx, [{ x: -r, y: 0 }, { x: 0, y: r * 0.4 }, { x: r, y: 0 }], J, { lw: 5.5, color: P.line });
      ctx.restore();
      return;
    }
    switch (E.style) {
      case 'dot':
        dotScribble(ctx, J, 0, 0, r * 0.5, P.line);
        break;
      case 'ring': {
        const pts = ellPts(0, 0, r, r, 12);
        ctx.fillStyle = '#fdfdf2';
        jPath(ctx, pts, J, true); ctx.fill();
        strokeJ(ctx, pts, J, { close: true, lw: 5, color: P.line, double: av.doubleStroke });
        dotScribble(ctx, J, lookX, lookY, r * E.pupilK, P.line);
        break;
      }
      case 'googly': {
        const pts = ellPts(0, 0, r, r, 14);
        ctx.fillStyle = '#ffffff';
        jPath(ctx, pts, J, true); ctx.fill();
        strokeJ(ctx, pts, J, { close: true, lw: 4.5, color: P.line });
        const w = Math.sin(A.t * 1.9 + av.anim.phase + x) * 2.4;
        const px = Math.cos(w) * r * 0.45;
        const py = (Math.abs(Math.sin(w)) * 0.5 + 0.35) * r;
        dotScribble(ctx, J, px, py, r * 0.42, P.line);
        break;
      }
      case 'spiral': {
        ctx.beginPath();
        const turns = 2.6;
        for (let a = 0; a <= turns * TAU; a += 0.4) {
          const rr2 = (a / (turns * TAU)) * r;
          const px = Math.cos(a) * rr2 + J.n(0.5), py = Math.sin(a) * rr2 + J.n(0.5);
          a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.lineWidth = 4; ctx.strokeStyle = P.line; ctx.stroke();
        break;
      }
      case 'x':
        strokeJ(ctx, [{ x: -r * 0.8, y: -r * 0.8 }, { x: r * 0.85, y: r * 0.75 }], J, { lw: 5.5, color: P.line, double: true });
        strokeJ(ctx, [{ x: r * 0.8, y: -r * 0.85 }, { x: -r * 0.75, y: r * 0.8 }], J, { lw: 5.5, color: P.line, double: true });
        break;
      case 'blood': {
        const pts = ellPts(0, 0, r, r * 0.92, 14);
        ctx.fillStyle = '#fdfdf2';
        jPath(ctx, pts, J, true); ctx.fill();
        strokeJ(ctx, pts, J, { close: true, lw: 4.5, color: P.line });
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + 0.5;
          strokeJ(ctx, [
            { x: Math.cos(a) * r * 0.92, y: Math.sin(a) * r * 0.85 },
            { x: Math.cos(a) * r * 0.45, y: Math.sin(a) * r * 0.4 },
          ], J, { lw: 2.5, color: '#e83030' });
        }
        dotScribble(ctx, J, lookX * 0.6, lookY * 0.6, r * 0.3, P.line);
        strokeJ(ctx, [{ x: -r, y: -r * 0.45 }, { x: r, y: -r * 0.5 }], J, { lw: 5, color: P.line });
        break;
      }
      case 'lash': {
        const pts = ellPts(0, 0, r, r, 12);
        ctx.fillStyle = '#fdfdf2';
        jPath(ctx, pts, J, true); ctx.fill();
        strokeJ(ctx, pts, J, { close: true, lw: 4.5, color: P.line });
        for (let i = 0; i < 4; i++) {
          const a = -Math.PI * 0.85 + i * 0.42;
          strokeJ(ctx, [
            { x: Math.cos(a) * r, y: Math.sin(a) * r },
            { x: Math.cos(a) * (r + 12), y: Math.sin(a) * (r + 12) },
          ], J, { lw: 3.5, color: P.line });
        }
        dotScribble(ctx, J, lookX, lookY, r * 0.4, P.line);
        break;
      }
      case 'sleepy': {
        const pts = ellPts(0, 0, r, r * 0.9, 12);
        ctx.fillStyle = '#fdfdf2';
        jPath(ctx, pts, J, true); ctx.fill();
        dotScribble(ctx, J, lookX * 0.5, r * 0.25, r * E.pupilK, P.line);
        // 眼皮：同头色盖上半
        const lid = clamp(E.lid + blink * (1 - E.lid), 0, 1);
        jPath(ctx, pts, J, true);
        ctx.save(); ctx.clip();
        ctx.fillStyle = P.head;
        ctx.fillRect(-r - 4, -r - 4, 2 * r + 8, (2 * r + 8) * lid * 0.92);
        ctx.restore();
        strokeJ(ctx, pts, J, { close: true, lw: 5, color: P.line });
        const ly = -r + (2 * r) * lid * 0.9;
        strokeJ(ctx, [{ x: -r, y: ly }, { x: r, y: ly + J.n(2) }], J, { lw: 5, color: P.line, double: true });
        // 眼袋
        strokeJ(ctx, [{ x: -r * 0.7, y: r * 1.2 }, { x: r * 0.6, y: r * 1.3 }], J, { lw: 3, color: P.line });
        break;
      }
      case 'stack': {
        const pts = ellPts(0, 0, r, r, 12);
        ctx.fillStyle = '#fdfdf2';
        jPath(ctx, pts, J, true); ctx.fill();
        strokeJ(ctx, pts, J, { close: true, lw: 4.5, color: P.line });
        dotScribble(ctx, J, -r * 0.3, -r * 0.15, r * 0.28, P.line);
        dotScribble(ctx, J, r * 0.28, r * 0.3, r * 0.34, P.line);
        break;
      }
    }
    ctx.restore();
  }

  function drawEyes2(ctx, av, J, A) {
    const E = av.eyes;
    if (E.cyclops) {
      drawUglyEye(ctx, av, J, A, E.L, 0);
      return;
    }
    drawUglyEye(ctx, av, J, A, E.L, -E.ex * E.L.dxk);
    drawUglyEye(ctx, av, J, A, E.Rt, E.ex * E.Rt.dxk);
  }

  function drawBrows2(ctx, av, J, A) {
    const B = av.brows;
    if (!B || B.mode === 'none') return;
    const E = av.eyes;
    const raise = pulse(A.t + av.anim.phase, 6.2, 1.3) * 10;
    const browAt = (x, eyeE, up) => {
      const y = eyeE.dy - eyeE.size - B.gap - (up ? raise : raise * 0.15);
      const len = eyeE.size * 2 + 14;
      const t1 = B.tilt * (x < 0 ? 1 : -1);
      strokeJ(ctx, [
        { x: x - len / 2, y: y + t1 * len * 0.5 },
        { x: x + len / 2, y: y - t1 * len * 0.5 },
      ], J, { lw: B.w, color: av.palette.line, double: true });
    };
    if (B.mode === 'uni') {
      const y = Math.min(E.L.dy - E.L.size, E.Rt.dy - E.Rt.size) - B.gap;
      strokeJ(ctx, [
        { x: -E.ex - E.L.size, y: y + 4 },
        { x: 0, y: y + 12 },
        { x: E.ex + E.Rt.size, y: y - 2 },
      ], J, { lw: B.w + 3, color: av.palette.line, double: true });
      return;
    }
    if (E.cyclops) { browAt(0, E.L, true); return; }
    browAt(-E.ex * E.L.dxk, E.L, true);
    if (B.mode === 'both') browAt(E.ex * E.Rt.dxk, E.Rt, false);
  }

  function drawBlush2(ctx, av, J) {
    if (!av.chaos.blush) return;
    const E = av.eyes;
    for (const side of [-1, 1]) {
      const x = side * (E.ex + 38), y = 22;
      if (av.chaos.blushMess) {
        for (let i = 0; i < 3; i++) {
          strokeJ(ctx, [{ x: x - 14, y: y - 8 + i * 7 }, { x: x + 14, y: y - 12 + i * 7 }], J, { lw: 4, color: '#ff5f7a' });
        }
      } else {
        ctx.save();
        ctx.globalAlpha = 0.6;
        dotScribble(ctx, J, x, y, 14, '#ff5f7a');
        ctx.restore();
      }
    }
  }

  /* ---------- 嘴 ---------- */
  function drawMouth2(ctx, av, J, A, S) {
    const P = av.palette;
    const w = S.mouthW;
    ctx.save();
    ctx.translate(S.mouthDx, S.mouthDy);
    ctx.rotate(S.mouthRot);
    const style = S.mouth;
    if (style === 'zig') {
      const pts = [];
      const n = 7;
      for (let i = 0; i <= n; i++) {
        pts.push({ x: -w / 2 + (i / n) * w, y: (i % 2 === 0 ? -1 : 1) * 8 });
      }
      strokeJ(ctx, pts, J, { lw: 6, color: P.line, double: true });
    } else if (style === 'wavy') {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        pts.push({ x: -w / 2 + (i / 10) * w, y: Math.sin(i * 1.4) * 7 });
      }
      strokeJ(ctx, pts, J, { lw: 6, color: P.line });
    } else if (style === 'o') {
      const pts = ellPts(0, 0, w * 0.16, w * 0.2, 10);
      ctx.fillStyle = '#40232a';
      jPath(ctx, pts, J, true); ctx.fill();
      strokeJ(ctx, pts, J, { close: true, lw: 5, color: P.line });
    } else if (style === 'frown') {
      strokeJ(ctx, [
        { x: -w / 2, y: 8 }, { x: -w * 0.2, y: -6 }, { x: w * 0.25, y: -7 }, { x: w / 2, y: 9 },
      ], J, { lw: 6.5, color: P.line, double: true });
    } else if (style === 'stitch') {
      strokeJ(ctx, [{ x: -w / 2, y: 0 }, { x: w / 2, y: 3 }], J, { lw: 5.5, color: P.line });
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + ((i + 0.5) / n) * w;
        strokeJ(ctx, [{ x, y: -8 }, { x: x + 3, y: 10 }], J, { lw: 3.5, color: P.line });
      }
    } else if (style === 'grin' || style === 'w') {
      // 香蕉大咧嘴 + 歪牙
      const top = [], bot = [];
      const n = 8;
      for (let i = 0; i <= n; i++) {
        const p = i / n, x = -w / 2 + p * w;
        top.push({ x, y: Math.sin(p * Math.PI) * -6 });
        bot.push({ x: w / 2 - p * w, y: Math.sin((1 - p) * Math.PI) * w * 0.3 });
      }
      const pts = top.concat(bot);
      ctx.fillStyle = '#fdfdf2';
      jPath(ctx, pts, J, true); ctx.fill();
      strokeJ(ctx, pts, J, { close: true, lw: 6, color: P.line, double: av.doubleStroke });
      const teethN = S.teethN || 5;
      for (let i = 1; i < teethN; i++) {
        const x = -w / 2 + (i / teethN) * w;
        const h = Math.sin((i / teethN) * Math.PI) * w * 0.26;
        strokeJ(ctx, [{ x, y: -2 }, { x: x + J.n(1.5), y: h }], J, { lw: 4, color: P.line });
      }
      if (S.missTooth) {
        for (let k = 0; k < S.missTooth; k++) {
          const i = 1 + ((k * 2 + 1) % (teethN - 1));
          const x0 = -w / 2 + (i / teethN) * w - w / teethN / 2;
          const h = Math.sin((i / teethN) * Math.PI) * w * 0.22;
          ctx.fillStyle = '#40232a';
          jPath(ctx, [
            { x: x0 - w / teethN * 0.4, y: 0 }, { x: x0 + w / teethN * 0.4, y: 0 },
            { x: x0 + w / teethN * 0.3, y: h }, { x: x0 - w / teethN * 0.3, y: h },
          ], J, true);
          ctx.fill();
        }
      }
      if (S.goldTooth) {
        const x0 = -w / 2 + (1.5 / teethN) * w;
        const h = Math.sin((1.5 / teethN) * Math.PI) * w * 0.22;
        ctx.fillStyle = '#f2c14e';
        jPath(ctx, [
          { x: x0 - w / teethN * 0.35, y: 1 }, { x: x0 + w / teethN * 0.35, y: 1 },
          { x: x0 + w / teethN * 0.28, y: h }, { x: x0 - w / teethN * 0.28, y: h },
        ], J, true);
        ctx.fill();
      }
    } else if (style === 'scream') {
      const pts = ellPts(0, 6, w * 0.32, w * 0.4, 12, 0, [0.1, -0.08, 0.14, -0.05, 0.08, -0.12]);
      ctx.fillStyle = '#40232a';
      jPath(ctx, pts, J, true); ctx.fill();
      strokeJ(ctx, pts, J, { close: true, lw: 6, color: P.line });
      // 乱舞的舌头
      const tip = Math.sin(A.t * 3.4 + av.anim.phase) * 9;
      jPath(ctx, pts, J, true);
      ctx.save(); ctx.clip();
      const ty = 6 + w * 0.14;
      ctx.fillStyle = '#e86a7c';
      jPath(ctx, [
        { x: -w * 0.2, y: ty + w * 0.3 },
        { x: -w * 0.18, y: ty },
        { x: tip * 0.4, y: ty - 6 },
        { x: w * 0.18 + tip * 0.3, y: ty + 2 },
        { x: w * 0.22, y: ty + w * 0.3 },
      ], J, true);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- 混乱元素 ---------- */
  function drawChaos(ctx, av, J, A) {
    const C = av.chaos, P = av.palette;
    if (C.bandaid) {
      ctx.save();
      ctx.translate(C.bandaid.x, C.bandaid.y);
      ctx.rotate(C.bandaid.rot);
      const pts = [{ x: -26, y: -9 }, { x: 26, y: -9 }, { x: 26, y: 9 }, { x: -26, y: 9 }];
      ctx.fillStyle = '#f2d8b8';
      jPath(ctx, pts, J, true); ctx.fill();
      strokeJ(ctx, pts, J, { close: true, lw: 3.5, color: P.line });
      const pad = [{ x: -8, y: -6 }, { x: 8, y: -6 }, { x: 8, y: 6 }, { x: -8, y: 6 }];
      ctx.fillStyle = '#e0bd94';
      jPath(ctx, pad, J, true); ctx.fill();
      for (const sx of [-18, 18]) for (const sy of [-4, 4]) dotScribble(ctx, J, sx, sy, 1.4, P.line);
      ctx.restore();
    }
    if (C.stitch) {
      ctx.save();
      ctx.translate(C.stitch.x, C.stitch.y);
      ctx.rotate(C.stitch.rot);
      strokeJ(ctx, [{ x: -C.stitch.len / 2, y: 0 }, { x: C.stitch.len / 2, y: 2 }], J, { lw: 4, color: P.line });
      const n = 4;
      for (let i = 0; i < n; i++) {
        const x = -C.stitch.len / 2 + ((i + 0.5) / n) * C.stitch.len;
        strokeJ(ctx, [{ x, y: -7 }, { x: x + 2, y: 8 }], J, { lw: 3, color: P.line });
      }
      ctx.restore();
    }
    for (const st of C.stickers) {
      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.rotate(st.rot + Math.sin(A.t + st.s) * 0.06);
      if (st.type === 'tri') {
        const pts = [{ x: 0, y: -st.s }, { x: st.s * 0.9, y: st.s * 0.7 }, { x: -st.s * 0.9, y: st.s * 0.7 }];
        ctx.fillStyle = st.color;
        jPath(ctx, pts, J, true); ctx.fill();
        strokeJ(ctx, pts, J, { close: true, lw: 3.5, color: P.line });
      } else if (st.type === 'star') {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const rr2 = i % 2 === 0 ? st.s : st.s * 0.45;
          const a = (i / 10) * TAU - Math.PI / 2;
          pts.push({ x: Math.cos(a) * rr2, y: Math.sin(a) * rr2 });
        }
        ctx.fillStyle = st.color;
        jPath(ctx, pts, J, true); ctx.fill();
        strokeJ(ctx, pts, J, { close: true, lw: 3, color: P.line });
      } else if (st.type === 'ring') {
        strokeJ(ctx, ellPts(0, 0, st.s * 0.8, st.s * 0.8, 12), J, { close: true, lw: 5, color: st.color });
      } else {
        strokeJ(ctx, [{ x: -st.s * 0.7, y: -st.s * 0.7 }, { x: st.s * 0.7, y: st.s * 0.7 }], J, { lw: 5, color: st.color });
        strokeJ(ctx, [{ x: st.s * 0.7, y: -st.s * 0.7 }, { x: -st.s * 0.7, y: st.s * 0.7 }], J, { lw: 5, color: st.color });
      }
      ctx.restore();
    }
    if (C.sweat) {
      const p = ((A.t * 0.22 + av.anim.phase) % 1 + 1) % 1;
      const x = C.sweatSide * av.headRx * 0.78;
      const y = -av.headRy * 0.5 + p * av.headRy * 1.1;
      ctx.save();
      ctx.globalAlpha = clamp(1.2 - p * 1.3, 0, 1);
      const pts = [
        { x, y: y - 10 }, { x: x + 7, y: y + 4 }, { x, y: y + 10 }, { x: x - 7, y: y + 4 },
      ];
      ctx.fillStyle = '#9ed4e8';
      jPath(ctx, pts, J, true); ctx.fill();
      strokeJ(ctx, pts, J, { close: true, lw: 3, color: '#4a90aa' });
      ctx.restore();
    }
    if (C.stink) {
      for (let i = -1; i <= 1; i++) {
        const x = i * 46;
        const drift = ((A.t * 26 + i * 23) % 56);
        ctx.save();
        ctx.globalAlpha = clamp(1 - drift / 56, 0.15, 0.8);
        const y0 = -av.headRy - 14 - drift;
        strokeJ(ctx, [
          { x: x - 6, y: y0 }, { x: x + 6, y: y0 - 12 }, { x: x - 6, y: y0 - 24 }, { x: x + 6, y: y0 - 36 },
        ], J, { lw: 4, color: '#7a9455' });
        ctx.restore();
      }
    }
    if (C.graffiti) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      const rw = mulberry32(av.seed ^ 0x5f5f);
      const pts = [];
      let px = -av.headRx * 0.7, py = -20;
      for (let i = 0; i < 8; i++) {
        pts.push({ x: px, y: py });
        px += av.headRx * 0.2;
        py = (rw() * 2 - 1) * av.headRy * 0.5;
      }
      strokeJ(ctx, pts, J, { lw: 5, color: P.acc1 });
      ctx.restore();
    }
    // 苍蝇最后画（最上层）
    if (C.flies) {
      const O = C.flyOrbit;
      for (let i = 0; i < C.flies; i++) {
        const sp = O.sp * (1 + i * 0.3);
        const a = A.t * sp + O.ph + i * 2.2;
        const fx = O.x + Math.cos(a) * O.r + J.n(1.5);
        const fy = O.y + Math.sin(a * 1.3) * O.r * 0.5 + J.n(1.5);
        dotScribble(ctx, J, fx, fy, 4.6, P.line);
        strokeJ(ctx, [{ x: fx - 9, y: fy - 8 }, { x: fx - 2, y: fy - 2 }], J, { lw: 2.6, color: P.line });
        strokeJ(ctx, [{ x: fx + 9, y: fy - 8 }, { x: fx + 2, y: fy - 2 }], J, { lw: 2.6, color: P.line });
      }
    }
  }

  /* ==========================================================
     各物种绘制
     ========================================================== */
  const DRAW2 = {
    /* ---------- 人类 ---------- */
    human(ctx, av, J, A) {
      const P = av.palette, S = av.spec;
      // 耳朵（两只大小不一）
      for (const side of [-1, 1]) {
        const r = side < 0 ? S.earL : S.earR;
        const pts = ellPts(side * av.headRx * 0.96, 8, r, r * 1.3, 10);
        shapeMessy(ctx, av, J, pts, P.head, { fillMode: 'solid', lw: 4.5 });
      }
      drawHead(ctx, av, J, A.t);
      // 头发
      const hc = S.hairC;
      if (S.hair === 'mess') {
        const rw = mulberry32(av.seed ^ 0xabc);
        for (let i = 0; i < S.hairN; i++) {
          const x0 = (rw() * 2 - 1) * av.headRx * 0.75;
          const y0 = -av.headRy * (0.72 + rw() * 0.3);
          const pts = [];
          let px = x0, py = y0;
          for (let k = 0; k < 5; k++) {
            pts.push({ x: px, y: py });
            px += (rw() * 2 - 1) * 26;
            py -= rw() * 22;
          }
          strokeJ(ctx, pts, J, { lw: 4.5, color: hc });
        }
      } else if (S.hair === 'antenna') {
        for (let i = 0; i < 3; i++) {
          const x0 = (i - 1) * 26;
          const sway = Math.sin(A.t * 2 + i) * 5;
          strokeJ(ctx, [
            { x: x0, y: -av.headRy * 0.9 },
            { x: x0 + sway, y: -av.headRy * 1.25 },
            { x: x0 + sway + 14, y: -av.headRy * 1.3 },
          ], J, { lw: 4.5, color: hc });
        }
      } else if (S.hair === 'balding') {
        for (const side of [-1, 1]) {
          for (let i = 0; i < 5; i++) {
            const y0 = -av.headRy * 0.35 + i * 12;
            strokeJ(ctx, [
              { x: side * av.headRx * 0.85, y: y0 },
              { x: side * (av.headRx * 0.85 + 22), y: y0 + 8 },
            ], J, { lw: 4, color: hc });
          }
        }
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.25 * Math.sin(A.t * 3);
        dotScribble(ctx, J, -av.headRx * 0.25, -av.headRy * 0.6, 12, '#ffffff');
        ctx.restore();
      } else if (S.hair === 'fringe') {
        for (let i = 0; i < 7; i++) {
          const x0 = -av.headRx * 0.7 + (i / 6) * av.headRx * 1.4;
          strokeJ(ctx, [
            { x: x0, y: -av.headRy * 0.95 },
            { x: x0 + J.n(3), y: -av.headRy * 0.55 + (i % 2) * 14 },
          ], J, { lw: 6, color: hc });
        }
      }
      // 鼻子
      ctx.save();
      ctx.translate(S.noseDx, 12);
      if (S.nose === 'droop') {
        ctx.rotate(Math.sin(A.t * 1.5 + av.anim.phase) * 0.09);
        const L = S.noseLen, W = S.noseW;
        const pts = [
          { x: -W * 0.4, y: -4 }, { x: -W * 0.55, y: L * 0.6 }, { x: 0, y: L },
          { x: W * 0.55, y: L * 0.62 }, { x: W * 0.4, y: -4 },
        ];
        shapeMessy(ctx, av, J, pts, P.head === '#f2ede2' ? '#e0cdb4' : P.head, { fillMode: 'solid', lw: 5 });
        dotScribble(ctx, J, -W * 0.2, L * 0.75, 2.2, P.line);
        dotScribble(ctx, J, W * 0.2, L * 0.78, 2.2, P.line);
      } else if (S.nose === 'ball') {
        const pts = ellPts(0, 10, S.noseW, S.noseW * 0.9, 10);
        shapeMessy(ctx, av, J, pts, P.acc2, { fillMode: 'solid', lw: 5 });
      } else if (S.nose === 'tri') {
        const pts = [{ x: 0, y: -8 }, { x: -S.noseW, y: 16 }, { x: S.noseW, y: 16 }];
        shapeMessy(ctx, av, J, pts, null, { lw: 5 });
      } else {
        dotScribble(ctx, J, -7, 12, 3, P.line);
        dotScribble(ctx, J, 7, 12, 3, P.line);
      }
      ctx.restore();
      // 嘴 + 胡渣
      drawMouth2(ctx, av, J, A, S);
      if (S.stubble) {
        const rw = mulberry32(av.seed ^ 0x77);
        for (let i = 0; i < 14; i++) {
          const x = S.mouthDx + (rw() * 2 - 1) * 60;
          const y = S.mouthDy + 14 + rw() * 30;
          strokeJ(ctx, [{ x, y }, { x: x + 4, y: y + 5 }], J, { lw: 2.2, color: P.line });
        }
      }
      if (S.mole) {
        const mx = S.mole.x * av.headRx, my = S.mole.y * av.headRy;
        dotScribble(ctx, J, mx, my, 4, P.line);
        strokeJ(ctx, [{ x: mx, y: my }, { x: mx + 6, y: my - 8 }], J, { lw: 1.8, color: P.line });
        strokeJ(ctx, [{ x: mx + 2, y: my }, { x: mx + 9, y: my - 4 }], J, { lw: 1.8, color: P.line });
      }
      drawEyes2(ctx, av, J, A);
      if (S.glasses) {
        const E = av.eyes;
        const gl = (x, r) => strokeJ(ctx, ellPts(x, E.L.dy + 2, r, r * 0.9, 12), J, { close: true, lw: 4.5, color: P.acc1 });
        if (E.cyclops) gl(0, E.L.size + 12);
        else {
          gl(-E.ex * E.L.dxk, E.L.size + 10);
          gl(E.ex * E.Rt.dxk, E.Rt.size + 6);
          strokeJ(ctx, [
            { x: -E.ex * E.L.dxk + E.L.size + 10, y: E.L.dy },
            { x: E.ex * E.Rt.dxk - E.Rt.size - 6, y: E.Rt.dy - 6 },
          ], J, { lw: 4, color: P.acc1 });
        }
      }
      drawBrows2(ctx, av, J, A);
      drawBlush2(ctx, av, J);
    },

    /* ---------- 牛牛 ---------- */
    cow(ctx, av, J, A) {
      const P = av.palette, S = av.spec;
      // 两只完全不对称的角
      for (const side of [-1, 1]) {
        const H = side < 0 ? S.hornL : S.hornR;
        const bx = side * av.headRx * 0.55, by = -av.headRy * 0.62;
        const dir = -Math.PI / 2 + side * H.ang;
        const tx = bx + Math.cos(dir) * H.len, ty = by + Math.sin(dir) * H.len;
        const px = Math.cos(dir + Math.PI / 2), py = Math.sin(dir + Math.PI / 2);
        const cx = (bx + tx) / 2 + px * H.curve * side, cy = (by + ty) / 2 + py * H.curve * side;
        const outer = qSample({ x: bx - px * H.w * side, y: by - py * H.w * side }, { x: cx - px * H.w * 0.4 * side, y: cy - py * H.w * 0.4 * side }, { x: tx, y: ty }, 6);
        const inner = qSample({ x: tx, y: ty }, { x: cx + px * H.w * 0.4 * side, y: cy + py * H.w * 0.4 * side }, { x: bx + px * H.w * side, y: by + py * H.w * side }, 6);
        shapeMessy(ctx, av, J, outer.concat(inner), S.hornC, { lw: av.lw * 0.85 });
      }
      // 耷拉耳
      for (const side of [-1, 1]) {
        const E2 = side < 0 ? S.earL : S.earR;
        ctx.save();
        ctx.translate(side * av.headRx * 0.92, -av.headRy * 0.18);
        ctx.rotate(side * E2.droop + Math.sin(A.t * 1.6 + side) * 0.05);
        const pts = [
          { x: 0, y: -E2.w / 2 },
          { x: side * E2.len * 0.55, y: -E2.w * 0.6 },
          { x: side * E2.len, y: 0 },
          { x: side * E2.len * 0.55, y: E2.w * 0.6 },
          { x: 0, y: E2.w / 2 },
        ];
        shapeMessy(ctx, av, J, pts, P.head, { lw: av.lw * 0.8 });
        dotScribble(ctx, J, side * E2.len * 0.55, 0, E2.w * 0.24, '#e8a0a8');
        ctx.restore();
      }
      drawHead(ctx, av, J, A.t);
      // 额发
      if (S.tuft) {
        for (let i = -1; i <= 1; i++) {
          strokeJ(ctx, [
            { x: i * 16, y: -av.headRy * 0.92 },
            { x: i * 24 + Math.sin(A.t * 2 + i) * 4, y: -av.headRy * 1.1 },
          ], J, { lw: 5, color: P.line });
        }
      }
      // 巨型歪嘴（咀嚼研磨）
      const chT = A.t * S.chewSpeed * 2;
      const chewOn = smooth(Math.sin(A.t * 0.4 + av.anim.phase) * 2.2 + 0.4);
      const chX = Math.cos(chT) * 4.5 * chewOn;
      const chY = Math.sin(chT * 2) * 3.2 * chewOn;
      const jaw = Math.sin(chT) * 7 * chewOn;
      ctx.save();
      ctx.translate(S.mdx + chX, av.headRy * S.muzY + chY);
      ctx.rotate(S.mrot);
      const muzPts = ellPts(0, 0, S.mrx, S.mry, 16, 0, [0.06, -0.05, 0.09, -0.04, 0.05, -0.08, 0.07, -0.03]);
      shapeMessy(ctx, av, J, muzPts, S.muzzleC);
      // 大鼻孔（一大一小）
      const n1 = ellPts(-S.mrx * 0.42, -S.mry * 0.3, 9, 14, 8, 0.4);
      const n2 = ellPts(S.mrx * 0.4, -S.mry * 0.26, 12, 17, 8, -0.5);
      ctx.fillStyle = '#6b5e70';
      jPath(ctx, n1, J, true); ctx.fill();
      jPath(ctx, n2, J, true); ctx.fill();
      strokeJ(ctx, n2, J, { close: true, lw: 3, color: P.line });
      // 上唇缝（粗涂两遍）
      const lipY = S.mry * 0.14;
      strokeJ(ctx, [
        { x: -S.mrx * 0.74, y: lipY - 8 },
        { x: -S.mrx * 0.3, y: lipY + 12 },
        { x: 0, y: lipY + 2 },
        { x: S.mrx * 0.32, y: lipY + 13 },
        { x: S.mrx * 0.72, y: lipY - 10 },
      ], J, { lw: 7, color: '#6b5e70', double: true });
      strokeJ(ctx, [{ x: 0, y: lipY - S.mry * 0.32 }, { x: 2, y: lipY + 2 }], J, { lw: 5, color: '#6b5e70' });
      // 大下唇（随咀嚼晃）
      strokeJ(ctx, [
        { x: -S.mrx * 0.55, y: lipY + S.mry * 0.38 },
        { x: 0, y: lipY + S.mry * 0.72 + jaw },
        { x: S.mrx * 0.55, y: lipY + S.mry * 0.36 },
      ], J, { lw: 8, color: '#6b5e70', double: true });
      // 下巴胡渣
      if (S.stubbleChin) {
        for (let i = 0; i < 6; i++) {
          const x = -30 + i * 12;
          strokeJ(ctx, [{ x, y: S.mry * 0.82 }, { x: x + 3, y: S.mry * 0.95 }], J, { lw: 2.5, color: P.line });
        }
      }
      // 吃草
      if (S.straw) {
        ctx.save();
        ctx.translate(-S.mrx * 0.42, lipY + 8);
        ctx.rotate(-0.5 + Math.sin(A.t * 1.8) * 0.08 + jaw * 0.015);
        strokeJ(ctx, [{ x: 0, y: 0 }, { x: -22, y: -20 }, { x: -40, y: -34 }], J, { lw: 4.5, color: '#3f8f3a' });
        strokeJ(ctx, [{ x: -18, y: -16 }, { x: -36, y: -18 }], J, { lw: 4, color: '#3f8f3a' });
        ctx.restore();
      }
      // 流口水
      if (S.drool) {
        const dl = 16 + Math.sin(A.t * 0.9 + av.anim.phase) * 9;
        ctx.save();
        ctx.globalAlpha = 0.85;
        strokeJ(ctx, [
          { x: S.mrx * 0.5, y: lipY + S.mry * 0.4 },
          { x: S.mrx * 0.54, y: lipY + S.mry * 0.4 + dl },
        ], J, { lw: 5, color: '#9ed4e8' });
        dotScribble(ctx, J, S.mrx * 0.54, lipY + S.mry * 0.4 + dl + 4, 4.5, '#9ed4e8');
        ctx.restore();
      }
      ctx.restore();
      drawEyes2(ctx, av, J, A);
      drawBrows2(ctx, av, J, A);
      drawBlush2(ctx, av, J);
    },

    /* ---------- 小猫 ---------- */
    cat(ctx, av, J, A) {
      const P = av.palette, S = av.spec;
      // 两只不一样的耳朵
      for (const side of [-1, 1]) {
        const E2 = side < 0 ? S.earL : S.earR;
        ctx.save();
        ctx.translate(side * av.headRx * 0.58, -av.headRy * 0.68);
        ctx.rotate(E2.rot + Math.sin(A.t * 1.8 + side * 2) * 0.04);
        let tipX = 0, tipY = -E2.h;
        if (E2.bent) { tipX = side * E2.w * 0.9; tipY = -E2.h * 0.7; }
        const pts = [
          { x: -E2.w / 2, y: 0 },
          { x: -E2.w * 0.2, y: -E2.h * 0.6 },
          { x: tipX, y: tipY },
          { x: E2.w * 0.3, y: -E2.h * 0.5 },
          { x: E2.w / 2, y: 0 },
        ];
        shapeMessy(ctx, av, J, pts, P.head, { lw: av.lw * 0.85 });
        const ipts = [
          { x: -E2.w * 0.2, y: -E2.h * 0.08 },
          { x: tipX * 0.7, y: tipY * 0.62 },
          { x: E2.w * 0.24, y: -E2.h * 0.08 },
        ];
        ctx.fillStyle = S.inner;
        jPath(ctx, ipts, J, true); ctx.fill();
        ctx.restore();
      }
      drawHead(ctx, av, J, A.t);
      // 乱条纹
      if (S.stripes) {
        for (let i = 0; i < S.stripes; i++) {
          const x0 = (i - (S.stripes - 1) / 2) * 30;
          strokeJ(ctx, [
            { x: x0, y: -av.headRy * 0.95 },
            { x: x0 + J.n(4), y: -av.headRy * 0.55 },
          ], J, { lw: 7, color: P.acc2 });
        }
      }
      // 鼻子
      const ny = S.noseY;
      const npts = [{ x: S.noseDx - 9, y: ny }, { x: S.noseDx + 9, y: ny }, { x: S.noseDx, y: ny + 12 }];
      ctx.fillStyle = '#e8798a';
      jPath(ctx, npts, J, true); ctx.fill();
      strokeJ(ctx, npts, J, { close: true, lw: 4, color: P.line });
      // 嘴
      if (S.mouth === 'w') {
        strokeJ(ctx, [{ x: S.noseDx, y: ny + 12 }, { x: S.noseDx + 2, y: ny + 24 }], J, { lw: 5, color: P.line });
        strokeJ(ctx, [
          { x: S.noseDx - 22, y: ny + 22 }, { x: S.noseDx - 10, y: ny + 32 },
          { x: S.noseDx + 2, y: ny + 24 }, { x: S.noseDx + 14, y: ny + 34 }, { x: S.noseDx + 25, y: ny + 23 },
        ], J, { lw: 5.5, color: P.line, double: av.doubleStroke });
      } else {
        drawMouth2(ctx, av, J, A, {
          mouth: S.mouth, mouthW: S.mouthW, mouthDx: S.noseDx, mouthDy: ny + 34, mouthRot: 0,
          teethN: S.teethN, missTooth: S.missTooth, goldTooth: S.goldTooth,
        });
      }
      if (S.fang) {
        const fpts = [{ x: S.noseDx + 14, y: ny + 26 }, { x: S.noseDx + 19, y: ny + 42 }, { x: S.noseDx + 26, y: ny + 25 }];
        ctx.fillStyle = '#fdfdf2';
        jPath(ctx, fpts, J, true); ctx.fill();
        strokeJ(ctx, fpts, J, { close: true, lw: 3, color: P.line });
      }
      if (S.tongue) {
        const tpts = ellPts(S.noseDx - 6, ny + 44, 9, 13, 8);
        ctx.fillStyle = '#e86a7c';
        jPath(ctx, tpts, J, true); ctx.fill();
        strokeJ(ctx, tpts, J, { close: true, lw: 3, color: P.line });
      }
      // 乱胡须（长短角度全随机）
      for (const wk of S.whiskers) {
        const x0 = wk.side * av.headRx * 0.6;
        const sway = Math.sin(A.t * 2 + wk.len) * 2.5;
        strokeJ(ctx, [
          { x: x0, y: wk.y },
          { x: x0 + wk.side * wk.len * 0.55, y: wk.y + wk.kink + sway },
          { x: x0 + wk.side * wk.len, y: wk.y + wk.ang * 60 + sway },
        ], J, { lw: 3.2, color: P.line });
      }
      drawEyes2(ctx, av, J, A);
      drawBrows2(ctx, av, J, A);
      drawBlush2(ctx, av, J);
    },

    /* ---------- 小鸟 ---------- */
    bird(ctx, av, J, A) {
      const P = av.palette, S = av.spec;
      drawHead(ctx, av, J, A.t);
      // 鸡冠涂鸦
      for (let i = 0; i < S.comb; i++) {
        const k = i - (S.comb - 1) / 2;
        const sway = Math.sin(A.t * 2.4 + i) * 4;
        strokeJ(ctx, [
          { x: k * 18, y: -av.headRy * 0.9 },
          { x: k * 30 + sway, y: -av.headRy * 1.22 },
          { x: k * 38 + sway, y: -av.headRy * 1.05 },
        ], J, { lw: 6, color: S.combC });
      }
      // 领口锯齿
      if (S.collar) {
        const pts = [];
        for (let i = 0; i <= 6; i++) {
          pts.push({ x: -60 + i * 20, y: av.headRy * 0.86 + (i % 2 === 0 ? 0 : 16) });
        }
        strokeJ(ctx, pts, J, { lw: 5, color: P.acc1 });
      }
      // 歪嘴壳（上下不对齐）
      const open = pulse(A.t + av.anim.phase, S.chirpInt, 1.2);
      ctx.save();
      ctx.translate(S.bdx, S.by);
      ctx.rotate(S.brot);
      const low = [
        { x: -S.bw * 0.36 + 6, y: 6 },
        { x: 4, y: 8 + S.bh * (0.42 + open * 0.75) },
        { x: S.bw * 0.42 + 6, y: 5 },
      ];
      shapeMessy(ctx, av, J, low, '#d98f2b', { fillMode: 'solid', lw: 4.5 });
      const up = [
        { x: -S.bw / 2, y: 2 - open * 5 },
        { x: 0, y: -S.bh * (0.9 + open * 0.3) },
        { x: S.bw / 2, y: 0 - open * 5 },
      ];
      shapeMessy(ctx, av, J, up, S.beakC, { fillMode: 'solid', lw: 4.5 });
      // 叼虫子
      if (S.worm) {
        ctx.save();
        ctx.translate(S.bw * 0.3, 10);
        ctx.rotate(Math.sin(A.t * 2.2) * 0.18);
        const wpts = [];
        for (let i = 0; i < 6; i++) wpts.push({ x: i * 9, y: Math.sin(i * 1.7 + A.t * 3) * 6 + i * 7 });
        strokeJ(ctx, wpts, J, { lw: 5, color: '#e88bb1' });
        dotScribble(ctx, J, 5 * 9, Math.sin(5 * 1.7 + A.t * 3) * 6 + 35, 3, P.line);
        ctx.restore();
      }
      ctx.restore();
      // 唱歌音符（画得很歪）
      if (open > 0.08) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, open * 1.5);
        ctx.translate(96 + open * 10, -70 - open * 46);
        ctx.rotate(0.3);
        dotScribble(ctx, J, 0, 8, 6, P.acc1);
        strokeJ(ctx, [{ x: 5, y: 7 }, { x: 6, y: -14 }, { x: 16, y: -8 }], J, { lw: 4, color: P.acc1 });
        ctx.restore();
      }
      drawEyes2(ctx, av, J, A);
      drawBrows2(ctx, av, J, A);
      drawBlush2(ctx, av, J);
    },
  };

  /* ==========================================================
     主渲染入口
     ========================================================== */
  function renderAvatar(ctx, av, t, size, opts = {}) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const u = size / 512;
    ctx.scale(u, u);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const J = makeJ(av, t);
    const a = av.anim;
    const A = {
      t,
      lookX: (Math.sin(t * 0.35 + a.lookP1) * 0.6 + Math.sin(t * 0.1 + a.lookP2) * 0.4) * a.lookAmp,
      lookY: Math.sin(t * 0.24 + a.lookP2) * a.lookAmp * 0.4,
    };
    if (!opts.transparent) {
      ctx.fillStyle = opts.bgColor || av.palette.bg;
      ctx.fillRect(-2, -2, 516, 516);
      drawBgStuff(ctx, av, J, t);
    }
    const bob = Math.sin(t * a.bobSpeed) * a.bobAmp;
    const sq = Math.sin(t * a.bobSpeed * 2) * a.squash;
    ctx.translate(256, av.headCy + bob);
    ctx.rotate(av.baseRot + Math.sin(t * a.tiltSpeed + 1) * a.tiltAmp);
    const pop = popScale(av.bornT != null ? t - av.bornT : null);
    ctx.scale(pop * (1 + sq), pop * (1 - sq));
    drawNeck(ctx, av, J);
    DRAW2[av.species](ctx, av, J, A);
    drawChaos(ctx, av, J, A);
    ctx.restore();
  }

  window.AvatarKit2 = { SPECIES, BG: BG2, generateAvatar, renderAvatar };
})();


// 引擎本体是零依赖 IIFE（挂载到 window.AvatarKit2），转成 ES Module 导出供 Vue 组件使用
export const AvatarKit2 = window.AvatarKit2;

