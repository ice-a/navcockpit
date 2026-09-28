<script setup>
// 文章转 Markdown（服务端抓取 + 转存图床 + Turndown；AI 总结）。
// 布局沿用：标题 → 模式 → 输入行 → 双栏预览 → AI 区块；控件全部使用 Arco Design Vue。
import { ref, computed } from 'vue';
import { marked } from 'marked';
import { useToast } from '~/lib/useToast';

const { toast } = useToast();

const mode = ref('url');
const url = ref('');
const pastedHtml = ref('');
const uploadImages = ref(true);
const loading = ref(false);
const error = ref('');
const logs = ref('');

const title = ref('');
const markdown = ref('');

const aiBaseUrl = ref(localStorage.getItem('aiBaseUrl') || '');
const aiApiKey = ref(localStorage.getItem('aiApiKey') || '');
const aiModel = ref(localStorage.getItem('aiModel') || '');
const aiLoading = ref(false);
const aiResult = ref('');
const isAdmin = ref(typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('admin_pwd'));

const previewHtml = computed(() => (markdown.value ? marked.parse(markdown.value) : ''));

function saveAiConfig() {
  localStorage.setItem('aiBaseUrl', aiBaseUrl.value);
  localStorage.setItem('aiApiKey', aiApiKey.value);
  localStorage.setItem('aiModel', aiModel.value);
}

async function extract() {
  loading.value = true;
  error.value = '';
  logs.value = '';
  try {
    if (mode.value === 'url') {
      if (!url.value.trim()) throw new Error('请输入文章链接');
      logs.value = '服务端抓取网页 → 选取正文 → 转存图片 → 转换中…';
      const res = await fetch('/api/tools/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.value.trim(), uploadImages: uploadImages.value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
      title.value = body.title;
      markdown.value = body.markdown;
      logs.value = `完成：转存了 ${body.uploadedImages} 张图片到公开图床`;
    } else {
      if (!pastedHtml.value.trim()) throw new Error('请粘贴 HTML 内容');
      const res = await fetch('/api/tools/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: pastedHtml.value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
      title.value = body.title;
      markdown.value = body.markdown;
      logs.value = '转换完成';
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function summarize() {
  saveAiConfig();
  if (!markdown.value) return;
  aiLoading.value = true;
  aiResult.value = '';
  error.value = '';
  try {
    const hasKey = aiBaseUrl.value && aiApiKey.value;
    const res = await fetch('/api/tools/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': sessionStorage.getItem('admin_pwd') || '' },
      body: JSON.stringify({
        content: markdown.value.slice(0, 60000),
        mode: 'md',
        ...(hasKey ? { config: { baseUrl: aiBaseUrl.value, apiKey: aiApiKey.value, model: aiModel.value } } : {}),
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
    aiResult.value = body.text;
  } catch (e) {
    error.value = 'AI 总结失败：' + e.message;
  } finally {
    aiLoading.value = false;
  }
}

function download() {
  if (!markdown.value) return;
  const blob = new Blob([markdown.value], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title.value ? `${title.value}.md` : `article-${Date.now()}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function copyMd() {
  if (markdown.value) {
    await navigator.clipboard.writeText(markdown.value);
    toast('已复制', 'success');
  }
}
</script>

<template>
  <div>
    <h2 class="zone">文章转 Markdown <small>抓取正文 · 图片转存图床 · AI 总结</small></h2>

    <div class="cat-row">
      <a-radio-group v-model="mode" type="button" size="small">
        <a-radio value="url">按链接提取</a-radio>
        <a-radio value="paste">粘贴 HTML 转换</a-radio>
      </a-radio-group>
    </div>

    <div v-if="mode === 'url'" class="inline-form">
      <a-input v-model="url" placeholder="输入文章链接，如 https://example.com/post/123" style="flex: 1; min-width: 280px" @keyup.enter="extract" />
      <a-switch v-model="uploadImages" size="small" />
      <span>图片转存图床</span>
      <a-button type="primary" :loading="loading" @click="extract">{{ loading ? '提取中…' : '提取 Markdown' }}</a-button>
    </div>

    <template v-else>
      <div class="field-row">
        <a-textarea
          v-model="pastedHtml"
          :auto-size="{ minRows: 6, maxRows: 14 }"
          placeholder="把网页 HTML 粘贴到这里（Ctrl+U 查看源码后全选复制）"
        />
      </div>
      <a-button type="primary" :loading="loading" style="margin-bottom: 12px" @click="extract">{{ loading ? '转换中…' : '转换为 Markdown' }}</a-button>
    </template>

    <p v-if="logs" class="md-logs">{{ logs }}</p>
    <a-alert v-if="error" type="error" :title="error" />

    <div v-if="markdown" class="md-panels">
      <div>
        <h3>
          Markdown 源码
          <span class="md-actions">
            <a-button size="mini" @click="copyMd">复制</a-button>
            <a-button size="mini" @click="download">下载 .md</a-button>
          </span>
        </h3>
        <a-textarea v-model="markdown" class="md-editor" />
      </div>
      <div>
        <h3>渲染预览</h3>
        <div class="md-preview" v-html="previewHtml"></div>
      </div>
    </div>

    <div v-if="markdown" class="ai-box">
      <h3 class="ai-title">AI 总结（可选，仅后台）</h3>
      <template v-if="isAdmin">
        <div class="ai-config">
          <a-input v-model="aiBaseUrl" placeholder="API Base URL（如 https://api.openai.com）" />
          <a-input v-model="aiApiKey" type="password" placeholder="API Key（只存本机 localStorage）" />
          <a-input v-model="aiModel" placeholder="模型（如 gpt-4o-mini）" />
        </div>
        <div class="ai-actions">
          <a-button type="primary" :loading="aiLoading" @click="summarize">{{ aiLoading ? '总结中…' : 'AI 总结' }}</a-button>
          <span v-if="!aiApiKey" class="ai-hint">留空时使用服务端全局 AI 配置（若已设置 GLOBAL_AI_*）</span>
        </div>
      </template>
      <p v-else class="ai-hint">AI 功能仅在「AI 资源台」进入管理后台后可用。</p>
      <div v-if="aiResult" class="ai-result">{{ aiResult }}</div>
    </div>
  </div>
</template>

<style scoped>
.md-logs { font-size: 13px; color: var(--text-dim); margin: 0 0 8px; }
.md-panels h3 { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.md-actions { display: inline-flex; gap: 6px; }
.md-preview :deep(pre) { background: #0d1428; border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow: auto; }
.md-preview :deep(code) { background: #0d1428; border-radius: 4px; padding: 1px 5px; font-size: 13px; }
.md-preview :deep(h1), .md-preview :deep(h2), .md-preview :deep(h3) { color: var(--accent); }
.md-preview :deep(img) { max-width: 100%; }
.ai-title { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
.ai-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
</style>
