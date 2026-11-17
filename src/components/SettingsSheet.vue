<script setup>
// 设置抽屉：主题、默认首页、显示偏好，全部存 localStorage。
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import Icon from './Icon.vue';
import { resetSettings, settings, site } from '../lib/store';

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const tabs = computed(() => site.value?.tabs || []);

const THEMES = [
  { id: 'auto', label: '跟随系统', icon: 'monitor' },
  { id: 'light', label: '浅色', icon: 'sun' },
  { id: 'dark', label: '深色', icon: 'moon' },
];

function onKey(e) {
  if (e.key === 'Escape' && props.open) emit('close');
}

watch(
  () => props.open,
  (val) => {
    document.body.style.overflow = val ? 'hidden' : '';
  },
);

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mask" @click="emit('close')"></div>
    <aside v-if="open" class="sheet" role="dialog" aria-modal="true" aria-label="设置">
      <div class="sheet-head">
        <span class="sheet-title">设置</span>
        <button class="icon-btn" title="关闭 (Esc)" @click="emit('close')">
          <Icon name="x" :size="16" />
        </button>
      </div>

      <div class="sheet-body">
        <div class="setting-row">
          <div>
            <div class="setting-label">主题</div>
            <div class="setting-desc">跟随系统时，按操作系统的深浅色自动切换</div>
          </div>
        </div>
        <div class="segmented" style="margin: 6px 0 18px; width: 100%">
          <button
            v-for="t in THEMES"
            :key="t.id"
            :class="{ active: settings.theme === t.id }"
            style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px"
            @click="settings.theme = t.id"
          >
            <Icon :name="t.icon" :size="13" />
            {{ t.label }}
          </button>
        </div>

        <div v-if="tabs.length > 1" class="setting-row">
          <div>
            <div class="setting-label">默认首页</div>
            <div class="setting-desc">打开站点时自动进入的板块</div>
          </div>
          <select v-model="settings.defaultTab" class="input" style="width: 132px; height: 32px">
            <option value="">记住上次</option>
            <option v-for="t in tabs" :key="t.id" :value="t.id">{{ t.label }}</option>
          </select>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-label">显示站点描述</div>
            <div class="setting-desc">关掉后卡片更紧凑，只显示名称</div>
          </div>
          <button
            class="switch"
            :class="{ on: settings.showDesc }"
            role="switch"
            :aria-checked="settings.showDesc"
            @click="settings.showDesc = !settings.showDesc"
          ></button>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-label">键盘快捷键</div>
            <div class="setting-desc">⌘K / Ctrl+K 搜索，数字键切换板块</div>
          </div>
          <button
            class="switch"
            :class="{ on: settings.shortcuts }"
            role="switch"
            :aria-checked="settings.shortcuts"
            @click="settings.shortcuts = !settings.shortcuts"
          ></button>
        </div>

        <div class="setting-row" style="border-bottom: 0">
          <div>
            <div class="setting-label">恢复默认设置</div>
            <div class="setting-desc">不会影响 JSON 数据</div>
          </div>
          <button class="btn" @click="resetSettings">重置</button>
        </div>

        <div class="note" style="margin-top: 22px">设置只保存在当前浏览器，换设备或清除缓存后需要重新调整。</div>
      </div>
    </aside>
  </Teleport>
</template>
