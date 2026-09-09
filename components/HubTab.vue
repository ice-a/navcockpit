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
  { id: 'servers', label: '⚡ AI 直连平台' },
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
    { key: 'name', label: '平台名称', required: true },
    { key: 'category', label: '分类（官方 / 国内 / 国际）' },
    { key: 'url', label: '接入地址' },
    { key: 'region', label: '区域' },
    { key: 'desc', label: '说明' },
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

// ===== AI 辅助录入（仅后台：所有 /api/ai/* 与 /api/tools/summarize 均需管理密码） =====
const aiBusy = ref(false);
function aiCfg() {
  return settings.aiConfig.baseURL
    ? { baseURL: settings.aiConfig.baseURL, apiKey: settings.aiConfig.apiKey, model: settings.aiConfig.model }
    : undefined;
}
// 按当前表单生成内容并回填（工具/Skills/VPN/AI直连平台/教程）
async function aiFill() {
  const { coll } = editing.value;
  aiBusy.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/ai/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ coll, fields: { ...form.value }, config: aiCfg() }),
    });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(b.message || `HTTP ${res.status}`);
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined || v === null) continue;
      if (k === 'tags') form.value.tags = Array.isArray(v) ? v.join('，') : v;
      else if (k === 'detail') form.value.detail = Array.isArray(v) ? v.join('\n') : v;
      else form.value[k] = v;
    }
    toast('AI 已生成并回填，检查后保存', 'success');
  } catch (e) {
    error.value = `AI 生成失败：${e.message}`;
  } finally {
    aiBusy.value = false;
  }
}
// 教程编辑器内：润色 / 续写 / 生成摘要
async function aiWrite(action) {
  aiBusy.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/tools/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ content: form.value.content || '', mode: action, config: aiCfg() }),
    });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(b.message || `HTTP ${res.status}`);
    if (action === 'summary') {
      form.value.summary = (b.text || '').trim();
      toast('摘要已生成并回填', 'success');
    } else if (action === 'polish') {
      form.value.content = b.text;
      toast('润色完成', 'success');
    } else {
      form.value.content = `${(form.value.content || '').replace(/\s*$/, '')}\n\n${b.text}`;
      toast('已续写并追加到正文末尾', 'success');
    }
  } catch (e) {
    error.value = `AI 操作失败：${e.message}`;
  } finally {
    aiBusy.value = false;
  }
}
// 教程 Markdown 实时预览
const previewHtml = computed(() => {
  try {
    return marked.parse(form.value.content || '');
  } catch {
    return '';
  }
});

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
  form.value = { status: activeSection.value === 'tutorials' ? 'published' : 'active', sort: 0 };
  editing.value = { coll: activeSection.value, doc: null };
}

async function openEdit(item) {
  form.value = { ...item };
  editing.value = { coll: activeSection.value, doc: item };
  // 教程列表接口不带正文，编辑前先拉全文，避免保存时把正文覆盖为空
  if (activeSection.value === 'tutorials') {
    try {
      const res = await fetch(`/api/hub/tutorials/${item._id}`);
      if (res.ok) form.value.content = (await res.json()).content || '';
    } catch {}
  }
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
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
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

    <!-- 通用编辑弹窗：教程 = 宽幅 Markdown 编辑器，其余 = 普通表单 -->
    <div v-if="editing" class="modal-mask" @click.self="editing = null">
      <!-- 教程：左写右预览 + AI 辅助写作 -->
      <div v-if="editing.coll === 'tutorials'" class="modal wide">
        <h3>{{ editing.doc ? '编辑' : '新增' }}教程</h3>
        <div class="field-row">
          <label>标题 *</label>
          <input v-model="form.title" type="text" placeholder="教程标题" />
        </div>
        <div class="field-row3">
          <div>
            <label>分类</label>
            <input v-model="form.category" type="text" placeholder="如：Claude Code / 部署 / 逆向" />
          </div>
          <div>
            <label>状态</label>
            <select v-model="form.status">
              <option value="published">published</option>
              <option value="draft">draft</option>
            </select>
          </div>
          <div>
            <label>排序</label>
            <input v-model="form.sort" type="number" />
          </div>
        </div>
        <div class="tut-toolbar">
          <button class="btn small" :disabled="aiBusy" @click="aiFill">✨ AI 生成全文</button>
          <button class="btn small" :disabled="aiBusy" @click="aiWrite('polish')">润色</button>
          <button class="btn small" :disabled="aiBusy" @click="aiWrite('continue')">续写</button>
          <button class="btn small" :disabled="aiBusy" @click="aiWrite('summary')">生成摘要</button>
          <span v-if="aiBusy" class="ai-hint">AI 处理中…</span>
        </div>
        <div class="field-row">
          <label>摘要</label>
          <input v-model="form.summary" type="text" placeholder="卡片上显示的一句话摘要，可用「生成摘要」自动回填" />
        </div>
        <div class="field-row">
          <label>标签（逗号分隔）</label>
          <input v-model="form.tags" type="text" placeholder="用逗号分隔" />
        </div>
        <div class="tut-editor">
          <textarea v-model="form.content" class="tut-input" placeholder="Markdown 正文，右侧实时预览"></textarea>
          <div class="tut-preview tutorial-content" v-html="previewHtml"></div>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="editing = null">取消</button>
          <button class="btn primary" @click="saveEdit">保存</button>
        </div>
      </div>

      <!-- 其他集合：普通表单 + AI 生成回填 -->
      <div v-else class="modal">
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
        <div class="ai-assist">
          <button class="btn small" :disabled="aiBusy" @click="aiFill">
            {{ aiBusy ? 'AI 生成中…' : '✨ AI 生成' }}
          </button>
          <span class="ai-hint">根据名称/链接生成描述、标签等并回填（仅后台可用；需在设置里配置 AI 或服务端 GlobalAi）</span>
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
          <template v-if="adminMode">
            <button class="btn small" :disabled="aiLoading === 'summary'" @click="aiAction('summary')">AI 摘要</button>
            <button class="btn small" :disabled="aiLoading === 'polish'" @click="aiAction('polish')">AI 润色</button>
            <button v-if="aiOutput" class="btn small" @click="applyAiOutput">把润色结果存回正文</button>
          </template>
        </div>
        <div v-if="aiOutput" class="ai-box"><div class="ai-result">{{ aiOutput }}</div></div>
        <div class="modal-footer">
          <button class="btn" @click="detail = null">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>
