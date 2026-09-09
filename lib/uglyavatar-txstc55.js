'use strict';
/* ==========================================================
   丑丑头像引擎 C · txstc55/ugly-avatar 移植版
   - 移植自 https://github.com/txstc55/ugly-avatar（Vue + SVG 方案）
   - 这里改为 Canvas 渲染，并保持「同一 seed 永远生成同一张」可复现特性
   - 算法：随机脸型（蛋形/矩形融合）+ 随机双眼（三次贝塞尔眼睑）+ 随机发丝（贝塞尔）+ 随机嘴型 + 鼻子/瞳孔点缀
   - 原项目的 feTurbulence 位移「毛糙感」用确定性抖动近似，避免每帧抖动闪烁
   ========================================================== */

/* ---------- 可复现随机数（mulberry32） ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RNG = Math.random;
function randomFromInterval(min, max) {
  return min + RNG() * (max - min);
}
function riInt(min, max) {
  return Math.floor(randomFromInterval(min, max + 1));
}

/* ---------- 确定性抖动（模拟 fuzzy 位移，按 seed+元素 稳定） ---------- */
function jit(seed, salt, i, amp) {
  const s = seed + salt * 131.1 + i * 7.7;
  const a = Math.sin(s * 12.9898) * 43758.5453;
  const b = Math.sin(s * 78.233) * 24634.345;
  return [(a - Math.floor(a) - 0.5) * 2 * amp, (b - Math.floor(b) - 0.5) * 2 * amp];
}

/* ==========================================================
   face_shape.js
   ========================================================== */
function getEggShapePoints(a, b, k, segment_points) {
  const result = [];
  for (let i = 0; i < segment_points; i++) {
    const degree = (Math.PI / 2 / segment_points) * i + randomFromInterval(-Math.PI / 1.1 / segment_points, Math.PI / 1.1 / segment_points);
    const y = Math.sin(degree) * b;
    const x = Math.sqrt(((1 - (y * y) / (b * b)) / (1 + k * y)) * a * a) + randomFromInterval(-a / 200.0, a / 200.0);
    result.push([x, y]);
  }
  for (let i = segment_points; i > 0; i--) {
    const degree = (Math.PI / 2 / segment_points) * i + randomFromInterval(-Math.PI / 1.1 / segment_points, Math.PI / 1.1 / segment_points);
    const y = Math.sin(degree) * b;
    const x = -Math.sqrt(((1 - (y * y) / (b * b)) / (1 + k * y)) * a * a) + randomFromInterval(-a / 200.0, a / 200.0);
    result.push([x, y]);
  }
  for (let i = 0; i < segment_points; i++) {
    const degree = (Math.PI / 2 / segment_points) * i + randomFromInterval(-Math.PI / 1.1 / segment_points, Math.PI / 1.1 / segment_points);
    const y = -Math.sin(degree) * b;
    const x = -Math.sqrt(((1 - (y * y) / (b * b)) / (1 + k * y)) * a * a) + randomFromInterval(-a / 200.0, a / 200.0);
    result.push([x, y]);
  }
  for (let i = segment_points; i > 0; i--) {
    const degree = (Math.PI / 2 / segment_points) * i + randomFromInterval(-Math.PI / 1.1 / segment_points, Math.PI / 1.1 / segment_points);
    const y = -Math.sin(degree) * b;
    const x = Math.sqrt(((1 - (y * y) / (b * b)) / (1 + k * y)) * a * a) + randomFromInterval(-a / 200.0, a / 200.0);
    result.push([x, y]);
  }
  return result;
}
function findIntersectionPoints(radian, a, b) {
  if (radian < 0) radian = 0;
  if (radian > Math.PI / 2) radian = Math.PI / 2;
  const m = Math.tan(radian);
  if (Math.abs(radian - Math.PI / 2) < 0.0001) return { x: 0, y: b };
  const y = m * a;
  if (y < b) return { x: a, y };
  const x = b / m;
  return { x, y };
}
function generateRectangularFaceContourPoints(a, b, segment_points) {
  const result = [];
  for (let i = 0; i < segment_points; i++) {
    const degree = (Math.PI / 2 / segment_points) * i + randomFromInterval(-Math.PI / 11 / segment_points, Math.PI / 11 / segment_points);
    const it = findIntersectionPoints(degree, a, b);
    result.push([it.x, it.y]);
  }
  for (let i = segment_points; i > 0; i--) {
    const degree = (Math.PI / 2 / segment_points) * i + randomFromInterval(-Math.PI / 11 / segment_points, Math.PI / 11 / segment_points);
    const it = findIntersectionPoints(degree, a, b);
    result.push([-it.x, it.y]);
  }
  for (let i = 0; i < segment_points; i++) {
    const degree = (Math.PI / 2 / segment_points) * i + randomFromInterval(-Math.PI / 11 / segment_points, Math.PI / 11 / segment_points);
    const it = findIntersectionPoints(degree, a, b);
    result.push([-it.x, -it.y]);
  }
  for (let i = segment_points; i > 0; i--) {
    const degree = (Math.PI / 2 / segment_points) * i + randomFromInterval(-Math.PI / 11 / segment_points, Math.PI / 11 / segment_points);
    const it = findIntersectionPoints(degree, a, b);
    result.push([it.x, -it.y]);
  }
  return result;
}
function generateFaceCountourPoints(numPoints = 100) {
  const faceSizeX0 = randomFromInterval(50, 100);
  const faceSizeY0 = randomFromInterval(70, 100);
  const faceSizeY1 = randomFromInterval(50, 80);
  const faceSizeX1 = randomFromInterval(70, 100);
  const faceK0 = randomFromInterval(0.001, 0.005) * (RNG() > 0.5 ? 1 : -1);
  const faceK1 = randomFromInterval(0.001, 0.005) * (RNG() > 0.5 ? 1 : -1);
  const face0TranslateX = randomFromInterval(-5, 5);
  const face0TranslateY = randomFromInterval(-15, 15);
  const face1TranslateY = randomFromInterval(-5, 5);
  const face1TranslateX = randomFromInterval(-5, 25);
  const eggOrRect0 = RNG() > 0.1;
  const eggOrRect1 = RNG() > 0.3;
  const results0 = eggOrRect0 ? getEggShapePoints(faceSizeX0, faceSizeY0, faceK0, numPoints) : generateRectangularFaceContourPoints(faceSizeX0, faceSizeY0, numPoints);
  const results1 = eggOrRect1 ? getEggShapePoints(faceSizeX1, faceSizeY1, faceK1, numPoints) : generateRectangularFaceContourPoints(faceSizeX1, faceSizeY1, numPoints);
  for (let i = 0; i < results0.length; i++) {
    results0[i][0] += face0TranslateX;
    results0[i][1] += face0TranslateY;
    results1[i][0] += face1TranslateX;
    results1[i][1] += face1TranslateY;
  }
  const results = [];
  const center = [0, 0];
  for (let i = 0; i < results0.length; i++) {
    results.push([
      results0[i][0] * 0.7 + results1[(i + results0.length / 4) % results0.length][1] * 0.3,
      results0[i][1] * 0.7 - results1[(i + results0.length / 4) % results0.length][0] * 0.3,
    ]);
    center[0] += results[i][0];
    center[1] += results[i][1];
  }
  center[0] /= results.length;
  center[1] /= results.length;
  for (let i = 0; i < results.length; i++) {
    results[i][0] -= center[0];
    results[i][1] -= center[1];
  }
  const width = results[0][0] - results[results.length / 2][0];
  const height = results[results.length / 4][1] - results[(results.length * 3) / 4][1];
  results.push(results[0]);
  results.push(results[1]);
  return { face: results, width, height, center: [0, 0] };
}

/* ==========================================================
   eye_shape.js
   ========================================================== */
function cubicBezier(P0, P1, P2, P3, t) {
  const x = (1 - t) ** 3 * P0[0] + 3 * (1 - t) ** 2 * t * P1[0] + 3 * (1 - t) * t ** 2 * P2[0] + t ** 3 * P3[0];
  const y = (1 - t) ** 3 * P0[1] + 3 * (1 - t) ** 2 * t * P1[1] + 3 * (1 - t) * t ** 2 * P2[1] + t ** 3 * P3[1];
  return [x, y];
}
function generateEyeParameters(width) {
  const height_upper = Math.random() * width / 1.2;
  const height_lower = Math.random() * width / 1.2;
  const P0_upper_randX = Math.random() * 0.4 - 0.2;
  const P3_upper_randX = Math.random() * 0.4 - 0.2;
  const P0_upper_randY = Math.random() * 0.4 - 0.2;
  const P3_upper_randY = Math.random() * 0.4 - 0.2;
  const offset_upper_left_randY = Math.random();
  const offset_upper_right_randY = Math.random();
  const P0_upper = [-width / 2 + P0_upper_randX * width / 16, P0_upper_randY * height_upper / 16];
  const P3_upper = [width / 2 + P3_upper_randX * width / 16, P3_upper_randY * height_upper / 16];
  const P0_lower = P0_upper;
  const P3_lower = P3_upper;
  const eye_true_width = P3_upper[0] - P0_upper[0];
  const offset_upper_left_x = randomFromInterval(-eye_true_width / 10.0, eye_true_width / 2.3);
  const offset_upper_right_x = randomFromInterval(-eye_true_width / 10.0, eye_true_width / 2.3);
  const offset_upper_left_y = offset_upper_left_randY * height_upper;
  const offset_upper_right_y = offset_upper_right_randY * height_upper;
  const offset_lower_left_x = randomFromInterval(offset_upper_left_x, eye_true_width / 2.1);
  const offset_lower_right_x = randomFromInterval(offset_upper_right_x, eye_true_width / 2.1);
  const offset_lower_left_y = randomFromInterval(-offset_upper_left_y + 5, height_lower);
  const offset_lower_right_y = randomFromInterval(-offset_upper_right_y + 5, height_lower);
  const left_converge0 = Math.random();
  const right_converge0 = Math.random();
  const left_converge1 = Math.random();
  const right_converge1 = Math.random();
  return {
    height_upper, height_lower,
    P0_upper_randX, P3_upper_randX, P0_upper_randY, P3_upper_randY,
    offset_upper_left_randY, offset_upper_right_randY,
    eye_true_width,
    offset_upper_left_x, offset_upper_right_x, offset_upper_left_y, offset_upper_right_y,
    offset_lower_left_x, offset_lower_right_x, offset_lower_left_y, offset_lower_right_y,
    left_converge0, right_converge0, left_converge1, right_converge1,
  };
}
function generateEyePoints(rands, width = 50) {
  const P0_upper = [-width / 2 + rands.P0_upper_randX * width / 16, rands.P0_upper_randY * rands.height_upper / 16];
  const P3_upper = [width / 2 + rands.P3_upper_randX * width / 16, rands.P3_upper_randY * rands.height_upper / 16];
  const P0_lower = P0_upper;
  const P3_lower = P3_upper;
  const eye_true_width = P3_upper[0] - P0_upper[0];
  const P1_upper = [P0_upper[0] + rands.offset_upper_left_x, P0_upper[1] + rands.offset_upper_left_y];
  const P2_upper = [P3_upper[0] - rands.offset_upper_right_x, P3_upper[1] + rands.offset_upper_right_y];
  const P1_lower = [P0_lower[0] + rands.offset_lower_left_x, P0_lower[1] - rands.offset_lower_left_y];
  const P2_lower = [P3_lower[0] - rands.offset_lower_right_x, P3_lower[1] - rands.offset_lower_right_y];
  const upper_eyelid_points = [];
  const upper_eyelid_points_left_control = [];
  const upper_eyelid_points_right_control = [];
  const upper_eyelid_left_control_point = [P0_upper[0] * (1 - rands.left_converge0) + P1_lower[0] * rands.left_converge0, P0_upper[1] * (1 - rands.left_converge0) + P1_lower[1] * rands.left_converge0];
  const upper_eyelid_right_control_point = [P3_upper[0] * (1 - rands.right_converge0) + P2_lower[0] * rands.right_converge0, P3_upper[1] * (1 - rands.right_converge0) + P2_lower[1] * rands.right_converge0];
  for (let t = 0; t < 100; t++) {
    upper_eyelid_points.push(cubicBezier(P0_upper, P1_upper, P2_upper, P3_upper, t / 100));
    upper_eyelid_points_left_control.push(cubicBezier(upper_eyelid_left_control_point, P0_upper, P1_upper, P2_upper, t / 100));
    upper_eyelid_points_right_control.push(cubicBezier(P1_upper, P2_upper, P3_upper, upper_eyelid_right_control_point, t / 100));
  }
  for (let i = 0; i < 75; i++) {
    const weight = ((75.0 - i) / 75.0) ** 2;
    upper_eyelid_points[i] = [upper_eyelid_points[i][0] * (1 - weight) + upper_eyelid_points_left_control[i + 25][0] * weight, upper_eyelid_points[i][1] * (1 - weight) + upper_eyelid_points_left_control[i + 25][1] * weight];
    upper_eyelid_points[i + 25] = [upper_eyelid_points[i + 25][0] * weight + upper_eyelid_points_right_control[i][0] * (1 - weight), upper_eyelid_points[i + 25][1] * weight + upper_eyelid_points_right_control[i][1] * (1 - weight)];
  }
  const lower_eyelid_points = [];
  const lower_eyelid_points_left_control = [];
  const lower_eyelid_points_right_control = [];
  const lower_eyelid_left_control_point = [P0_lower[0] * (1 - rands.left_converge0) + P1_upper[0] * rands.left_converge0, P0_lower[1] * (1 - rands.left_converge0) + P1_upper[1] * rands.left_converge0];
  const lower_eyelid_right_control_point = [P3_lower[0] * (1 - rands.right_converge1) + P2_upper[0] * rands.right_converge1, P3_lower[1] * (1 - rands.right_converge1) + P2_upper[1] * rands.right_converge1];
  for (let t = 0; t < 100; t++) {
    lower_eyelid_points.push(cubicBezier(P0_lower, P1_lower, P2_lower, P3_lower, t / 100));
    lower_eyelid_points_left_control.push(cubicBezier(lower_eyelid_left_control_point, P0_lower, P1_lower, P2_lower, t / 100));
    lower_eyelid_points_right_control.push(cubicBezier(P1_lower, P2_lower, P3_lower, lower_eyelid_right_control_point, t / 100));
  }
  for (let i = 0; i < 75; i++) {
    const weight = ((75.0 - i) / 75.0) ** 2;
    lower_eyelid_points[i] = [lower_eyelid_points[i][0] * (1 - weight) + lower_eyelid_points_left_control[i + 25][0] * weight, lower_eyelid_points[i][1] * (1 - weight) + lower_eyelid_points_left_control[i + 25][1] * weight];
    lower_eyelid_points[i + 25] = [lower_eyelid_points[i + 25][0] * weight + lower_eyelid_points_right_control[i][0] * (1 - weight), lower_eyelid_points[i + 25][1] * weight + lower_eyelid_points_right_control[i][1] * (1 - weight)];
  }
  for (let i = 0; i < 100; i++) {
    lower_eyelid_points[i][1] = -lower_eyelid_points[i][1];
    upper_eyelid_points[i][1] = -upper_eyelid_points[i][1];
  }
  let eyeCenter = [upper_eyelid_points[50][0] / 2.0 + lower_eyelid_points[50][0] / 2.0, upper_eyelid_points[50][1] / 2.0 + lower_eyelid_points[50][1] / 2.0];
  for (let i = 0; i < 100; i++) {
    lower_eyelid_points[i][0] -= eyeCenter[0];
    lower_eyelid_points[i][1] -= eyeCenter[1];
    upper_eyelid_points[i][0] -= eyeCenter[0];
    upper_eyelid_points[i][1] -= eyeCenter[1];
  }
  eyeCenter = [0, 0];
  return { upper: upper_eyelid_points, lower: lower_eyelid_points, center: [eyeCenter] };
}
function generateBothEyes(width = 50) {
  const rands_left = generateEyeParameters(width);
  const rands_right = { ...rands_left };
  for (const key in rands_right) {
    if (typeof rands_right[key] === 'number') {
      rands_right[key] += randomFromInterval(-rands_right[key] / 2.0, rands_right[key] / 2.0);
    }
  }
  const left_eye = generateEyePoints(rands_left, width);
  const right_eye = generateEyePoints(rands_right, width);
  for (const key in left_eye) {
    if (typeof left_eye[key] === 'object') {
      for (let i = 0; i < left_eye[key].length; i++) {
        left_eye[key][i][0] = -left_eye[key][i][0];
      }
    }
  }
  return { left: left_eye, right: right_eye };
}

/* ==========================================================
   hair_lines.js
   ========================================================== */
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
function binomialCoefficient(n, k) {
  return factorial(n) / (factorial(k) * factorial(n - k));
}
function calculateBezierPoint(t, controlPoints) {
  let x = 0, y = 0;
  const n = controlPoints.length - 1;
  for (let i = 0; i <= n; i++) {
    const binCoeff = binomialCoefficient(n, i);
    const a = Math.pow(1 - t, n - i);
    const b = Math.pow(t, i);
    x += binCoeff * a * b * controlPoints[i].x;
    y += binCoeff * a * b * controlPoints[i].y;
  }
  return [x, y];
}
function computeBezierCurve(controlPoints, numberOfPoints) {
  const curve = [];
  for (let i = 0; i <= numberOfPoints; i++) {
    const t = i / numberOfPoints;
    curve.push(calculateBezierPoint(t, controlPoints));
  }
  return curve;
}
function generateHairLines0(faceCountour, numHairLines = 100) {
  const fc = faceCountour.slice(0, faceCountour.length - 2);
  const results = [];
  for (let i = 0; i < numHairLines; i++) {
    const numHairPoints = 20 + Math.floor(randomFromInterval(-5, 5));
    let hair_line = [];
    let index_offset = Math.floor(randomFromInterval(30, 140));
    for (let j = 0; j < numHairPoints; j++) {
      hair_line.push({ x: fc[(fc.length - (j + index_offset)) % fc.length][0], y: fc[(fc.length - (j + index_offset)) % fc.length][1] });
    }
    const d0 = computeBezierCurve(hair_line, numHairPoints);
    hair_line = [];
    index_offset = Math.floor(randomFromInterval(30, 140));
    for (let j = 0; j < numHairPoints; j++) {
      hair_line.push({ x: fc[(fc.length - (-j + index_offset)) % fc.length][0], y: fc[(fc.length - (-j + index_offset)) % fc.length][1] });
    }
    const d1 = computeBezierCurve(hair_line, numHairPoints);
    const d = [];
    for (let j = 0; j < numHairPoints; j++) {
      const w = (j * (1 / numHairPoints)) ** 2;
      d.push([d0[j][0] * w + d1[j][0] * (1 - w), d0[j][1] * w + d1[j][1] * (1 - w)]);
    }
    results.push(d);
  }
  return results;
}
function generateHairLines1(faceCountour, numHairLines = 100) {
  const fc = faceCountour.slice(0, faceCountour.length - 2);
  const results = [];
  for (let i = 0; i < numHairLines; i++) {
    const numHairPoints = 20 + Math.floor(randomFromInterval(-5, 5));
    const hair_line = [];
    let index_start = Math.floor(randomFromInterval(20, 160));
    hair_line.push({ x: fc[(fc.length - index_start) % fc.length][0], y: fc[(fc.length - index_start) % fc.length][1] });
    for (let j = 1; j < numHairPoints + 1; j++) {
      index_start = Math.floor(randomFromInterval(20, 160));
      hair_line.push({ x: fc[(fc.length - index_start) % fc.length][0], y: fc[(fc.length - index_start) % fc.length][1] });
    }
    results.push(computeBezierCurve(hair_line, numHairPoints));
  }
  return results;
}
function generateHairLines2(faceCountour, numHairLines = 100) {
  const fc = faceCountour.slice(0, faceCountour.length - 2);
  const results = [];
  const pickedIndices = [];
  for (let i = 0; i < numHairLines; i++) pickedIndices.push(Math.floor(randomFromInterval(10, 180)));
  pickedIndices.sort();
  for (let i = 0; i < numHairLines; i++) {
    const numHairPoints = 20 + Math.floor(randomFromInterval(-5, 5));
    const hair_line = [];
    const index_offset = pickedIndices[i];
    const lower = randomFromInterval(0.8, 1.4);
    const reverse = RNG() > 0.5 ? 1 : -1;
    for (let j = 0; j < numHairPoints; j++) {
      const powerscale = randomFromInterval(0.1, 3);
      const portion = (1 - (j / numHairPoints) ** powerscale) * (1 - lower) + lower;
      hair_line.push({ x: fc[(fc.length - (reverse * j + index_offset)) % fc.length][0] * portion, y: fc[(fc.length - (reverse * j + index_offset)) % fc.length][1] * portion });
    }
    const d = computeBezierCurve(hair_line, numHairPoints);
    if (RNG() > 0.7) d.reverse();
    if (results.length === 0) { results.push(d); continue; }
    const lastHairPoint = results[results.length - 1][results[results.length - 1].length - 1];
    const dist = Math.sqrt((d[0][0] - lastHairPoint[0]) ** 2 + (d[0][1] - lastHairPoint[1]) ** 2);
    if (RNG() > 0.5 && dist < 100) results[results.length - 1] = results[results.length - 1].concat(d);
    else results.push(d);
  }
  return results;
}
function generateHairLines3(faceCountour, numHairLines = 100) {
  const fc = faceCountour.slice(0, faceCountour.length - 2);
  const results = [];
  const pickedIndices = [];
  for (let i = 0; i < numHairLines; i++) pickedIndices.push(Math.floor(randomFromInterval(10, 180)));
  pickedIndices.sort();
  const splitPoint = Math.floor(randomFromInterval(0, 200));
  for (let i = 0; i < numHairLines; i++) {
    const numHairPoints = 30 + Math.floor(randomFromInterval(-8, 8));
    const hair_line = [];
    const index_offset = pickedIndices[i];
    const lower = randomFromInterval(1, 2.3);
    const useLow = RNG() > 0.9 ? randomFromInterval(0, 1) : lower;
    const reverse = index_offset > splitPoint ? 1 : -1;
    for (let j = 0; j < numHairPoints; j++) {
      const powerscale = randomFromInterval(0.1, 3);
      const portion = (1 - (j / numHairPoints) ** powerscale) * (1 - useLow) + useLow;
      hair_line.push({ x: fc[(fc.length - (reverse * j * 2 + index_offset)) % fc.length][0] * portion, y: fc[(fc.length - (reverse * j * 2 + index_offset)) % fc.length][1] });
    }
    results.push(computeBezierCurve(hair_line, numHairPoints));
  }
  return results;
}

/* ==========================================================
   mouth_shape.js
   ========================================================== */
function generateMouthShape0(faceCountour, faceHeight, faceWidth) {
  const fc = faceCountour.slice(0, faceCountour.length - 2);
  const mouthRightY = randomFromInterval(faceHeight / 7, faceHeight / 3.5);
  const mouthLeftY = randomFromInterval(faceHeight / 7, faceHeight / 3.5);
  const mouthRightX = randomFromInterval(faceWidth / 10, faceWidth / 2);
  const mouthLeftX = -mouthRightX + randomFromInterval(-faceWidth / 20, faceWidth / 20);
  const mouthRight = [mouthRightX, mouthRightY];
  const mouthLeft = [mouthLeftX, mouthLeftY];
  const controlPoint0 = [randomFromInterval(0, mouthRightX), randomFromInterval(mouthLeftY + 5, faceHeight / 1.5)];
  const controlPoint1 = [randomFromInterval(mouthLeftX, 0), randomFromInterval(mouthLeftY + 5, faceHeight / 1.5)];
  const mouthPoints = [];
  for (let i = 0; i < 1; i += 0.01) mouthPoints.push(cubicBezier(mouthLeft, controlPoint1, controlPoint0, mouthRight, i));
  if (RNG() > 0.5) {
    for (let i = 0; i < 1; i += 0.01) mouthPoints.push(cubicBezier(mouthRight, controlPoint0, controlPoint1, mouthLeft, i));
  } else {
    const y_offset_portion = randomFromInterval(0, 0.8);
    for (let i = 0; i < 100; i += 1) {
      mouthPoints.push([mouthPoints[99][0] * (1 - i / 100.0) + mouthPoints[0][0] * i / 100.0, (mouthPoints[99][1] * (1 - i / 100.0) + mouthPoints[0][1] * i / 100.0) * (1 - y_offset_portion) + mouthPoints[99 - i][1] * y_offset_portion]);
    }
  }
  return mouthPoints;
}
function generateMouthShape1(faceCountour, faceHeight, faceWidth) {
  const fc = faceCountour.slice(0, faceCountour.length - 2);
  const mouthRightY = randomFromInterval(faceHeight / 7, faceHeight / 4);
  const mouthLeftY = randomFromInterval(faceHeight / 7, faceHeight / 4);
  const mouthRightX = randomFromInterval(faceWidth / 10, faceWidth / 2);
  const mouthLeftX = -mouthRightX + randomFromInterval(-faceWidth / 20, faceWidth / 20);
  const mouthRight = [mouthRightX, mouthRightY];
  const mouthLeft = [mouthLeftX, mouthLeftY];
  const controlPoint0 = [randomFromInterval(0, mouthRightX), randomFromInterval(mouthLeftY + 5, faceHeight / 1.5)];
  const controlPoint1 = [randomFromInterval(mouthLeftX, 0), randomFromInterval(mouthLeftY + 5, faceHeight / 1.5)];
  const mouthPoints = [];
  for (let i = 0; i < 1; i += 0.01) mouthPoints.push(cubicBezier(mouthLeft, controlPoint1, controlPoint0, mouthRight, i));
  const center = [(mouthRight[0] + mouthLeft[0]) / 2, mouthPoints[25][1] / 2 + mouthPoints[75][1] / 2];
  if (RNG() > 0.5) {
    for (let i = 0; i < 1; i += 0.01) mouthPoints.push(cubicBezier(mouthRight, controlPoint0, controlPoint1, mouthLeft, i));
  } else {
    const y_offset_portion = randomFromInterval(0, 0.8);
    for (let i = 0; i < 100; i += 1) {
      mouthPoints.push([mouthPoints[99][0] * (1 - i / 100.0) + mouthPoints[0][0] * i / 100.0, (mouthPoints[99][1] * (1 - i / 100.0) + mouthPoints[0][1] * i / 100.0) * (1 - y_offset_portion) + mouthPoints[99 - i][1] * y_offset_portion]);
    }
  }
  for (let i = 0; i < mouthPoints.length; i++) {
    mouthPoints[i][0] -= center[0];
    mouthPoints[i][1] -= center[1];
    mouthPoints[i][1] = -mouthPoints[i][1];
    mouthPoints[i][0] = mouthPoints[i][0] * 0.6;
    mouthPoints[i][1] = mouthPoints[i][1] * 0.6;
    mouthPoints[i][0] += center[0];
    mouthPoints[i][1] += center[1] * 0.8;
  }
  return mouthPoints;
}
function generateMouthShape2(faceCountour, faceHeight, faceWidth) {
  const center = [randomFromInterval(-faceWidth / 8, faceWidth / 8), randomFromInterval(faceHeight / 4, faceHeight / 2.5)];
  const mouthPoints = getEggShapePoints(randomFromInterval(faceWidth / 4, faceWidth / 10), randomFromInterval(faceHeight / 10, faceHeight / 20), 0.001, 50);
  const randomRotationDegree = randomFromInterval(-Math.PI / 9.5, Math.PI / 9.5);
  for (let i = 0; i < mouthPoints.length; i++) {
    const x = mouthPoints[i][0];
    const y = mouthPoints[i][1];
    mouthPoints[i][0] = x * Math.cos(randomRotationDegree) - y * Math.sin(randomRotationDegree);
    mouthPoints[i][1] = x * Math.sin(randomRotationDegree) + y * Math.cos(randomRotationDegree);
    mouthPoints[i][0] += center[0];
    mouthPoints[i][1] += center[1];
  }
  return mouthPoints;
}

/* ==========================================================
   调色板（与源项目一致）
   ========================================================== */
const HAIR_COLORS = [
  'rgb(0, 0, 0)', 'rgb(44, 34, 43)', 'rgb(80, 68, 68)', 'rgb(167, 133, 106)', 'rgb(220, 208, 186)',
  'rgb(233, 236, 239)', 'rgb(165, 42, 42)', 'rgb(145, 85, 61)', 'rgb(128, 128, 128)', 'rgb(185, 55, 55)',
  'rgb(255, 192, 203)', 'rgb(255, 105, 180)', 'rgb(230, 230, 250)', 'rgb(64, 224, 208)', 'rgb(0, 191, 255)',
  'rgb(148, 0, 211)', 'rgb(50, 205, 50)', 'rgb(255, 165, 0)', 'rgb(220, 20, 60)', 'rgb(192, 192, 192)',
  'rgb(255, 215, 0)', 'rgb(255, 255, 255)', 'rgb(124, 252, 0)', 'rgb(127, 255, 0)', 'rgb(0, 255, 127)',
  'rgb(72, 209, 204)', 'rgb(0, 255, 255)', 'rgb(0, 206, 209)', 'rgb(32, 178, 170)', 'rgb(95, 158, 160)',
  'rgb(70, 130, 180)', 'rgb(176, 196, 222)', 'rgb(30, 144, 255)', 'rgb(135, 206, 235)', 'rgb(0, 0, 139)',
  'rgb(138, 43, 226)', 'rgb(75, 0, 130)', 'rgb(139, 0, 139)', 'rgb(153, 50, 204)', 'rgb(186, 85, 211)',
  'rgb(218, 112, 214)', 'rgb(221, 160, 221)', 'rgb(238, 130, 238)', 'rgb(255, 0, 255)', 'rgb(216, 191, 216)',
  'rgb(255, 20, 147)', 'rgb(255, 69, 0)', 'rgb(255, 140, 0)', 'rgb(255, 165, 0)', 'rgb(250, 128, 114)',
  'rgb(233, 150, 122)', 'rgb(240, 128, 128)', 'rgb(205, 92, 92)', 'rgb(255, 99, 71)', 'rgb(255, 160, 122)',
];
const BG_COLORS = [
  'rgb(245, 245, 220)', 'rgb(176, 224, 230)', 'rgb(211, 211, 211)', 'rgb(152, 251, 152)', 'rgb(255, 253, 208)',
  'rgb(230, 230, 250)', 'rgb(188, 143, 143)', 'rgb(135, 206, 235)', 'rgb(245, 255, 250)', 'rgb(245, 222, 179)',
  'rgb(47, 79, 79)', 'rgb(72, 61, 139)', 'rgb(60, 20, 20)', 'rgb(25, 25, 112)', 'rgb(139, 0, 0)',
  'rgb(85, 107, 47)', 'rgb(128, 0, 128)', 'rgb(0, 100, 0)', 'rgb(0, 0, 139)', 'rgb(105, 105, 105)',
  'rgb(240, 128, 128)', 'rgb(255, 160, 122)', 'rgb(255, 218, 185)', 'rgb(255, 228, 196)', 'rgb(255, 222, 173)',
  'rgb(255, 250, 205)', 'rgb(250, 250, 210)', 'rgb(255, 239, 213)', 'rgb(255, 245, 238)', 'rgb(255, 248, 220)',
  'rgb(255, 255, 240)', 'rgb(240, 255, 240)', 'rgb(240, 255, 255)', 'rgb(240, 248, 255)', 'rgb(248, 248, 255)',
  'rgb(255, 250, 250)', 'rgb(255, 240, 245)', 'rgb(255, 228, 225)', 'rgb(230, 230, 250)', 'rgb(216, 191, 216)',
  'rgb(221, 160, 221)', 'rgb(238, 130, 238)', 'rgb(218, 112, 214)', 'rgb(186, 85, 211)', 'rgb(147, 112, 219)',
  'rgb(138, 43, 226)', 'rgb(148, 0, 211)', 'rgb(153, 50, 204)', 'rgb(139, 69, 19)', 'rgb(160, 82, 45)',
  'rgb(210, 105, 30)', 'rgb(205, 133, 63)', 'rgb(244, 164, 96)', 'rgb(222, 184, 135)', 'rgb(255, 250, 240)',
];

const SPECIES = [{ id: 'human', cn: '人类', emoji: '🙂' }];

/* ==========================================================
   生成：复刻源项目 generateFace() 的全部随机决策，存入 av
   ========================================================== */
function generateAvatar(speciesId, opts = {}) {
  const seed = opts.seed != null ? opts.seed >>> 0 : (Math.random() * 0xffffffff) >>> 0;
  RNG = mulberry32(seed);

  const av = { species: 'human', seed, engine: 'C' };

  av.faceScale = 1.5 + RNG() * 0.6;
  av.haventSleptForDays = RNG() > 0.8;

  const face = generateFaceCountourPoints();
  av.face = face.face;
  av.faceWidth = face.width;
  av.faceHeight = face.height;
  av.center = face.center;

  const eyes = generateBothEyes(av.faceWidth / 2);
  const left = eyes.left, right = eyes.right;
  const eyeW = (av.haventSleptForDays ? 5.0 : 3.0) / av.faceScale;

  function buildEye(e, isLeft) {
    const contour = e.upper.slice(10, 90).concat(e.lower.slice(10, 90).reverse());
    const pupilShiftX = randomFromInterval(-av.faceWidth / 20, av.faceWidth / 20);
    const lInd0 = riInt(10, e.upper.length - 10);
    const rInd0 = riInt(10, e.upper.length - 10);
    const lInd1 = riInt(10, e.upper.length - 10);
    const rInd1 = riInt(10, e.upper.length - 10);
    const lLerp = randomFromInterval(0.2, 0.8);
    const rLerp = randomFromInterval(0.2, 0.8);
    const pupilShiftY = e.upper[lInd0][1] * lLerp + e.lower[lInd1][1] * (1 - lLerp);
    const pupilShiftX2 = e.upper[lInd0][0] * lLerp + e.lower[lInd1][0] * (1 - lLerp);
    const pupils = [];
    for (let k = 0; k < 10; k++) {
      pupils.push({
        x: pupilShiftX2 + RNG() * 5 - 2.5,
        y: pupilShiftY + RNG() * 5 - 2.5,
        r: RNG() * 2 + 3.0,
        sw: 1.0 + RNG() * 0.5,
      });
    }
    return { upper: e.upper, lower: e.lower, contour, pupils, eyeW };
  }
  const leftEye = buildEye(left, true);
  const rightEye = buildEye(right, false);

  av.distanceBetweenEyes = randomFromInterval(av.faceWidth / 4.5, av.faceWidth / 4);
  av.eyeHeightOffset = randomFromInterval(av.faceHeight / 8, av.faceHeight / 6);
  av.leftEyeOffsetX = randomFromInterval(-av.faceWidth / 20, av.faceWidth / 10);
  av.leftEyeOffsetY = randomFromInterval(-av.faceHeight / 50, av.faceHeight / 50);
  av.rightEyeOffsetX = randomFromInterval(-av.faceWidth / 20, av.faceWidth / 10);
  av.rightEyeOffsetY = randomFromInterval(-av.faceHeight / 50, av.faceHeight / 50);

  // 眼睛在画布上的摆放（与源 SVG transform 一致）
  leftEye.cx = -(av.center[0] + av.distanceBetweenEyes + av.leftEyeOffsetX);
  leftEye.cy = -(av.center[1] + av.eyeHeightOffset + av.leftEyeOffsetY); // 注意源里是 -(-center[1]+...) = -(...)
  rightEye.cx = av.center[0] + av.distanceBetweenEyes + av.rightEyeOffsetX;
  rightEye.cy = -(av.center[1] + av.eyeHeightOffset + av.rightEyeOffsetY);
  av.eyes = { left: leftEye, right: rightEye };

  // 发丝
  const hairs = [];
  const numHairMethods = 4;
  const numHairLines = [];
  for (let i = 0; i < numHairMethods; i++) numHairLines.push(riInt(0, 50));
  if (RNG() > 0.3) hairs.push(...generateHairLines0(av.face, numHairLines[0] * 1 + 10));
  if (RNG() > 0.3) hairs.push(...generateHairLines1(av.face, numHairLines[1] / 1.5 + 10));
  if (RNG() > 0.5) hairs.push(...generateHairLines2(av.face, numHairLines[2] * 3 + 10));
  if (RNG() > 0.5) hairs.push(...generateHairLines3(av.face, numHairLines[3] * 3 + 10));
  av.hairs = hairs.map((h) => ({ points: h, width: 0.5 + RNG() * 2.5 }));

  // 头发颜色
  if (RNG() > 0.1) {
    av.hairColor = HAIR_COLORS[riInt(0, 9)];
    av.hairIsRainbow = false;
  } else {
    av.hairIsRainbow = true;
    av.rainbow = [
      HAIR_COLORS[riInt(0, 9)],
      HAIR_COLORS[riInt(0, HAIR_COLORS.length - 1)],
      HAIR_COLORS[riInt(0, HAIR_COLORS.length - 1)],
    ];
    av.dyeColorOffset = randomFromInterval(0, 100);
  }

  // 鼻子
  av.rightNoseCenterX = randomFromInterval(av.faceWidth / 18, av.faceWidth / 12);
  av.rightNoseCenterY = randomFromInterval(0, av.faceHeight / 5);
  av.leftNoseCenterX = randomFromInterval(-av.faceWidth / 18, -av.faceWidth / 12);
  av.leftNoseCenterY = av.rightNoseCenterY + randomFromInterval(-av.faceHeight / 30, av.faceHeight / 20);
  if (RNG() > 0.5) {
    const left = [], right = [];
    for (let k = 0; k < 10; k++) {
      left.push({ x: av.leftNoseCenterX + RNG() * 4 - 2, y: av.leftNoseCenterY + RNG() * 4 - 2, r: RNG() * 2 + 1, sw: 1 + RNG() * 0.5 });
      right.push({ x: av.rightNoseCenterX + RNG() * 4 - 2, y: av.rightNoseCenterY + RNG() * 4 - 2, r: RNG() * 2 + 1, sw: 1 + RNG() * 0.5 });
    }
    av.nose = { type: 'points', left, right };
  } else {
    av.nose = {
      type: 'line',
      sw: 2.5 + RNG() * 1.0,
      p0: [av.leftNoseCenterX, av.leftNoseCenterY],
      pc: [av.rightNoseCenterX, av.rightNoseCenterY * 1.5],
      p1: [(av.leftNoseCenterX + av.rightNoseCenterX) / 2, -av.eyeHeightOffset * 0.2],
    };
  }

  // 嘴
  const choice = riInt(0, 2);
  if (choice === 0) av.mouth = generateMouthShape0(av.face, av.faceHeight, av.faceWidth);
  else if (choice === 1) av.mouth = generateMouthShape1(av.face, av.faceHeight, av.faceWidth);
  else av.mouth = generateMouthShape2(av.face, av.faceHeight, av.faceWidth);
  av.mouthSW = 2.7 + RNG() * 0.5;

  // 背景
  av.bg = BG_COLORS[riInt(0, BG_COLORS.length - 1)];

  return av;
}

/* ==========================================================
   画布渲染（复刻源 SVG 的层级与颜色）
   ========================================================== */
function pathPts(ctx, pts, seed, salt, amp, close) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const j = jit(seed, salt + i * 0.013, i, amp);
    const x = pts[i][0] + j[0];
    const y = pts[i][1] + j[1];
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (close) ctx.closePath();
}
function strokePts(ctx, pts, seed, salt, amp, color, lw, close) {
  pathPts(ctx, pts, seed, salt, amp, close);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

function renderAvatar(ctx, av, t, size, opts = {}) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const u = size / 200;
  ctx.translate(size / 2, size / 2);
  ctx.scale(u, u);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const seed = av.seed;
  const bg = opts.bgColor && opts.bgColor !== 'transparent' ? opts.bgColor : av.bg;
  if (!opts.transparent && !opts.bgColor) {
    ctx.fillStyle = bg;
    ctx.fillRect(-100, -100, 200, 200);
  } else if (opts.bgColor && opts.bgColor !== 'transparent') {
    ctx.fillStyle = bg;
    ctx.fillRect(-100, -100, 200, 200);
  }

  // 脸
  pathPts(ctx, av.face, seed, 1, 1.6, true);
  ctx.fillStyle = '#ffc9a9';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 3.0 / av.faceScale;
  ctx.stroke();

  // 发丝（在脸之下/上均可，按源顺序放在脸后、五官前）
  let hairStroke = av.hairColor;
  if (av.hairIsRainbow) {
    const g = ctx.createLinearGradient(-100, 0, 100, 0);
    g.addColorStop(0, av.rainbow[0]);
    g.addColorStop(Math.max(0.01, Math.min(0.99, av.dyeColorOffset / 100)), av.rainbow[1]);
    g.addColorStop(1, av.rainbow[2]);
    hairStroke = g;
  }
  ctx.strokeStyle = hairStroke;
  for (let hi = 0; hi < av.hairs.length; hi++) {
    const h = av.hairs[hi];
    pathPts(ctx, h.points, seed, 100 + hi, 0.6, false);
    ctx.lineWidth = h.width;
    ctx.stroke();
  }

  // 鼻子
  if (av.nose.type === 'points') {
    for (const grp of [av.nose.left, av.nose.right]) {
      ctx.strokeStyle = 'black';
      for (const c of grp) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else {
    ctx.strokeStyle = 'black';
    ctx.lineWidth = av.nose.sw;
    ctx.beginPath();
    ctx.moveTo(av.nose.p0[0], av.nose.p0[1]);
    ctx.quadraticCurveTo(av.nose.pc[0], av.nose.pc[1], av.nose.p1[0], av.nose.p1[1]);
    ctx.stroke();
  }

  // 眼睛
  for (const key of ['left', 'right']) {
    const E = av.eyes[key];
    ctx.save();
    ctx.translate(E.cx, E.cy);
    // 白色眼白
    pathPts(ctx, E.contour, seed, (key === 'left' ? 200 : 300), 0.8, true);
    ctx.fillStyle = 'white';
    ctx.fill();
    // 眼睑线条
    strokePts(ctx, E.upper, seed, 210, 0.8, 'black', E.eyeW, false);
    strokePts(ctx, E.lower, seed, 220, 0.8, 'black', E.eyeW, false);
    // 瞳孔（裁剪到眼形内）
    ctx.save();
    pathPts(ctx, E.contour, seed, (key === 'left' ? 200 : 300), 0.8, true);
    ctx.clip();
    ctx.strokeStyle = 'black';
    for (const p of E.pupils) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.lineWidth = p.sw;
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  // 嘴
  pathPts(ctx, av.mouth, seed, 400, 0.7, true);
  ctx.fillStyle = 'rgb(215,127,140)';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = av.mouthSW;
  ctx.stroke();

  ctx.restore();
}

export const AvatarKit2 = { SPECIES, generateAvatar, renderAvatar };
