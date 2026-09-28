<script setup>
// 右上角全局设置抽屉。布局沿用：右侧抽屉 + 分组行 + 底部导入/导出/重置。
// 控件全部使用 Arco Design Vue；直接读写 useSettings 的响应式 state（改动即时生效并持久化）。
import { ref } from 'vue';
import { useSettings } from '~/lib/useSettings';
import { TABS, TAB_ICONS } from '~/lib/tabs';
import { useToast } from '~/lib/useToast';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close']);

const { settings, reset, exportSettings, importSettings } = useSettings();
const { toast } = useToast();
const fileEl = ref(null);

function close() {
  emit('close');
}

function doReset() {
  reset();
  toast('已恢复默认设置', 'success');
}

function doExport() {
  const blob = new Blob([JSON.stringify(exportSettings(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `app-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  toast('设置已导出', 'success');
}

function doImport(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  file.text().then((txt) => {
    try {
      importSettings(JSON.parse(txt));
      toast('设置已导入', 'success');
    } catch {
      toast('导入失败：不是合法 JSON', 'error');
    }
  });
  ev.target.value = '';
}
</script>

<template>
  <a-drawer :visible="open" :width="'min(420px, 92vw)'" placement="right" :footer="false" unmount-on-close @cancel="close">
    <template #title>全局设置</template>

    <div class="settings-group">
      <h4>外观</h4>
      <div class="settings-row">
        <div>
          <div class="label">主题</div>
          <div class="desc">auto 跟随系统</div>
        </div>
        <div class="ctrl">
          <a-radio-group v-model="settings.theme" type="button" size="small">
            <a-radio value="dark">深色</a-radio>
            <a-radio value="light">浅色</a-radio>
            <a-radio value="auto">自动</a-radio>
          </a-radio-group>
        </div>
      </div>
      <div class="settings-row">
        <div>
          <div class="label">默认首页标签</div>
          <div class="desc">打开站点时直达</div>
        </div>
        <div class="ctrl">
          <a-select v-model="settings.defaultTab" placeholder="打开上次访问的标签" size="small" style="min-width: 160px">
            <a-option value="">（不强制）</a-option>
            <a-option v-for="t in TABS" :key="t.id" :value="t.id">
              <span class="opt-icon"><component :is="TAB_ICONS[t.id]" /></span>{{ t.label }}
            </a-option>
          </a-select>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <h4>Cloudflare DNS</h4>
      <div class="settings-row">
        <div class="label">自动刷新</div>
        <div class="ctrl"><a-switch v-model="settings.dnsAutoRefresh" /></div>
      </div>
      <div class="settings-row">
        <div class="label">刷新间隔（秒）</div>
        <div class="ctrl"><a-input-number v-model="settings.dnsRefreshSeconds" :min="10" :max="600" size="small" style="width: 120px" /></div>
      </div>
    </div>

    <div class="settings-group">
      <h4>AI 配置</h4>
      <div class="settings-row">
        <div class="label">API Base URL</div>
        <div class="ctrl"><a-input v-model="settings.aiConfig.baseURL" placeholder="https://api.openai.com" size="small" /></div>
      </div>
      <div class="settings-row">
        <div class="label">API Key</div>
        <div class="ctrl"><a-input v-model="settings.aiConfig.apiKey" type="password" placeholder="sk-..." size="small" /></div>
      </div>
      <div class="settings-row">
        <div class="label">模型</div>
        <div class="ctrl"><a-input v-model="settings.aiConfig.model" placeholder="gpt-4o-mini" size="small" /></div>
      </div>
    </div>

    <div class="settings-group">
      <h4>网站导航</h4>
      <div class="settings-row">
        <div class="label">隐藏失效站点</div>
        <div class="ctrl"><a-switch v-model="settings.hideDeadSites" /></div>
      </div>
    </div>

    <div class="settings-group">
      <h4>人性化功能</h4>
      <div class="settings-row">
        <div class="label">轻提示 Toast</div>
        <div class="ctrl"><a-switch v-model="settings.enableToast" /></div>
      </div>
      <div class="settings-row">
        <div class="label">危险操作确认弹窗</div>
        <div class="ctrl"><a-switch v-model="settings.enableConfirm" /></div>
      </div>
      <div class="settings-row">
        <div>
          <div class="label">快捷键</div>
          <div class="desc">1-7 切标签 / / 搜索 / g GitHub</div>
        </div>
        <div class="ctrl"><a-switch v-model="settings.enableShortcuts" /></div>
      </div>
      <div class="settings-row">
        <div class="label">全局搜索（⌘K）</div>
        <div class="ctrl"><a-switch v-model="settings.enableGlobalSearch" /></div>
      </div>
    </div>

    <div class="drawer-foot">
      <a-button @click="() => fileEl?.click()">导入</a-button>
      <a-button @click="doExport">导出</a-button>
      <a-button status="danger" @click="doReset">恢复默认</a-button>
    </div>
    <input ref="fileEl" type="file" accept=".json" style="display: none" @change="doImport" />
  </a-drawer>
</template>

<style scoped>
.settings-row .ctrl { max-width: 60%; }
.settings-row .ctrl :deep(.arco-input-wrapper),
.settings-row .ctrl :deep(.arco-input-group),
.settings-row .ctrl :deep(.arco-select) { width: 180px; }
.opt-icon { display: inline-flex; align-items: center; margin-right: 6px; vertical-align: -2px; }
.drawer-foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
</style>
