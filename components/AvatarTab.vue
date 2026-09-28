<script setup>
// 随机丑头像生成器（双/三引擎）。布局沿用：工具栏引擎分段 + 画布 + 控制区。
// 控件全部使用 Arco Design Vue，生成逻辑不变。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { IconSwap, IconPause, IconPlayArrow, IconDownload } from '@arco-design/web-vue/es/icon';
import { AvatarKit2 as KitA } from '~/lib/uglyavatar';
import { AvatarKit2 as KitB } from '~/lib/uglyavatar2';
import { AvatarKit2 as KitC } from '~/lib/uglyavatar-txstc55';
import ShareButton from '~/components/ShareButton.vue';

const canvas = ref(null);
const engine = ref('A');
const kit = computed(() => (engine.value === 'A' ? KitA : engine.value === 'B' ? KitB : KitC));

const species = ref('random');
const seedText = ref('');
const bgColor = ref('#151b2e');
const animating = ref(true);

const av = ref(null);
let rafId = null;
let ctx = null;

const speciesOptions = computed(() => [
  { label: '🎲 随机物种', value: 'random' },
  ...kit.value.SPECIES.filter((s) => s.id !== 'random').map((s) => ({ label: s.cn || s.id, value: s.id })),
]);

const bgOptions = [
  { label: '深色', value: '#151b2e' },
  { label: '白色', value: '#ffffff' },
  { label: '米黄', value: '#f5e6ca' },
  { label: '透明', value: 'transparent' },
];

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
  av.value = kit.value.generateAvatar(species.value, opts);
  if (!seedText.value.trim()) seedText.value = String(av.value.seed);
}

function redraw(t = performance.now() / 1000) {
  if (!ctx || !av.value) return;
  kit.value.renderAvatar(ctx, av.value, t, 320, { bgColor: bgColor.value === 'transparent' ? undefined : bgColor.value });
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
  kit.value.renderAvatar(out.getContext('2d'), av.value, performance.now() / 1000, 1024, {
    bgColor: bgColor.value === 'transparent' ? undefined : bgColor.value,
    transparent: bgColor.value === 'transparent',
  });
  out.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ugly-avatar-${engine.value}-${av.value.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}

onMounted(() => {
  const e = (new URLSearchParams(location.search).get('avatarEngine') || '').toUpperCase();
  if (e === 'A' || e === 'B' || e === 'C') engine.value = e;
  ctx = canvas.value.getContext('2d');
  generate();
  loop();
});

const sharePayload = computed(() => {
  const name = speciesOptions.value.find((s) => s.value === species.value)?.label || species.value;
  return {
    type: 'avatar',
    title: av.value ? '丑头像 #' + av.value.seed : '丑头像',
    desc: '引擎 ' + engine.value + ' · 物种' + String(name).replace(/^[^ ]+ /, ''),
    url: '',
    badge: '🎨 个性头像',
    avatar: { engine: engine.value, species: species.value, seed: av.value ? av.value.seed : 0 },
  };
});

onBeforeUnmount(() => cancelAnimationFrame(rafId));
</script>

<template>
  <div>
    <div class="toolbar">
      <span>引擎：</span>
      <a-radio-group v-model="engine" type="button" size="small" @change="generate">
        <a-radio value="A">GordenSun 有机风</a-radio>
        <a-radio value="B">方块怪风</a-radio>
        <a-radio value="C">txstc55 脸谱</a-radio>
      </a-radio-group>
    </div>

    <h2 class="zone">个性头像 <small>seed 可复现 · 可导出 1024×1024 PNG</small></h2>

    <div class="avatar-wrap">
      <div class="avatar-canvas-box">
        <canvas ref="canvas" width="320" height="320"></canvas>
      </div>

      <div class="avatar-controls">
        <div class="row">
          <label>物种/风格</label>
          <a-select v-model="species" class="ctl-flex" :options="speciesOptions" @change="generate" />
        </div>
        <div class="row">
          <label>Seed</label>
          <a-input v-model="seedText" class="ctl-flex" placeholder="留空随机" @keyup.enter="generate" />
          <a-button size="small" @click="generate">按 Seed 生成</a-button>
        </div>
        <div class="row">
          <label>背景</label>
          <a-select v-model="bgColor" class="ctl-flex" :options="bgOptions" />
        </div>
        <div class="row">
          <a-button type="primary" @click="regenerate">
            <template #icon><IconSwap /></template>
            随机一张
          </a-button>
          <a-button @click="animating = !animating">
            <template #icon>
              <IconPause v-if="animating" />
              <IconPlayArrow v-else />
            </template>
            {{ animating ? '暂停动画' : '播放动画' }}
          </a-button>
          <a-button @click="download">
            <template #icon><IconDownload /></template>
            下载 PNG
          </a-button>
          <ShareButton :payload="sharePayload" inline label="分享这张头像" />
        </div>
        <p class="avatar-tip">
          同一个 Seed 永远生成同一张头像，可以收藏喜欢的 Seed。
          默认引擎来自
          <a href="https://github.com/GordenSun/uglyAvatar" target="_blank" rel="noopener">GordenSun/uglyAvatar</a>；
          「方块怪风」为自带第二套生成器；「txstc55 脸谱」移植自
          <a href="https://github.com/txstc55/ugly-avatar" target="_blank" rel="noopener">txstc55/ugly-avatar</a>。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.avatar-controls .row { align-items: center; }
.avatar-controls label { font-size: 13px; color: var(--text-dim); flex: 0 0 64px; }
.avatar-controls .ctl-flex { flex: 1; min-width: 0; }
.avatar-tip { font-size: 12px; color: var(--text-dim); line-height: 1.6; margin: 4px 0 0; }
.avatar-tip a { color: var(--accent); }
</style>
