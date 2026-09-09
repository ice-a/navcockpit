<script setup>
// 随机丑头像生成器。支持双引擎切换：
//  - A：GordenSun/uglyAvatar（有机「沸腾线」风格，默认）
//  - B：自带「方块怪」风格（lib/uglyavatar2.js）
// 两引擎 API 一致（generateAvatar / renderAvatar / SPECIES），seed 可复现、可导出 1024×1024 PNG。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { AvatarKit2 as KitA } from '~/lib/uglyavatar';
import { AvatarKit2 as KitB } from '~/lib/uglyavatar2';
import { AvatarKit2 as KitC } from '~/lib/uglyavatar-txstc55';

const canvas = ref(null);
const engine = ref('A'); // A = GordenSun, B = 方块怪, C = txstc55
const kit = computed(() => (engine.value === 'A' ? KitA : engine.value === 'B' ? KitB : KitC));

const species = ref('random');
const seedText = ref('');
const bgColor = ref('#151b2e');
const animating = ref(true);

let av = null;
let rafId = null;
let ctx = null;

const speciesOptions = computed(() => [
  { id: 'random', name: '🎲 随机物种' },
  ...kit.value.SPECIES.filter((s) => s.id !== 'random').map((s) => ({ id: s.id, name: s.cn || s.id })),
]);

function generate() {
  const opts = {};
  if (seedText.value.trim()) {
    let h = 2166136261;
    for (const ch of seedText.value.trim()) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    opts.seed = h >>> 0;
  }
  av = kit.value.generateAvatar(species.value, opts);
  if (!seedText.value.trim()) seedText.value = String(av.seed);
}

function redraw(t = performance.now() / 1000) {
  if (!ctx || !av) return;
  kit.value.renderAvatar(ctx, av, t, 320, {
    bgColor: bgColor.value === 'transparent' ? undefined : bgColor.value,
  });
}

function loop() {
  if (animating.value) redraw();
  rafId = requestAnimationFrame(loop);
}

function regenerate() {
  seedText.value = '';
  generate();
}

function download() {
  const out = document.createElement('canvas');
  out.width = out.height = 1024;
  kit.value.renderAvatar(out.getContext('2d'), av, performance.now() / 1000, 1024, {
    bgColor: bgColor.value === 'transparent' ? undefined : bgColor.value,
    transparent: bgColor.value === 'transparent',
  });
  out.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ugly-avatar-${engine.value}-${av.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

onMounted(() => {
  // 支持 ?avatarEngine=A/B/C 深链直达指定引擎
  const e = (new URLSearchParams(location.search).get('avatarEngine') || '').toUpperCase();
  if (e === 'A' || e === 'B' || e === 'C') engine.value = e;
  ctx = canvas.value.getContext('2d');
  generate();
  loop();
});

onBeforeUnmount(() => cancelAnimationFrame(rafId));
</script>

<template>
  <div>
    <div class="toolbar" style="flex-wrap: wrap">
      <span style="font-size: 13px; color: var(--text-dim)">引擎：</span>
      <div class="seg">
        <button :class="{ active: engine === 'A' }" @click="engine = 'A'; generate()">GordenSun 有机风</button>
        <button :class="{ active: engine === 'B' }" @click="engine = 'B'; generate()">方块怪风</button>
        <button :class="{ active: engine === 'C' }" @click="engine = 'C'; generate()">txstc55 脸谱</button>
      </div>
    </div>

    <h2 class="zone">🎨 个性头像 <small>seed 可复现 · 可导出 1024×1024 PNG</small></h2>

    <div class="avatar-wrap">
      <div class="avatar-canvas-box">
        <canvas ref="canvas" width="320" height="320"></canvas>
      </div>

      <div class="avatar-controls">
        <div class="row">
          <label style="font-size: 13px; color: var(--text-dim)">物种/风格</label>
          <select v-model="species" @change="generate">
            <option v-for="s in speciesOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div class="row">
          <label style="font-size: 13px; color: var(--text-dim)">Seed</label>
          <input v-model="seedText" type="text" placeholder="留空随机" @keyup.enter="generate" />
          <button class="btn small" @click="generate">按 Seed 生成</button>
        </div>
        <div class="row">
          <label style="font-size: 13px; color: var(--text-dim)">背景</label>
          <select v-model="bgColor">
            <option value="#151b2e">深色</option>
            <option value="#ffffff">白色</option>
            <option value="#f5e6ca">米黄</option>
            <option value="transparent">透明</option>
          </select>
        </div>
        <div class="row">
          <button class="btn primary" @click="regenerate">🎲 随机一张</button>
          <button class="btn" @click="animating = !animating">
            {{ animating ? '⏸ 暂停动画' : '▶️ 播放动画' }}
          </button>
          <button class="btn" @click="download">⬇️ 下载 PNG</button>
        </div>
        <p style="font-size: 12px; color: var(--text-dim); line-height: 1.6; margin: 4px 0 0">
          同一个 Seed 永远生成同一张头像，可以收藏喜欢的 Seed。
          默认引擎来自
          <a href="https://github.com/GordenSun/uglyAvatar" target="_blank" rel="noopener" style="color: var(--accent)"
            >GordenSun/uglyAvatar</a
          >；「方块怪风」为自带第二套生成器；「txstc55 脸谱」移植自
          <a href="https://github.com/txstc55/ugly-avatar" target="_blank" rel="noopener" style="color: var(--accent)"
            >txstc55/ugly-avatar</a
          >，脸型/眼/嘴/发丝全随机。
        </p>
      </div>
    </div>
  </div>
</template>
