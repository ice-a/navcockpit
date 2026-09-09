<script setup>
// AI 资源台：六类数据（中转站/工具/Skills/VPN/服务器/教程）存远程 MongoDB。
// 读公开、写需管理密码。本次重做为统一卡片网格 + 抽屉式编辑/详情，并接入全局 Toast / 确认弹窗 / 本地 AI 配置。
import { ref, computed, onMounted } from 'vue';
import { marked } from 'marked';
import { useSettings } from '~/lib/useSettings';
import { useToast } from '~/lib/useToast';
import { useConfirm } from '~/lib/useConfirm';

const { settings } = useSettings();
const { toast } = useToast();
const { confirm } = useConfirm();

const SECTIONS = [
  { id: 'stations', label: '🛰 中转站' },
  { id: 'tools', label: '🧰 工具' },
  { id: 'skills', label: '🧩 Skills' },
  { id: 'vpns', label: '🔒 VPN' },
  { id: 'servers', label: '🖥 服务器' },
  { id: 'tutorials', label: '📚 教程' },
];

const FIELDS = {
  stations: [
    { key: 'name', label: '名称', required: true },
    { key: 'baseURL', label: 'API Base URL', required: true, placeholder: 'https://api.example.com' },
    { key: 'siteURL', label: '站点直达地址', placeholder: 'https://example.com' },
    { key: 'apiKey', label: 'API Key（只存服务端 MongoDB，页面不回显）' },
    { key: 'keyId', label: 'Key 备注（如 sk-***abc）' },
    { key: 'desc', label: '描述' },
    { key: 'sort', label: '排序（小在前）', type: 'number' },
  ],
  tools: [
    { key: 'name', label: '名称', required: true },
    { key: 'home', label: '官网' },
    { key: 'install', label: '安装命令' },
    { key: 'tags', label: '标签（逗号分隔）', type: 'list' },
    { key: 'detail', label: '详细步骤（每行一条）', type: 'lines' },
    { key: 'desc', label: '描述' },
    { key: 'sort', label: '排序', type: 'number' },
  ],
  skills: [
    { key: 'name', label: '名称', required: true },
    { key: 'web', label: '链接' },
    { key: 'intro', label: '简介' },
    { key: 'desc', label: '备注' },
    { key: 'sort', label: '排序', type: 'number' },
  ],
  vpns: [
    { key: 'name', label: '名称', required: true },
    { key: 'url', label: '链接' },
    { key: 'desc', label: '描述' },
    { key: 'sort', label: '排序', type: 'number' },
  ],
  servers: [
    { key: 'name', label: '名称', required: true },
    { key: 'category', label: '分类（如：国内 / 国际）' },
    { key: 'url', label: '地址' },
    { key: 'region', label: '区域' },
    { key: 'desc', label: '描述' },
    { key: 'sort', label: '排序', type: 'number' },
  ],
  tutorials: [
    { key: 'title', label: '标题', required: true },
    { key: 'category', label: '分类' },
    { key: 'summary', label: '摘要' },
    { key: 'tags', label: '标签（逗号分隔）', type: 'list' },
    { key: 'content', label: '正文（Markdown）', type: 'textarea' },
    { key: 'status', label: '状态', type: 'select', options: ['published', 'draft'] },
    { key: 'sort', label: '排序', type: 'number' },
  ],
};

const activeSection = ref('stations');
const lists = ref({ stations: [], tools: [], skills: [], vpns: [], servers: [], tutorials: [] });
const loading = ref(false);
const error = ref('');

const adminMode = ref(false);
const pwdInput = ref('');
const pwdError = ref('');
const editing = ref(null);
const form = ref({});

const detail = ref(null);
const detailLoading = ref(false);

const aiLoading = ref('');
const aiOutput = ref('');

const currentList = computed(() => lists.value[activeSection.value] || []);
const adminHeaders = () => ({ 'x-admin-password': sessionStorage.getItem('admin_pwd') || '' });

async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    const results = await Promise.all(
      SECTIONS.map((s) =>
        fetch(`/api/hub/${s.id}`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ),
    );
    SECTIONS.forEach((s, i) => (lists.value[s.id] = results[i]));
  } finally {
    loading.value = false;
  }
}

async function login() {
  pwdError.value = '';
  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwdInput.value }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.message || `HTTP ${res.status}`);
    }
    sessionStorage.setItem('admin_pwd', pwdInput.value);
    adminMode.value = true;
    pwdInput.value = '';
    toast('已进入管理', 'success');
  } catch (e) {
    pwdError.value = e.message;
  }
}

function logout() {
  sessionStorage.removeItem('admin_pwd');
  adminMode.value = false;
  toast('已退出管理', 'info');
}

function openCreate() {
  form.value = { status: 'active', sort: 0 };
  editing.value = { coll: activeSection.value, doc: null };
}

function openEdit(item) {
  form.value = { ...item };
  editing.value = { coll: activeSection.value, doc: item };
}

async function saveEdit() {
  const { coll, doc } = editing.value;
  const body = { ...form.value };
  if (typeof body.tags === 'string') body.tags = body.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  if (typeof body.detail === 'string') body.detail = body.detail.split('\n').filter(Boolean);
  const url = doc ? `/api/hub/${coll}/${doc._id}` : `/api/hub/${coll}`;
  const res = await fetch(url, {
    method: doc ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    error.value = b.message || `保存失败 HTTP ${res.status}`;
    return;
  }
  editing.value = null;
  await loadAll();
  toast(doc ? '已更新' : '已新增', 'success');
}

async function remove(item) {
  const ok = await confirm(`确定删除「${item.name || item.title}」？`, { danger: true, confirmText: '删除' });
  if (!ok) return;
  await fetch(`/api/hub/${activeSection.value}/${item._id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  await loadAll();
  toast('已删除', 'success');
}

async function probeModels(item) {
  aiLoading.value = item._id;
  error.value = '';
  try {
    await fetch(`/api/hub/stations/${item._id}/models`, { method: 'POST', headers: adminHeaders() });
    await loadAll();
    toast('模型列表已更新', 'success');
  } catch (e) {
    error.value = `拉取模型失败：${e.message}`;
  } finally {
    aiLoading.value = '';
  }
}

async function healthCheck(item) {
  aiLoading.value = item._id;
  try {
    await fetch(`/api/hub/stations/${item._id}/health`, { method: 'POST' });
    await loadAll();
    toast('探活完成', 'success');
  } finally {
    aiLoading.value = '';
  }
}

async function openTutorial(item) {
  detailLoading.value = true;
  detail.value = { ...item, content: item.content || '' };
  try {
    const res = await fetch(`/api/hub/tutorials/${item._id}`);
    if (res.ok) detail.value = await res.json();
    fetch(`/api/hub/tutorials/${item._id}/view`, { method: 'POST' }).then(() => {
      if (detail.value) detail.value.views = (detail.value.views || 0) + 1;
    });
  } finally {
    detailLoading.value = false;
  }
}

async function likeTutorial() {
  if (!detail.value) return;
  const res = await fetch(`/api/hub/tutorials/${detail.value._id}/like`, { method: 'POST' });
  if (res.ok) {
    detail.value.likes = (detail.value.likes || 0) + 1;
    toast('已点赞', 'success');
  }
}

async function aiAction(mode) {
  if (!detail.value) return;
  aiLoading.value = mode;
  aiOutput.value = '';
  try {
    const res = await fetch('/api/tools/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: detail.value.content || detail.value.summary,
        mode,
        config: settings.aiConfig.baseURL
          ? { baseURL: settings.aiConfig.baseURL, apiKey: settings.aiConfig.apiKey, model: settings.aiConfig.model }
          : undefined,
      }),
    });
    const b = await res.json();
    if (!res.ok) throw new Error(b.message || `HTTP ${res.status}`);
    aiOutput.value = b.text;
  } catch (e) {
    error.value = `AI 操作失败：${e.message}`;
  } finally {
    aiLoading.value = '';
  }
}

async function applyAiOutput() {
  if (!detail.value || !aiOutput.value) return;
  form.value = { ...detail.value, content: aiOutput.value };
  editing.value = { coll: 'tutorials', doc: detail.value };
  detail.value = null;
  toast('已载入编辑器，保存后生效', 'info');
}

async function exportBackup() {
  const res = await fetch('/api/hub/backup', { headers: adminHeaders() });
  if (!res.ok) return;
  const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  toast('备份已导出', 'success');
}

async function importBackup(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const res = await fetch('/api/hub/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: text,
  });
  if (res.ok) {
    await loadAll();
    toast('导入成功', 'success');
  } else {
    error.value = '导入失败：' + (await res.json().catch(() => ({}))).message;
  }
  ev.target.value = '';
}

onMounted(loadAll);
</script>

<template>
  <div>
    <div class="toolbar">
      <div class="cat-row" style="margin: 0">
        <button
          v-for="s in SECTIONS"
          :key="s.id"
          class="cat-chip"
          :class="{ active: activeSection === s.id }"
          @click="activeSection = s.id"
        >
          {{ s.label }}
        </button>
      </div>
      <span style="flex: 1"></span>
      <template v-if="adminMode">
        <button class="btn small" @click="openCreate">＋ 新增</button>
        <button class="btn small" @click="exportBackup">⬇ 导出备份</button>
        <label class="btn small" style="cursor: pointer">
          ⬆ 导入备份<input type="file" accept=".json" style="display: none" @change="importBackup" />
        </label>
        <button class="btn small" @click="logout">退出管理</button>
      </template>
      <template v-else>
        <input v-model="pwdInput" type="password" placeholder="管理密码" style="width: 140px" @keyup.enter="login" />
        <button class="btn small primary" @click="login">进入管理</button>
      </template>
    </div>
    <div v-if="pwdError" class="notice">{{ pwdError }}</div>
    <div v-if="error" class="error">⚠️ {{ error }}</div>

    <!-- 中转站 -->
    <div v-if="activeSection === 'stations'" class="hub-grid">
      <div v-for="s in currentList" :key="s._id" class="hub-card">
        <h3>
          <span class="status-dot" :class="s.status"></span>
          {{ s.name }}
          <span v-if="s.isGlobalAi" class="chip cf">全局AI</span>
        </h3>
        <div class="desc">{{ s.desc || s.baseURL }}</div>
        <div class="models" v-if="s.models?.length">🧠 {{ s.models.slice(0, 6).join(' / ') }}{{ s.models.length > 6 ? ` 等 ${s.models.length} 个` : '' }}</div>
        <div class="actions">
          <a v-if="s.siteURL" class="btn small" :href="s.siteURL" target="_blank" rel="noopener">直达 ↗</a>
          <button class="btn small" :disabled="aiLoading === s._id" @click="healthCheck(s)">
            {{ aiLoading === s._id ? '…' : '探活' }}
          </button>
          <template v-if="adminMode">
            <button class="btn small" :disabled="aiLoading === s._id" @click="probeModels(s)">拉模型</button>
            <button class="btn small" @click="openEdit(s)">编辑</button>
            <button class="btn small danger" @click="remove(s)">删</button>
          </template>
        </div>
      </div>
    </div>

    <!-- 通用卡片：工具/Skills/VPN/服务器 -->
    <div v-else-if="activeSection !== 'tutorials'" class="hub-grid">
      <div v-for="item in currentList" :key="item._id" class="hub-card">
        <h3>
          <span class="status-dot" :class="item.status"></span>
          {{ item.name }}
        </h3>
        <div class="desc">{{ item.desc || item.intro || item.summary || item.region || '' }}</div>
        <div class="models" v-if="item.tags?.length">{{ item.tags.join(' · ') }}</div>
        <div class="actions">
          <a v-if="item.home || item.web || item.url" class="btn small" :href="item.home || item.web || item.url" target="_blank" rel="noopener">打开 ↗</a>
          <template v-if="adminMode">
            <button class="btn small" @click="openEdit(item)">编辑</button>
            <button class="btn small danger" @click="remove(item)">删</button>
          </template>
        </div>
      </div>
    </div>

    <!-- 教程 -->
    <div v-else class="hub-grid">
      <div v-for="t in currentList" :key="t._id" class="hub-card" @click="openTutorial(t)" style="cursor: pointer">
        <h3>
          <span class="status-dot" :class="t.status"></span>
          {{ t.title }}
        </h3>
        <div class="desc">{{ t.summary }}</div>
        <div class="models">{{ t.views || 0 }} 浏览 · {{ t.likes || 0 }} 点赞</div>
        <div class="actions" v-if="adminMode" @click.stop>
          <button class="btn small" @click="openEdit(t)">编辑</button>
          <button class="btn small danger" @click="remove(t)">删</button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">正在从 MongoDB 读取…</div>
    <div v-else-if="!currentList.length" class="empty">暂无数据{{ adminMode ? '，点右上角「新增」创建' : '' }}</div>

    <!-- 通用编辑弹窗 -->
    <div v-if="editing" class="modal-mask" @click.self="editing = null">
      <div class="modal">
        <h3>{{ editing.doc ? '编辑' : '新增' }}{{ SECTIONS.find((s) => s.id === editing.coll)?.label.slice(2) }}</h3>
        <div v-for="f in FIELDS[editing.coll]" :key="f.key" class="field-row">
          <label>{{ f.label }}{{ f.required ? ' *' : '' }}</label>
          <textarea v-if="f.type === 'textarea'" v-model="form[f.key]" rows="12"></textarea>
          <textarea v-else-if="f.type === 'lines'" v-model="form[f.key]" rows="4" placeholder="每行一条"></textarea>
          <select v-else-if="f.type === 'select'" v-model="form[f.key]">
            <option v-for="o in f.options" :key="o" :value="o">{{ o }}</option>
          </select>
          <input v-else v-model="form[f.key]" :type="f.type === 'number' ? 'number' : 'text'" :placeholder="f.placeholder" />
        </div>
        <div class="modal-footer">
          <button class="btn" @click="editing = null">取消</button>
          <button class="btn primary" @click="saveEdit">保存</button>
        </div>
      </div>
    </div>

    <!-- 教程详情弹窗 -->
    <div v-if="detail" class="modal-mask" @click.self="detail = null">
      <div class="modal" style="width: min(860px, 100%)">
        <h3>{{ detail.title }} <small style="color: var(--text-dim); font-weight: 400">{{ detail.views || 0 }} 浏览 · {{ detail.likes || 0 }} 点赞</small></h3>
        <div class="tutorial-content" v-html="marked.parse(detail.content || detail.summary || '')"></div>
        <div class="toolbar" style="margin-top: 12px">
          <button class="btn small" @click="likeTutorial">👍 点赞</button>
          <button class="btn small" :disabled="aiLoading === 'summary'" @click="aiAction('summary')">AI 摘要</button>
          <button class="btn small" :disabled="aiLoading === 'polish'" @click="aiAction('polish')">AI 润色</button>
          <button v-if="adminMode && aiOutput" class="btn small" @click="applyAiOutput">把润色结果存回正文</button>
        </div>
        <div v-if="aiOutput" class="ai-box"><div class="ai-result">{{ aiOutput }}</div></div>
        <div class="modal-footer">
          <button class="btn" @click="detail = null">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>
