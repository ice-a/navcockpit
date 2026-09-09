<script setup>
// 右上角全局设置抽屉。直接读写 useSettings 的响应式 state（改动即时生效并持久化）。
import { useSettings } from '~/lib/useSettings';
import { TABS } from '~/lib/tabs';
import { useToast } from '~/lib/useToast';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close']);

const { settings, reset, exportSettings, importSettings } = useSettings();
const { toast } = useToast();

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
  <transition name="fade">
    <div v-if="open" class="drawer-mask" @click.self="close">
      <aside class="drawer">
        <div class="drawer-head">
          <h3>⚙ 全局设置</h3>
          <button class="icon-btn" @click="close">✕</button>
        </div>

        <div class="drawer-body">
          <!-- 外观 -->
          <div class="settings-group">
            <h4>外观</h4>
            <div class="settings-row">
              <div>
                <div class="label">主题</div>
                <div class="desc">auto 跟随系统</div>
              </div>
              <div class="seg ctrl">
                <button :class="{ active: settings.theme === 'dark' }" @click="settings.theme = 'dark'">深色</button>
                <button :class="{ active: settings.theme === 'light' }" @click="settings.theme = 'light'">浅色</button>
                <button :class="{ active: settings.theme === 'auto' }" @click="settings.theme = 'auto'">自动</button>
              </div>
            </div>
            <div class="settings-row">
              <div>
                <div class="label">默认首页标签</div>
                <div class="desc">留空则打开上次访问的标签</div>
              </div>
              <select class="ctrl" v-model="settings.defaultTab">
                <option value="">（不强制）</option>
                <option v-for="t in TABS" :key="t.id" :value="t.id">{{ t.icon }} {{ t.label }}</option>
              </select>
            </div>
          </div>

          <!-- DNS 看板 -->
          <div class="settings-group">
            <h4>Cloudflare DNS</h4>
            <div class="settings-row">
              <div class="label">自动刷新</div>
              <label class="switch ctrl">
                <input type="checkbox" v-model="settings.dnsAutoRefresh" />
                <span class="slider"></span>
              </label>
            </div>
            <div class="settings-row">
              <div>
                <div class="label">刷新间隔</div>
                <div class="desc">单位：秒</div>
              </div>
              <input class="ctrl" type="number" min="10" max="600" v-model.number="settings.dnsRefreshSeconds" />
            </div>
          </div>

          <!-- AI 配置 -->
          <div class="settings-group">
            <h4>AI 配置（替代数据库 globalais）</h4>
            <div class="settings-row" style="display:block">
              <div class="label">API Base URL</div>
              <input style="width:100%;margin-top:6px" type="text" v-model="settings.aiConfig.baseURL" placeholder="https://api.openai.com" />
            </div>
            <div class="settings-row" style="display:block">
              <div class="label">API Key</div>
              <input style="width:100%;margin-top:6px" type="password" v-model="settings.aiConfig.apiKey" placeholder="sk-..." />
            </div>
            <div class="settings-row" style="display:block">
              <div class="label">模型</div>
              <input style="width:100%;margin-top:6px" type="text" v-model="settings.aiConfig.model" placeholder="gpt-4o-mini" />
            </div>
          </div>

          <!-- 网站导航 -->
          <div class="settings-group">
            <h4>网站导航</h4>
            <div class="settings-row">
              <div>
                <div class="label">隐藏失效站点</div>
                <div class="desc">探活失败（离线）的链接不显示</div>
              </div>
              <label class="switch ctrl">
                <input type="checkbox" v-model="settings.hideDeadSites" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <!-- 人性化功能 -->
          <div class="settings-group">
            <h4>人性化功能</h4>
            <div class="settings-row">
              <div class="label">轻提示 Toast</div>
              <label class="switch ctrl"><input type="checkbox" v-model="settings.enableToast" /><span class="slider"></span></label>
            </div>
            <div class="settings-row">
              <div class="label">危险操作确认弹窗</div>
              <label class="switch ctrl"><input type="checkbox" v-model="settings.enableConfirm" /><span class="slider"></span></label>
            </div>
            <div class="settings-row">
              <div class="label">快捷键（1-7 切标签 / / 搜索 / g GitHub）</div>
              <label class="switch ctrl"><input type="checkbox" v-model="settings.enableShortcuts" /><span class="slider"></span></label>
            </div>
            <div class="settings-row">
              <div class="label">全局搜索（⌘K / Ctrl+K）</div>
              <label class="switch ctrl"><input type="checkbox" v-model="settings.enableGlobalSearch" /><span class="slider"></span></label>
            </div>
          </div>
        </div>

        <div class="drawer-foot">
          <label class="btn small" style="cursor:pointer">
            导入<input type="file" accept=".json" style="display:none" @change="doImport" />
          </label>
          <button class="btn small" @click="doExport">导出</button>
          <button class="btn small danger" @click="doReset">恢复默认</button>
        </div>
      </aside>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
