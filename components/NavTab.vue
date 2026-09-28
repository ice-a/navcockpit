<script setup>
// 网站导航（数据存 MongoDB：/api/nav/categories + /api/nav/links）。
// 布局沿用：左侧大类侧栏 + 右侧工具栏 / 分类副标签 / 卡片网格。
// 控件全部使用 Arco Design Vue；后台登录后可管理分类与链接（含拖拽排序）。
import { ref, computed, onMounted, watch } from 'vue';
import {
  IconPlus,
  IconEdit,
  IconDelete,
  IconDragDotVertical,
  IconRefresh,
  IconImport,
  IconMenu,
  IconClose,
} from '@arco-design/web-vue/es/icon';
import { useSettings } from '~/lib/useSettings';
import { useToast } from '~/lib/useToast';
import { useAdmin } from '~/lib/useAdmin';
import ShareButton from '~/components/ShareButton.vue';
import draggable from 'vuedraggable';

const { settings } = useSettings();
const { toast } = useToast();
const { adminMode, adminHeaders, login, logout } = useAdmin();

const categories = ref([]); // { _id, key, name, group, icon, sort }
const links = ref([]);
const loading = ref(true);
const error = ref('');
const keyword = ref('');
const activeGroup = ref('all'); // 'all' | 'grp:'+group
const activeCat = ref('all'); // 'all' | category.key

// 探活
const deadMap = ref({});
const checking = ref(false);
const checkedCount = ref(0);

// ===================== 数据加载 =====================
async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    const [cats, lks] = await Promise.all([
      fetch('/api/nav/categories').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/nav/links').then((r) => (r.ok ? r.json() : [])),
    ]);
    categories.value = cats;
    links.value = lks;
    syncGroups();
  } catch (e) {
    error.value = '数据加载失败：' + e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(loadAll);

// 分类 → 大类 映射（便于按大类过滤链接）
const keyToGroup = computed(() => {
  const m = {};
  for (const c of categories.value) m[c.key] = c.group;
  return m;
});

const groups = computed(() => {
  const seen = [];
  const cnt = {};
  for (const c of categories.value) {
    if (!seen.includes(c.group)) {
      seen.push(c.group);
      cnt[c.group] = 0;
    }
    cnt[c.group] += links.value.filter((l) => l.catelog === c.key).length;
  }
  return seen.map((g) => ({ group: g, count: cnt[g] }));
});

const menuItems = computed(() => [
  { key: 'all', label: '全部', count: links.value.length },
  ...groups.value.map((g) => ({ key: 'grp:' + g.group, label: g.group, count: g.count })),
]);

const catsOfActiveGroup = computed(() => {
  let list = categories.value;
  if (activeGroup.value !== 'all') {
    const g = activeGroup.value.slice(4);
    list = list.filter((c) => c.group === g);
  }
  return list
    .map((c) => ({ ...c, count: links.value.filter((l) => l.catelog === c.key).length }))
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
});

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  const grp = activeGroup.value === 'all' ? null : activeGroup.value.slice(4);
  return links.value.filter((l) => {
    if (grp && keyToGroup.value[l.catelog] !== grp) return false;
    if (activeCat.value !== 'all' && l.catelog !== activeCat.value) return false;
    if (kw && !`${l.name} ${l.desc} ${l.url}`.toLowerCase().includes(kw)) return false;
    if (settings.hideDeadSites && deadMap.value[l.url]) return false;
    return true;
  });
});

const grouped = computed(() => {
  const m = new Map();
  for (const l of filtered.value) {
    const c = l.catelog || '';
    if (!m.has(c)) m.set(c, []);
    m.get(c).push(l);
  }
  const nameOf = (key) => categories.value.find((c) => c.key === key)?.name || (key === '' ? '未分类' : key);
  return [...m.entries()]
    .map(([k, items]) => ({ key: k, name: nameOf(k), items }))
    .sort((a, b) => b.items.length - a.items.length);
});

function onMenuSelect(key) {
  activeGroup.value = key;
  activeCat.value = 'all';
}

function favicon(url) {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
  } catch {
    return '';
  }
}

// ===================== 探活 =====================
async function probe(url, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, mode: 'no-cors' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
async function runHealthCheck() {
  if (checking.value) return;
  checking.value = true;
  checkedCount.value = 0;
  const list = links.value;
  let i = 0;
  const CONC = 20;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      const ok = await probe(list[idx].url);
      if (!ok) deadMap.value = { ...deadMap.value, [list[idx].url]: true };
      checkedCount.value++;
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  checking.value = false;
  toast(`探活完成：标记 ${Object.keys(deadMap.value).length} 个失效站点`, 'success');
}
watch(
  () => settings.hideDeadSites,
  (v) => {
    if (v && !checking.value && !Object.keys(deadMap.value).length) runHealthCheck();
  },
);

function sharePayload(l) {
  return {
    type: 'nav',
    refId: l.url,
    title: l.name,
    desc: l.desc || l.url,
    url: l.url,
    badge: '🧭 网站导航',
  };
}

// ===================== 后台：登录 + 分类管理 =====================
const showLogin = ref(false);
const pwdInput = ref('');
const pwdError = ref('');

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

const showCatMgr = ref(false);
const catForm = ref({ open: false, editing: null, key: '', name: '', group: '', icon: '', sort: 0 });

function openAddCat() {
  catForm.value = { open: true, editing: null, key: '', name: '', group: groups.value[0]?.group || '其他', icon: '', sort: categories.value.length };
}
function openEditCat(c) {
  catForm.value = { open: true, editing: c.key, key: c.key, name: c.name, group: c.group, icon: c.icon || '', sort: c.sort };
}
async function saveCat() {
  const f = catForm.value;
  if (!f.name.trim()) return toast('分类名称不能为空', 'error');
  const url = f.editing ? `/api/nav/categories/${encodeURIComponent(f.editing)}` : '/api/nav/categories';
  const res = await fetch(url, {
    method: f.editing ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: JSON.stringify({ name: f.name, group: f.group, icon: f.icon, sort: Number(f.sort) || 0 }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    return toast('保存失败：' + (b.message || `HTTP ${res.status}`), 'error');
  }
  catForm.value.open = false;
  await loadAll();
  toast(f.editing ? '分类已改名' : '已新增分类', 'success');
}
async function deleteCat(c) {
  const res = await fetch(`/api/nav/categories/${encodeURIComponent(c.key)}`, { method: 'DELETE', headers: adminHeaders() });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    return toast('删除失败：' + (b.message || `HTTP ${res.status}`), 'error');
  }
  await loadAll();
  toast('已删除分类', 'success');
}

// 拖拽排序后保存（按当前顺序覆盖 sort；跨组拖拽时一并覆盖 group）
const reordering = ref(false);
const catGroups = ref([]); // [{ group, items: [cat...] }]，分类管理抽屉的可拖拽模型

// 从扁平 categories 构建按大类分组的编辑模型（只保留非空大类）
function syncGroups() {
  const map = new Map();
  for (const c of categories.value) {
    if (!map.has(c.group)) map.set(c.group, []);
    map.get(c.group).push(c);
  }
  catGroups.value = [...map.entries()]
    .map(([group, items]) => ({
      group,
      items: items.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
    }));
}

// 任一列表变化（组内排序 / 跨组移动）后，把结构拍平并保存
function onCatChange() {
  const order = [];
  for (const g of catGroups.value) {
    g.items.forEach((c, i) => {
      c.group = g.group; // 跨组拖入后归属同步到目标大类
      c.sort = i;
      order.push({ key: c.key, group: g.group, sort: i });
    });
  }
  persistOrder(order);
}

async function persistOrder(order) {
  if (!adminMode.value) return;
  reordering.value = true;
  try {
    const res = await fetch('/api/nav/categories/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ order }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.message || `HTTP ${res.status}`);
    }
    // 本地立即同步左侧菜单/卡片：用新顺序拍平 categories
    categories.value = catGroups.value.flatMap((g) => g.items);
    toast('分类顺序已保存', 'success');
  } catch (e) {
    toast('保存顺序失败：' + e.message, 'error');
    await loadAll(); // 失败回滚
  } finally {
    reordering.value = false;
  }
}

// ===================== 后台：链接管理 =====================
const linkForm = ref({ open: false, editing: null, name: '', url: '', catelog: '', desc: '', sort: 0 });
const catOptions = computed(() => categories.value.map((c) => ({ label: c.name, value: c.key })));

function openAddLink() {
  linkForm.value = { open: true, editing: null, name: '', url: '', catelog: activeCat.value === 'all' ? '' : activeCat.value, desc: '', sort: 0 };
}
function openEditLink(l) {
  linkForm.value = { open: true, editing: l._id, name: l.name, url: l.url, catelog: l.catelog, desc: l.desc, sort: l.sort };
}
async function saveLink() {
  const f = linkForm.value;
  if (!f.name.trim() || !f.url.trim()) return toast('名称和链接不能为空', 'error');
  const grp = categories.value.find((c) => c.key === f.catelog)?.group || '';
  const url = f.editing ? `/api/nav/links/${f.editing}` : '/api/nav/links';
  const res = await fetch(url, {
    method: f.editing ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders() },
    body: JSON.stringify({ name: f.name, url: f.url, catelog: f.catelog, group: grp, desc: f.desc, sort: Number(f.sort) || 0 }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    return toast('保存失败：' + (b.message || `HTTP ${res.status}`), 'error');
  }
  linkForm.value.open = false;
  await loadAll();
  toast(f.editing ? '已更新链接' : '已新增链接', 'success');
}
async function deleteLink(l) {
  const res = await fetch(`/api/nav/links/${l._id}`, { method: 'DELETE', headers: adminHeaders() });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    return toast('删除失败：' + (b.message || `HTTP ${res.status}`), 'error');
  }
  await loadAll();
  toast('已删除链接', 'success');
}

// 一键把 public/link.json 导入 MongoDB（分类 + 链接）
const seeding = ref(false);
async function seedFromJson() {
  seeding.value = true;
  try {
    const res = await fetch('/api/nav/seed', { method: 'POST', headers: { ...adminHeaders() } });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(b.message || `HTTP ${res.status}`);
    await loadAll();
    const s = b.summary || {};
    toast(`导入完成：分类 +${s.categoriesCreated ?? 0} / 链接 +${s.linksCreated ?? 0}`, 'success');
  } catch (e) {
    toast('导入失败：' + e.message, 'error');
  } finally {
    seeding.value = false;
  }
}
</script>

<template>
  <div class="nav-layout">
    <!-- 左：大类侧栏 -->
    <aside class="nav-sidebar">
      <a-menu :selected-keys="[activeGroup]" @menu-item-click="onMenuSelect">
        <a-menu-item v-for="it in menuItems" :key="it.key">
          <span class="side-label">{{ it.label }}</span>
          <span class="cnt">{{ it.count }}</span>
        </a-menu-item>
      </a-menu>
    </aside>

    <!-- 右：内容 -->
    <div class="nav-content">
      <div class="toolbar">
        <a-input v-model="keyword" placeholder="搜索名称 / 描述 / 域名…" allow-clear style="width: 260px" />
        <span>共 {{ filtered.length }} 条</span>
        <span class="spacer"></span>
        <a-tooltip content="隐藏失效站点" position="top">
          <a-switch v-model="settings.hideDeadSites" size="small" />
        </a-tooltip>
        <a-button size="small" :loading="checking" @click="runHealthCheck">
          <template #icon><IconRefresh /></template>
          {{ checking ? `检测中 ${checkedCount}/${links.length}` : '检测失效' }}
        </a-button>
        <template v-if="adminMode">
          <a-button size="small" type="primary" @click="openAddLink">
            <template #icon><IconPlus /></template>
            链接
          </a-button>
          <a-button size="small" @click="openAddCat">
            <template #icon><IconPlus /></template>
            分类
          </a-button>
          <a-button size="small" @click="showCatMgr = true">
            <template #icon><IconMenu /></template>
            管理分类
          </a-button>
          <a-button size="small" :loading="seeding" @click="seedFromJson">
            <template #icon><IconImport /></template>
            导入 link.json
          </a-button>
          <a-button size="small" @click="logout">退出管理</a-button>
        </template>
        <a-button v-else size="small" @click="showLogin = true">进入管理</a-button>
      </div>

      <div v-if="activeGroup !== 'all' || activeCat !== 'all'" class="cat-row">
        <a-button size="mini" shape="round" :type="activeCat === 'all' ? 'primary' : 'secondary'" @click="activeCat = 'all'">全部分类</a-button>
        <a-button
          v-for="c in catsOfActiveGroup"
          :key="c.key"
          size="mini"
          shape="round"
          :type="activeCat === c.key ? 'primary' : 'secondary'"
          @click="activeCat = c.key"
        >
          {{ c.name }}
          <span class="link-count">{{ c.count }}</span>
        </a-button>
      </div>

      <a-alert v-if="error" type="error" :title="error" />
      <div v-else-if="loading" class="loading"><a-spin /></div>

      <template v-else>
        <a-empty v-if="!categories.length" description="还没有分类数据">
          <div class="empty-tip">
            <p>进入管理后，点「导入 link.json」即可把现有导航一次性迁入。</p>
            <a-button v-if="adminMode" type="primary" size="small" :loading="seeding" @click="seedFromJson">导入 link.json</a-button>
            <a-button v-else size="small" @click="showLogin = true">进入管理</a-button>
          </div>
        </a-empty>
        <a-empty v-else-if="!grouped.length" description="没有匹配的站点，换个关键词试试" />
        <section v-for="g in grouped" :key="g.key" class="cat-section">
          <h2 class="zone">
            {{ g.name || '未分类' }}
            <small>{{ g.items.length }} 条</small>
          </h2>
          <div class="nav-cards">
            <a-card
              v-for="l in g.items"
              :key="l._id || l.url"
              size="small"
              hoverable
              class="nav-card"
              :class="{ offline: deadMap[l.url] }"
              :body-style="{ padding: '11px 13px', height: '100%' }"
            >
              <a class="nav-link" :href="l.url" target="_blank" rel="noopener nofollow">
                <img v-if="favicon(l.url)" :src="favicon(l.url)" class="nav-fav" loading="lazy" onerror="this.style.visibility='hidden'" />
                <span class="nav-title">{{ l.name }}</span>
              </a>
              <div class="nav-desc">{{ l.desc || l.url }}</div>
              <div class="nav-actions">
                <ShareButton :payload="sharePayload(l)" :label="`分享 ${l.name}`" />
                <div v-if="adminMode" class="nav-admin">
                  <a-button size="mini" type="text" @click="openEditLink(l)">
                    <template #icon><IconEdit /></template>
                  </a-button>
                  <a-popconfirm content="确定删除该链接？" @ok="deleteLink(l)">
                    <a-button size="mini" type="text" status="danger">
                      <template #icon><IconDelete /></template>
                    </a-button>
                  </a-popconfirm>
                </div>
              </div>
            </a-card>
          </div>
        </section>
      </template>
    </div>

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

    <!-- 分类管理抽屉 -->
    <a-drawer :visible="showCatMgr" :width="'min(380px, 92vw)'" placement="right" :footer="false" title="分类管理" unmount-on-close @cancel="showCatMgr = false">
      <div class="cat-mgr">
        <a-button type="primary" long :loading="reordering" @click="openAddCat">
          <template #icon><IconPlus /></template>
          新增分类
        </a-button>
        <a-empty v-if="!categories.length" description="暂无分类，先新增一个" />
        <template v-else>
          <div v-for="g in catGroups" :key="g.group" class="cat-group-block">
            <span class="cat-group-title">{{ g.group }}（{{ g.items.length }}）</span>
            <draggable
              v-model="g.items"
              item-key="_id"
              :group="{ name: 'cats' }"
              handle=".drag-handle"
              :animation="160"
              ghost-class="cat-ghost"
              class="cat-drag"
              @change="onCatChange"
            >
              <template #item="{ element: c }">
                <div class="cat-drag-item">
                  <span class="drag-handle" title="拖拽排序 / 跨大类移动"><IconDragDotVertical /></span>
                  <div class="cat-item-text">
                    <div class="cat-item-name">{{ c.name }}</div>
                    <div class="cat-item-group">{{ c.group }}</div>
                  </div>
                  <div class="cat-item-actions">
                    <a-button size="mini" @click="openEditCat(c)">
                      <template #icon><IconEdit /></template>
                      改名
                    </a-button>
                    <a-popconfirm content="删除分类后，其下链接将归入「未分类」，确定？" @ok="deleteCat(c)">
                      <a-button size="mini" status="danger">
                        <template #icon><IconDelete /></template>
                      </a-button>
                    </a-popconfirm>
                  </div>
                </div>
              </template>
            </draggable>
          </div>
        </template>
        <p v-if="categories.length" class="cat-hint">拖动 <IconDragDotVertical /> 手柄调整顺序；拖到别的大类下即改所属大类，松手自动保存。</p>
      </div>
    </a-drawer>

    <!-- 分类表单 -->
    <a-modal :visible="catForm.open" :width="'min(420px, 92vw)'" :footer="false" :title="catForm.editing ? '改名分类' : '新增分类'" unmount-on-close @cancel="catForm.open = false">
      <div class="field-row">
        <label>展示名称</label>
        <a-input v-model="catForm.name" placeholder="如：AI 工具" />
      </div>
      <div class="field-row">
        <label>所属大类</label>
        <a-input v-model="catForm.group" placeholder="如：AI 工具 / 开发工具" />
      </div>
      <div class="field-row">
        <label>图标（emoji，可选）</label>
        <a-input v-model="catForm.icon" placeholder="🧩" />
      </div>
      <div class="field-row">
        <label>排序（小在前）</label>
        <a-input-number v-model="catForm.sort" :min="0" style="width: 100%" />
      </div>
      <div class="modal-footer">
        <a-button @click="catForm.open = false">取消</a-button>
        <a-button type="primary" @click="saveCat">保存</a-button>
      </div>
    </a-modal>

    <!-- 链接表单 -->
    <a-modal :visible="linkForm.open" :width="'min(480px, 92vw)'" :footer="false" :title="linkForm.editing ? '编辑链接' : '新增链接'" unmount-on-close @cancel="linkForm.open = false">
      <div class="field-row">
        <label>名称</label>
        <a-input v-model="linkForm.name" placeholder="站点名称" />
      </div>
      <div class="field-row">
        <label>链接</label>
        <a-input v-model="linkForm.url" placeholder="https://example.com" />
      </div>
      <div class="field-row">
        <label>所属分类</label>
        <a-select v-model="linkForm.catelog" :options="catOptions" placeholder="未分类" allow-clear allow-search />
      </div>
      <div class="field-row">
        <label>描述</label>
        <a-textarea v-model="linkForm.desc" :auto-size="{ minRows: 2 }" placeholder="一句话描述" />
      </div>
      <div class="field-row">
        <label>排序（小在前）</label>
        <a-input-number v-model="linkForm.sort" :min="0" style="width: 100%" />
      </div>
      <div class="modal-footer">
        <a-button @click="linkForm.open = false">取消</a-button>
        <a-button type="primary" @click="saveLink">保存</a-button>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.nav-content { min-width: 0; }
.nav-sidebar { padding: 6px; }
.nav-sidebar :deep(.arco-menu) { background: transparent; border: none; }
.nav-sidebar :deep(.arco-menu-item) { display: flex; align-items: center; justify-content: space-between; border-radius: 10px; }
.side-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-sidebar .cnt { font-size: 11px; opacity: 0.7; margin-left: 8px; }
.toolbar { margin-bottom: 14px; }
.cat-row { margin-bottom: 14px; }
.cat-section { margin-bottom: 8px; }
.nav-card { display: flex; flex-direction: column; }
.nav-card.offline { opacity: 0.55; }
.nav-link { display: flex; align-items: center; gap: 8px; text-decoration: none; color: var(--text); min-width: 0; }
.nav-link:hover .nav-title { color: var(--accent); }
.nav-fav { width: 16px; height: 16px; flex: 0 0 16px; border-radius: 4px; }
.nav-title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-desc { font-size: 12px; color: var(--text-dim); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-actions { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 6px; min-height: 24px; }
.nav-admin { display: flex; gap: 2px; }
.empty-tip { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.empty-tip p { margin: 0; font-size: 13px; color: var(--text-dim); }
.cat-mgr { display: flex; flex-direction: column; gap: 12px; }
.cat-group-block { display: flex; flex-direction: column; gap: 8px; }
.cat-group-title { font-size: 13px; font-weight: 600; color: var(--accent); }
.cat-drag { display: flex; flex-direction: column; gap: 8px; min-height: 8px; }
.cat-drag-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgb(var(--color-bg-2));
  border: 1px solid var(--border);
  border-radius: 10px;
}
.cat-drag-item:hover { border-color: var(--accent); }
.cat-ghost { opacity: 0.5; border-style: dashed; }
.cat-item-text { flex: 1; min-width: 0; }
.cat-item-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-item-group { font-size: 11px; color: var(--text-dim); }
.cat-item-actions { display: flex; gap: 4px; flex: 0 0 auto; }
.drag-handle { cursor: grab; color: var(--text-dim); display: inline-flex; align-items: center; flex: 0 0 auto; }
.drag-handle:active { cursor: grabbing; }
.cat-hint { font-size: 11px; color: var(--text-dim); line-height: 1.7; margin: 4px 0 0; }
.cat-hint :deep(svg) { vertical-align: -3px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.pwd-error { font-size: 12px; color: rgb(var(--danger-6)); margin-top: 4px; }
:deep(.arco-empty) { padding: 40px 0; }
</style>
