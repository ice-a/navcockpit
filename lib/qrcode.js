// 零依赖 QR 码编码器（QR Code Model 2，字节模式，纠错等级可选）。
// 只做「编码」这一件事：给一串文本（URL）输出模块矩阵，由调用方画到 canvas / SVG 上。
// 支持版本 1-10（纠错等级 M 下最多 213 字节，足够放分享链接）。
//
// 为什么不引第三方库：分享海报只需要「文本 → 矩阵」，一个 qrcode npm 包会带进
// pngjs / yargs 等一堆 CLI 依赖，体积不划算。

const MIN_VERSION = 1;
const MAX_VERSION = 10;

// 格式信息里的纠错等级位（不是下标）
const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

// 每块纠错码字数：ECC_PER_BLOCK[等级][版本]
const ECC_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};

// 纠错块数：NUM_BLOCKS[等级][版本]
const NUM_BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

// ============ GF(256) 有限域（本原多项式 0x11D） ============
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** 生成 RS 除式：(x - 2^0)(x - 2^1)...(x - 2^(degree-1)) */
function rsDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** 计算 data 的 RS 余数（即纠错码字） */
function rsRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

// ============ 矩阵尺寸相关 ============
/** 该版本可用于数据的模块数（bit） */
function numRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

/** 该版本 + 纠错等级下，真正能放用户数据的码字数 */
function numDataCodewords(ver, ecl) {
  return (
    Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver]
  );
}

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

const getBit = (x, i) => ((x >>> i) & 1) !== 0;

// ============ 主入口 ============
/**
 * 把文本编码成 QR 模块矩阵。
 * @param {string} text 待编码内容（会按 UTF-8 处理）
 * @param {'L'|'M'|'Q'|'H'} ecl 纠错等级，默认 M
 * @returns {{size:number, version:number, ecl:string, modules:Uint8Array, get:(x:number,y:number)=>boolean}}
 */
export function qrEncode(text, ecl = 'M') {
  const bytes = new TextEncoder().encode(String(text));
  if (!(ecl in FORMAT_BITS)) ecl = 'M';

  // 选最小可用版本
  let version = 0;
  for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
    const countBits = v <= 9 ? 8 : 16;
    const used = 4 + countBits + bytes.length * 8;
    if (used <= numDataCodewords(v, ecl) * 8) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error('内容过长，超出 QR 版本 10 的容量');

  const size = version * 4 + 17;
  const modules = new Uint8Array(size * size);
  const isFunc = new Uint8Array(size * size);
  const set = (x, y, dark) => {
    modules[y * size + x] = dark ? 1 : 0;
    isFunc[y * size + x] = 1;
  };
  // ---- 定位 / 校正 / 时序图形 ----
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const drawFinder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  const pos = alignmentPositions(version);
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === pos.length - 1) ||
        (i === pos.length - 1 && j === 0);
      if (corner) continue;
      const cx = pos[i];
      const cy = pos[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // ---- 预留格式信息区（两组各 15 位 + 固定黑模块）----
  // 这一步必须在填数据之前做：这些格子属于功能图形，数据要绕开它们。
  for (let i = 0; i <= 5; i++) set(8, i, false);
  set(8, 7, false);
  set(8, 8, false);
  set(7, 8, false);
  for (let i = 9; i < 15; i++) set(14 - i, 8, false);
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, false);
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, false);
  set(8, size - 8, true); // 固定黑模块

  // ---- 版本信息（版本 >= 7 才有）----
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }

  // ---- 数据码流：模式 + 长度 + 数据 + 终止符 + 填充 ----
  const bb = [];
  const appendBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  };
  appendBits(0b0100, 4); // 字节模式
  appendBits(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) appendBits(b, 8);

  const capacityBits = numDataCodewords(version, ecl) * 8;
  appendBits(0, Math.min(4, capacityBits - bb.length));
  appendBits(0, (8 - (bb.length % 8)) % 8);
  for (let pad = 0xec; bb.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8);

  const data = new Uint8Array(bb.length / 8);
  bb.forEach((bit, i) => {
    data[i >>> 3] |= bit << (7 - (i & 7));
  });

  // ---- 分块 + RS 纠错 + 交织 ----
  const numBlocks = NUM_BLOCKS[ecl][version];
  const eccLen = ECC_PER_BLOCK[ecl][version];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShort = numBlocks - (rawCodewords % numBlocks);
  const shortLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(eccLen);

  const blocks = [];
  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    const len = shortLen - eccLen + (i < numShort ? 0 : 1);
    const dat = data.subarray(k, k + len);
    k += len;
    const ecc = rsRemainder(dat, divisor);
    const blk = Array.from(dat);
    if (i < numShort) blk.push(0); // 短块补一个占位，交织时跳过
    for (const e of ecc) blk.push(e);
    blocks.push(blk);
  }

  const final = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      if (i !== shortLen - eccLen || j >= numShort) final.push(blocks[j][i]);
    }
  }

  // ---- 按 Z 字形填入矩阵 ----
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (isFunc[y * size + x]) continue;
        let dark = false;
        if (bitIndex < final.length * 8) {
          dark = getBit(final[bitIndex >>> 3], 7 - (bitIndex & 7));
          bitIndex++;
        }
        modules[y * size + x] = dark ? 1 : 0;
      }
    }
  }

  // ---- 掩码择优 ----
  const maskAt = (mask, x, y) => {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  };

  let bestMask = 0;
  let bestScore = Infinity;
  let bestModules = null;
  for (let mask = 0; mask < 8; mask++) {
    const trial = Uint8Array.from(modules);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!isFunc[y * size + x] && maskAt(mask, x, y)) {
          trial[y * size + x] ^= 1;
        }
      }
    }
    drawFormat(trial, mask);
    const score = penalty(trial, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      bestModules = trial;
    }
  }

  // 覆盖回最终矩阵（含格式信息）
  modules.set(bestModules);
  return {
    size,
    version,
    ecl,
    modules,
    get: (x, y) => bestModules[y * size + x] === 1,
  };

  function drawFormat(target, mask) {
    const dataBits = (FORMAT_BITS[ecl] << 3) | mask;
    let rem = dataBits;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((dataBits << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) setF(target, 8, i, getBit(bits, i));
    setF(target, 8, 7, getBit(bits, 6));
    setF(target, 8, 8, getBit(bits, 7));
    setF(target, 7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setF(target, 14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i++) setF(target, size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setF(target, 8, size - 15 + i, getBit(bits, i));
    setF(target, 8, size - 8, true); // 固定黑模块
  }

  function setF(target, x, y, dark) {
    target[y * size + x] = dark ? 1 : 0;
  }
}

// ============ 掩码惩罚评分（越分越低越好） ============
function finderPenaltyCount(runHistory) {
  const n = runHistory[1];
  const core =
    n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
  return (
    (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
    (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0)
  );
}

function finderPenaltyAdd(runLength, runHistory, size) {
  if (runHistory[0] === 0) runLength += size; // 首段补上外侧空白
  runHistory.pop();
  runHistory.unshift(runLength);
}

function penalty(m, size) {
  let result = 0;

  const scan = (horizontal) => {
    for (let a = 0; a < size; a++) {
      let runColor = false;
      let runLen = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let b = 0; b < size; b++) {
        const dark = horizontal ? m[a * size + b] === 1 : m[b * size + a] === 1;
        if (dark === runColor) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1;
          else if (runLen > 5) result++;
        } else {
          finderPenaltyAdd(runLen, history, size);
          if (!runColor) result += finderPenaltyCount(history) * PENALTY_N3;
          runColor = dark;
          runLen = 1;
        }
      }
      if (runColor) {
        finderPenaltyAdd(runLen, history, size);
        runLen = 0;
      }
      runLen += size; // 末段补上外侧静默区
      finderPenaltyAdd(runLen, history, size);
      result += finderPenaltyCount(history) * PENALTY_N3;
    }
  };
  scan(true);
  scan(false);

  // 2x2 同色块
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m[y * size + x];
      if (c === m[y * size + x + 1] && c === m[(y + 1) * size + x] && c === m[(y + 1) * size + x + 1]) {
        result += PENALTY_N2;
      }
    }
  }

  // 黑白比例
  let dark = 0;
  for (let i = 0; i < m.length; i++) dark += m[i];
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * PENALTY_N4;
  return result;
}

/**
 * 把 qrEncode 的结果画到 canvas 2D 上下文。
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof qrEncode>} qr
 * @param {number} x 左上角
 * @param {number} y 左上角
 * @param {number} moduleSize 单个模块的像素边长
 * @param {{dark?:string, light?:string, quiet?:number, radius?:number}} [opts]
 */
export function drawQr(ctx, qr, x, y, moduleSize, opts = {}) {
  const quiet = opts.quiet == null ? 4 : opts.quiet; // 静默区（单位：模块）
  const box = (qr.size + quiet * 2) * moduleSize;
  ctx.save();
  // 底板（浅色，保证在深色海报上也能扫）
  ctx.fillStyle = opts.light || '#ffffff';
  if (opts.radius) roundRect(ctx, x, y, box, box, opts.radius);
  else ctx.fillRect(x, y, box, box);
  ctx.fill();

  ctx.fillStyle = opts.dark || '#0b1020';
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (!qr.get(c, r)) continue;
      ctx.fillRect(
        x + (c + quiet) * moduleSize,
        y + (r + quiet) * moduleSize,
        Math.ceil(moduleSize),
        Math.ceil(moduleSize),
      );
    }
  }
  ctx.restore();
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
