<script setup>
// AI 资源台：数据存远程 MongoDB。读公开、写需管理密码。
// 板块（顶部那排）由 /api/hub/boards 动态提供：内置 6 个 + 管理员自建。
// 布局沿用：板块工具栏 + 卡片网格 + 编辑弹窗 / 教程详情弹窗 / 登录弹窗 / 板块管理抽屉。
// 控件全部使用 Arco Design Vue。
import { ref, computed, onMounted } from 'vue';
import {
  IconPlus, IconDownload, IconUpload, IconEdit, IconDelete, IconLaunch,
  IconThumbUp, IconMenu, IconDragDotVertical, IconBulb,
} from '@arco-design/web-vue/es/icon';
import { marked } from 'marked';
import { useSettings } from '~/lib/useSettings';
import { useToast } from '~/lib/useToast';
import { useAdmin } from '~/lib/useAdmin';
import { BOARD_ICON_KEYS, boardIcon } from '~/lib/boardIcons';
import ShareButton from '~/components/ShareButton.vue';
import draggable from 'vuedraggable';

const { settings } = useSettings();
const { toast } = useToast();
const { adminMode, adminHeaders, login, logout } = useAdmin();

const boards = ref([]);
const activeSection = ref('stations');
const lists = ref({});
const loading = ref(false);

// 内置板块的专属表单；自定义板块用 GENERIC_FIELDS
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
  ],
};
const GENERIC_FIELDS = [
  { key: 'name', label: '名称', required: true },
  { key: 'url', label: '链接' },
  { key: 'tags', label: '标签（逗号分隔）', type: 'list' },
  { key: 'detail', label: '详细步骤（每行一条）', type: 'lines' },
  { key: 'desc', label: '描述' },
  { key: 'sort', label: '排序', type: 'number' },
];
const fieldsOf = (coll) => FIELDS[coll] || GENERIC_FIELDS;
const isBuiltin = (coll) => Object.prototype.hasOwnProperty.call(FIELDS, coll);

const showLogin = ref(false);
const pwdInput = ref('');
const pwdError = ref('');
const editing = ref(null);
const form = ref({});
const backupInput = ref(null);

const detail = ref(null);
const detailLoading = ref(false);
const aiBusy = ref(false);

const currentBoard = computed(() => boards.value.find((b) => b.key === activeSection.value) || null);
const currentList = computed(() => lists.value[activeSection.value] || []);

const aiCfg = () =>
  settings.aiConfig.baseURL
    ? { baseURL: settings.aiConfig.baseURL, apiKey: settings.aiConfig.apiKey, model: settings.aiConfig.model }
    : undefined;

function errToast(prefix, e) {
  const m = String(e?.message || e || '未知错误');
  if (m.length > 200) console.error('[操作失败]', m);
  toast(prefix + m.slice(0, 200), 'error');
}

// ===================== 数据加载 =====================
async function loadBoards() {
  const list = await fetch('/api/hub/boards').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  boards.value = list;
  if (!list.some((b) => b.key === activeSection.value)) {
    activeSection.value = list[0]?.key || '';
  }
}

async function loadAll() {
  loading.value = true;
  try {
    await loadBoards();
    const results = await Promise.all(
      boards.value.map((b) => fetch(`/api/hub/${b.key}`).then((r) => (r.ok ? r.json() : [])).catch(() => [])),
    );
    const next = {};
    boards.value.forEach((b, i) => { next[b.key] = results[i]; });
    lists.value = next;
  } finally {
    loading.value = false;
  }
}
onMounted(loadAll);

function openUrl(item) {
  return item.siteURL || item.home || item.web || item.url || '';
}
function itemDesc(item) {
  return item.desc || item.intro || item.summary || item.region || '';
}
function statusBadge(item) {
  if (item.status === 'active' || item.status === 'published') return 'success';
  if (item.status === 'draft') return 'warning';
  return 'danger';
}

// ===================== 登录 =====================
async function doLogin() {
  pwdError.value = '';
  try {
    await login(pwdInput.value);
    showLogin.value = false;
    pwdInput.value = '';
  } catch (e) {
    pwdError.value = e.message;
  }
}

// ===================== 条目 CRUD =====================
function openCreate() {
  form.value = { status: activeSection.value === 'tutorials' ? 'published' : 'active', sort: 0 };
  editing.value = { coll: activeSection.value, doc: null };
}

async function openEdit(item) {
  // 数组字段（tags 等）在表单里用「逗号分隔的字符串」编辑，保存时再拆回数组
  const draft = { ...item };
  for (const f of fieldsOf(activeSection.value)) {
    if (f.type === 'list' && Array.isArray(draft[f.key])) draft[f.key] = draft[f.key].join('，');
  }
  form.value = draft;
  editing.value = { coll: activeSection.value, doc: item };
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
  const res = await fetch(url, { method: doc ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: JSON.stringify(body) });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    return errToast('保存失败：', new Error(b.message || `HTTP ${res.status}`));
  }
  editing.value = null;
  await loadAll();
  toast(doc ? '已更新' : '已新增', 'success');
}

async function remove(item) {
  const res = await fetch(`/api/hub/${activeSection.value}/${item._id}`, { method: 'DELETE', headers: adminHeaders() });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    return errToast('删除失败：', new Error(b.message || `HTTP ${res.status}`));
  }
  await loadAll();
  toast('已删除', 'success');
}

// ===================== 板块管理 =====================
const showBoardMgr = ref(false);
const boardForm = ref({ open: false, editing: null, key: '', name: '', icon: 'apps', sort: 0 });
const boardSaving = ref(false);

function openAddBoard() {
  boardForm.value = { open: true, editing: null, key: '', name: '', icon: 'apps', sort: boards.value.length };
}
function openEditBoard(b) {
  boardForm.value = { open: true, editing: b.key, key: b.key, name: b.name, icon: b.icon || 'apps', sort: b.sort };
}

async function saveBoard() {
  const f = boardForm.value;
  if (!f.name.trim()) return toast('板块名称不能为空', 'error');
  boardSaving.value = true;
  try {
    const res = f.editing
      ? await fetch(`/api/hub/boards/${encodeURIComponent(f.editing)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...adminHeaders() },
          body: JSON.stringify({ name: f.name, icon: f.icon, sort: Number(f.sort) || 0 }),
        })
      : await fetch('/api/hub/boards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...adminHeaders() },
          body: JSON.stringify({ name: f.name, icon: f.icon, sort: Number(f.sort) || 0 }),
        });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(b.message || `HTTP ${res.status}`);
    boardForm.value.open = false;
    await loadAll();
    toast(f.editing ? '板块已更新' : '已新增板块', 'success');
  } catch (e) {
    errToast('保存板块失败：', e);
  } finally {
    boardSaving.value = false;
  }
}

async function deleteBoard(b) {
  const res = await fetch(`/api/hub/boards/${encodeURIComponent(b.key)}`, { method: 'DELETE', headers: adminHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return errToast('删除板块失败：', new Error(body.message || `HTTP ${res.status}`));
  if (activeSection.value === b.key) activeSection.value = '';
  await loadAll();
  toast(`已删除板块${body.removedItems ? `（连同 ${body.removedItems} 条内容）` : ''}`, 'success');
}

// 拖拽排序后保存
async function saveBoardOrder() {
  const order = boards.value.map((b, i) => ({ key: b.key, sort: i }));
  const res = await fetch('/api/hub/boards/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: JSON.stringify({ order }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    errToast('保存板块顺序失败：', new Error(b.message || `HTTP ${res.status}`));
    await loadBoards();
    return;
  }
  toast('板块顺序已保存', 'success');
}

// ===================== 中转站 / 教程专属 =====================
async function probeModels(item) {
  aiBusy.value = item._id;
  try {
    const res = await fetch(`/api/hub/stations/${item._id}/models`, { method: 'POST', headers: adminHeaders() });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.message || `HTTP ${res.status}`);
    }
    await loadAll();
    toast('模型列表已更新', 'success');
  } catch (e) {
    errToast('拉取模型失败：', e);
  } finally {
    aiBusy.value = '';
  }
}

async function healthCheck(item) {
  aiBusy.value = item._id;
  try {
    const res = await fetch(`/api/hub/stations/${item._id}/health`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await loadAll();
    toast('探活完成', 'success');
  } catch (e) {
    errToast('探活失败：', e);
  } finally {
    aiBusy.value = '';
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

// ===================== AI 辅助 =====================
async function aiFill() {
  const { coll } = editing.value;
  aiBusy.value = true;
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
    errToast('AI 生成失败：', e);
  } finally {
    aiBusy.value = false;
  }
}

async function aiWrite(action) {
  aiBusy.value = true;
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
    errToast('AI 操作失败：', e);
  } finally {
    aiBusy.value = false;
  }
}

const previewHtml = computed(() => {
  try {
    return marked.parse(form.value.content || '');
  } catch {
    return '';
  }
});

async function aiAction(mode) {
  if (!detail.value) return;
  aiBusy.value = mode;
  try {
    const res = await fetch('/api/tools/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ content: detail.value.content || detail.value.summary, mode, config: aiCfg() }),
    });
    const b = await res.json();
    if (!res.ok) throw new Error(b.message || `HTTP ${res.status}`);
    detail.value._aiOutput = b.text;
  } catch (e) {
    errToast('AI 操作失败：', e);
  } finally {
    aiBusy.value = '';
  }
}

function applyAiOutput() {
  if (!detail.value || !detail.value._aiOutput) return;
  form.value = { ...detail.value, content: detail.value._aiOutput };
  editing.value = { coll: 'tutorials', doc: detail.value };
  detail.value = null;
  toast('已载入编辑器，保存后生效', 'info');
}

// ===================== 备份 / 分享 =====================
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
  const res = await fetch('/api/hub/backup', { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: text });
  if (res.ok) {
    await loadAll();
    toast('导入成功', 'success');
  } else {
    const b = await res.json().catch(() => ({}));
    errToast('导入失败：', new Error(b.message || `HTTP ${res.status}`));
  }
  ev.target.value = '';
}

function sharePayload(item) {
  const coll = activeSection.value;
  return {
    type: 'hub',
    coll,
    refId: item._id,
    title: item.name || item.title || '未命名',
    desc: itemDesc(item),
    url: openUrl(item),
    badge: currentBoard.value?.name || '分享',
  };
}
</script>

<template>
  <div class="hub-wrap">
    <div class="toolbar hub-toolbar">
      <div class="cat-row">
        <a-button
          v-for="b in boards"
          :key="b.key"
          size="small"
          shape="round"
          :type="activeSection === b.key ? 'primary' : 'secondary'"
          @click="activeSection = b.key"
        >
          <template #icon><component :is="boardIcon(b.icon)" /></template>
          {{ b.name }}
        </a-button>
      </div>
      <span class="spacer"></span>
      <div class="admin-bar">
        <template v-if="adminMode">
          <a-button size="small" type="primary" @click="openCreate">
            <template #icon><IconPlus /></template>
            新增
          </a-button>
          <a-button size="small" @click="showBoardMgr = true">
            <template #icon><IconMenu /></template>
            管理板块
          </a-button>
          <a-button size="small" @click="exportBackup">
            <template #icon><IconDownload /></template>
            导出备份
          </a-button>
          <a-button size="small" @click="() => backupInput?.click()">
            <template #icon><IconUpload /></template>
            导入备份
          </a-button>
          <a-button size="small" @click="logout">退出管理</a-button>
        </template>
        <a-button v-else size="small" @click="showLogin = true">进入管理</a-button>
      </div>
    </div>

    <div v-if="loading" class="loading"><a-spin /></div>
    <a-empty v-else-if="!boards.length" description="还没有板块，进入管理后可新增" />
    <a-empty v-else-if="!currentList.length" :description="`「${currentBoard?.name || ''}」暂无数据${adminMode ? '，点右上角「新增」创建' : ''}`" />

    <div v-else class="hub-grid">
      <a-card
        v-for="item in currentList"
        :key="item._id"
        size="small"
        hoverable
        class="hub-card"
        :body-style="{ padding: '16px', height: '100%' }"
      >
        <div class="hub-head">
          <a-badge :status="statusBadge(item)" />
          <span class="hub-title">{{ item.name || item.title }}</span>
          <a-tag v-if="item.isGlobalAi" size="small" color="orange">全局AI</a-tag>
        </div>
        <div class="hub-desc">{{ itemDesc(item) }}</div>
        <div v-if="item.models?.length" class="hub-meta">
          {{ item.models.slice(0, 6).join(' / ') }}{{ item.models.length > 6 ? ` 等 ${item.models.length} 个` : '' }}
        </div>
        <div v-else-if="item.tags?.length" class="hub-meta">{{ item.tags.join(' · ') }}</div>
        <div class="actions">
          <ShareButton :payload="sharePayload(item)" :label="`分享 ${item.name || item.title}`" />
          <div class="actions-right">
            <a-button v-if="activeSection === 'tutorials'" size="mini" type="text" @click="openTutorial(item)">阅读</a-button>
            <a-button v-if="openUrl(item)" size="mini" type="text" :href="openUrl(item)" target="_blank" rel="noopener">
              <template #icon><IconLaunch /></template>
              打开
            </a-button>
            <template v-if="item.status === 'active' || item.status === 'published' || activeSection !== 'stations'">
              <a-button v-if="activeSection === 'stations'" size="mini" type="text" @click="healthCheck(item)">{{ aiBusy === item._id ? '…' : '探活' }}</a-button>
              <a-button v-if="adminMode" size="mini" type="text" @click="openEdit(item)">
                <template #icon><IconEdit /></template>
                编辑
              </a-button>
              <a-popconfirm v-if="adminMode" content="确定删除？" @ok="remove(item)">
                <a-button size="mini" type="text" status="danger">
                  <template #icon><IconDelete /></template>
                </a-button>
              </a-popconfirm>
            </template>
            <a-button v-if="activeSection === 'stations' && adminMode" size="mini" type="text" @click="probeModels(item)">拉模型</a-button>
          </div>
        </div>
      </a-card>
    </div>

    <!-- 条目编辑弹窗（教程走宽弹窗 + 双栏编辑器） -->
    <a-modal
      :visible="!!editing"
      :width="editing?.coll === 'tutorials' ? 'min(1100px, 96vw)' : 'min(680px, 96vw)'"
      :footer="false"
      :title="(editing?.doc ? '编辑' : '新增') + (currentBoard?.name || '')"
      :body-style="{ maxHeight: '76vh', overflow: 'auto' }"
      unmount-on-close
      @cancel="editing = null"
    >
      <template v-if="editing">
        <!-- 通用表单（内置非教程板块 + 自定义板块） -->
        <div v-if="editing.coll !== 'tutorials'" class="form-col">
          <div v-for="f in fieldsOf(editing.coll)" :key="f.key" class="field-row">
            <label>{{ f.label }}{{ f.required ? ' *' : '' }}</label>
            <a-input v-if="!f.type" v-model="form[f.key]" :placeholder="f.placeholder" />
            <a-input v-else-if="f.type === 'list'" v-model="form[f.key]" placeholder="多个值用逗号分隔" />
            <a-textarea v-else-if="f.type === 'textarea'" v-model="form[f.key]" :auto-size="{ minRows: 8 }" />
            <a-textarea v-else-if="f.type === 'lines'" v-model="form[f.key]" :auto-size="{ minRows: 4 }" placeholder="每行一条" />
            <a-select v-else-if="f.type === 'select'" v-model="form[f.key]" :options="f.options.map((o) => ({ label: o, value: o }))" />
            <a-input-number v-else-if="f.type === 'number'" v-model="form[f.key]" :min="0" style="width: 100%" />
          </div>
          <div class="ai-assist">
            <a-button size="small" :loading="aiBusy" @click="aiFill">
              <template #icon><IconBulb /></template>
              {{ aiBusy ? 'AI 生成中…' : 'AI 生成' }}
            </a-button>
            <span class="ai-hint">根据名称/链接生成描述、标签等并回填（仅后台可用）</span>
          </div>
        </div>

        <!-- 教程编辑器 -->
        <div v-else class="form-col">
          <div class="field-row">
            <label>标题 *</label>
            <a-input v-model="form.title" />
          </div>
          <div class="field-row3">
            <div class="col">
              <label>分类</label>
              <a-input v-model="form.category" />
            </div>
            <div class="col">
              <label>状态</label>
              <a-select v-model="form.status" :options="[{ label: 'published', value: 'published' }, { label: 'draft', value: 'draft' }]" />
            </div>
            <div class="col">
              <label>排序</label>
              <a-input-number v-model="form.sort" :min="0" style="width: 100%" />
            </div>
          </div>
          <div class="tut-toolbar">
            <a-button size="small" :loading="aiBusy" @click="aiFill">
              <template #icon><IconBulb /></template>
              AI 生成全文
            </a-button>
            <a-button size="small" :loading="aiBusy" @click="aiWrite('polish')">润色</a-button>
            <a-button size="small" :loading="aiBusy" @click="aiWrite('continue')">续写</a-button>
            <a-button size="small" :loading="aiBusy" @click="aiWrite('summary')">生成摘要</a-button>
          </div>
          <div class="field-row">
            <label>摘要</label>
            <a-input v-model="form.summary" />
          </div>
          <div class="field-row">
            <label>标签（逗号分隔）</label>
            <a-input v-model="form.tags" />
          </div>
          <div class="tut-editor">
            <a-textarea v-model="form.content" class="tut-input" placeholder="正文（Markdown）" />
            <div class="tut-preview" v-html="previewHtml"></div>
          </div>
        </div>

        <div class="modal-footer">
          <a-button @click="editing = null">取消</a-button>
          <a-button type="primary" @click="saveEdit">保存</a-button>
        </div>
      </template>
    </a-modal>

    <!-- 教程详情弹窗 -->
    <a-modal
      :visible="!!detail"
      :width="'min(760px, 96vw)'"
      :footer="false"
      :title="detail?.title"
      :body-style="{ maxHeight: '76vh', overflow: 'auto' }"
      unmount-on-close
      @cancel="detail = null"
    >
      <template v-if="detail">
        <div class="detail-meta">{{ detail.views || 0 }} 浏览 · {{ detail.likes || 0 }} 点赞</div>
        <div v-if="detailLoading" class="loading"><a-spin /></div>
        <div v-else class="tutorial-content" v-html="marked.parse(detail.content || detail.summary || '')"></div>
        <div class="toolbar detail-actions">
          <a-button size="small" @click="likeTutorial">
            <template #icon><IconThumbUp /></template>
            点赞
          </a-button>
          <template v-if="adminMode">
            <a-button size="small" :loading="aiBusy === 'summary'" @click="aiAction('summary')">AI 摘要</a-button>
            <a-button size="small" :loading="aiBusy === 'polish'" @click="aiAction('polish')">AI 润色</a-button>
            <a-button v-if="detail._aiOutput" size="small" @click="applyAiOutput">把润色结果存回正文</a-button>
          </template>
        </div>
        <div v-if="detail._aiOutput" class="ai-box">
          <div class="ai-result">{{ detail._aiOutput }}</div>
        </div>
      </template>
    </a-modal>

    <!-- 板块管理抽屉（仅管理员可见入口） -->
    <a-drawer :visible="showBoardMgr" :width="'min(420px, 92vw)'" placement="right" :footer="false" title="板块管理" unmount-on-close @cancel="showBoardMgr = false">
      <div class="board-mgr">
        <a-button type="primary" long @click="openAddBoard">
          <template #icon><IconPlus /></template>
          新增板块
        </a-button>
        <a-empty v-if="!boards.length" description="暂无板块" />
        <template v-else>
          <draggable
            v-model="boards"
            item-key="key"
            handle=".drag-handle"
            :animation="160"
            ghost-class="board-ghost"
            class="board-drag"
            @end="saveBoardOrder"
          >
            <template #item="{ element: b }">
              <div class="board-drag-item">
                <span class="drag-handle" title="拖拽排序"><IconDragDotVertical /></span>
                <span class="board-item-icon"><component :is="boardIcon(b.icon)" /></span>
                <div class="board-item-text">
                  <div class="board-item-name">{{ b.name }}</div>
                  <div class="board-item-key">{{ b.builtin ? '内置板块 · ' : '' }}{{ b.key }}</div>
                </div>
                <div class="board-item-actions">
                  <a-button size="mini" @click="openEditBoard(b)">
                    <template #icon><IconEdit /></template>
                    改名
                  </a-button>
                  <a-popconfirm v-if="!b.builtin" content="删除板块会连同其下所有条目一起删除，确定？" @ok="deleteBoard(b)">
                    <a-button size="mini" status="danger">
                      <template #icon><IconDelete /></template>
                    </a-button>
                  </a-popconfirm>
                </div>
              </div>
            </template>
          </draggable>
        </template>
        <p v-if="boards.length" class="board-hint">拖动 <IconDragDotVertical /> 手柄调整顺序，松手自动保存；内置板块不能删除，但可以改名和换图标。</p>
      </div>
    </a-drawer>

    <!-- 板块表单 -->
    <a-modal :visible="boardForm.open" :width="'min(420px, 92vw)'" :footer="false" :title="boardForm.editing ? '编辑板块' : '新增板块'" unmount-on-close @cancel="boardForm.open = false">
      <div class="field-row">
        <label>板块名称</label>
        <a-input v-model="boardForm.name" placeholder="如：数据集" />
      </div>
      <div class="field-row">
        <label>图标</label>
        <a-select v-model="boardForm.icon" :options="BOARD_ICON_KEYS.map((k) => ({ label: k, value: k }))">
          <template #label="{ data }">
            <span class="icon-opt"><component :is="boardIcon(data.value)" />{{ data.label }}</span>
          </template>
          <template #option="{ data }">
            <span class="icon-opt"><component :is="boardIcon(data.value)" />{{ data.label }}</span>
          </template>
        </a-select>
      </div>
      <div class="field-row">
        <label>排序（小在前）</label>
        <a-input-number v-model="boardForm.sort" :min="0" style="width: 100%" />
      </div>
      <div class="modal-footer">
        <a-button @click="boardForm.open = false">取消</a-button>
        <a-button type="primary" :loading="boardSaving" @click="saveBoard">保存</a-button>
      </div>
    </a-modal>

    <!-- 登录弹窗 -->
    <a-modal :visible="showLogin" :width="'min(360px, 92vw)'" :footer="false" title="后台登录" :mask-closable="false" unmount-on-close @cancel="showLogin = false">
      <div class="field-row">
        <label>管理密码</label>
        <a-input v-model="pwdInput" type="password" placeholder="请输入 ADMIN_PASSWORD" @keyup.enter="doLogin" />
        <span v-if="pwdError" class="pwd-error">{{ pwdError }}</span>
      </div>
      <div class="modal-footer">
        <a-button @click="showLogin = false">取消</a-button>
        <a-button type="primary" @click="doLogin">登录</a-button>
      </div>
    </a-modal>

    <input ref="backupInput" type="file" accept=".json" style="display: none" @change="importBackup" />
  </div>
</template>

<style scoped>
.toolbar { margin-bottom: 16px; }
.hub-toolbar .cat-row { margin-bottom: 0; }
.admin-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.hub-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: var(--gap); }
.hub-card { display: flex; flex-direction: column; }
.hub-card :deep(.arco-card-body) { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.hub-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.hub-title { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hub-head .arco-tag { margin-left: auto; }
.hub-desc { font-size: 12px; color: var(--text-dim); line-height: 1.5; max-height: 60px; overflow: hidden; margin-top: 6px; }
.hub-meta { font-size: 11px; color: var(--text-dim); margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding-top: 10px; }
.actions-right { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; justify-content: flex-end; }
.form-col { display: flex; flex-direction: column; }
.ai-assist { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border); flex-wrap: wrap; }
.tut-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.detail-meta { font-size: 12px; color: var(--text-dim); margin-bottom: 10px; }
.detail-actions { margin-top: 12px; margin-bottom: 0; }
.pwd-error { font-size: 12px; color: rgb(var(--danger-6)); margin-top: 4px; }
.tut-input { min-height: 440px; font-family: ui-monospace, Consolas, monospace; font-size: 13px; }
.tut-preview {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  background: rgb(var(--color-bg-2));
  overflow: auto;
  max-height: 560px;
  min-height: 440px;
  font-size: 14px;
  line-height: 1.7;
}
.tut-preview :deep(pre) { background: #0d1428; border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow: auto; }
.tut-preview :deep(code) { background: #0d1428; border-radius: 4px; padding: 1px 5px; font-size: 13px; }
.tut-preview :deep(h1), .tut-preview :deep(h2), .tut-preview :deep(h3) { color: var(--accent); }
.tut-preview :deep(img) { max-width: 100%; }
.tutorial-content { background: rgb(var(--color-bg-1)); border: 1px solid var(--border); border-radius: 14px; padding: 16px 20px; font-size: 14px; line-height: 1.7; overflow: auto; }
.tutorial-content :deep(pre) { background: #0d1428; border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow: auto; }
.tutorial-content :deep(code) { background: #0d1428; border-radius: 4px; padding: 1px 5px; font-size: 13px; }
.tutorial-content :deep(h1), .tutorial-content :deep(h2), .tutorial-content :deep(h3) { color: var(--accent); }
.tutorial-content :deep(img) { max-width: 100%; }
.ai-box { margin-top: 12px; background: rgb(var(--color-bg-2)); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
.ai-result { white-space: pre-wrap; font-size: 13px; line-height: 1.7; color: var(--text); }

/* 板块管理 */
.board-mgr { display: flex; flex-direction: column; gap: 12px; }
.board-drag { display: flex; flex-direction: column; gap: 8px; min-height: 8px; }
.board-drag-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgb(var(--color-bg-2));
  border: 1px solid var(--border);
  border-radius: 10px;
}
.board-drag-item:hover { border-color: var(--accent); }
.board-ghost { opacity: 0.5; border-style: dashed; }
.board-item-icon { display: inline-flex; align-items: center; font-size: 16px; color: var(--accent); flex: 0 0 auto; }
.board-item-text { flex: 1; min-width: 0; }
.board-item-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-item-key { font-size: 11px; color: var(--text-dim); }
.board-item-actions { display: flex; gap: 4px; flex: 0 0 auto; }
.drag-handle { cursor: grab; color: var(--text-dim); display: inline-flex; align-items: center; flex: 0 0 auto; }
.drag-handle:active { cursor: grabbing; }
.board-hint { font-size: 11px; color: var(--text-dim); line-height: 1.7; margin: 4px 0 0; }
.board-hint :deep(svg) { vertical-align: -3px; }
.icon-opt { display: inline-flex; align-items: center; gap: 6px; }

@media (max-width: 900px) {
  .tut-editor { grid-template-columns: 1fr; }
  .tut-input { min-height: 260px; }
  .tut-preview { min-height: 200px; }
  .field-row3 { grid-template-columns: 1fr; }
}
</style>
