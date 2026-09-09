<script setup>
// 文章转 Markdown（移植自 ice-a/html_to_markdown_by_ai）：
// - URL 模式：服务端抓取正文 + 图片转存公开图床 + Turndown 转 MD（绕开浏览器 CORS）
// - 粘贴模式：把复制的 HTML 粘进来直接转
// - AI 总结：浏览器内配置 OpenAI 兼容接口（Key 只随本次请求发送，也可用服务端全局配置）
import { ref, computed } from 'vue';
import { marked } from 'marked';

const mode = ref('url'); // url | paste
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

const previewHtml = computed(() =>
  markdown.value ? marked.parse(markdown.value) : '',
);

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: markdown.value.slice(0, 60000),
        mode: 'md',
        ...(hasKey
          ? {
              config: {
                baseUrl: aiBaseUrl.value,
                apiKey: aiApiKey.value,
                model: aiModel.value,
              },
            }
          : {}),
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
  if (markdown.value) await navigator.clipboard.writeText(markdown.value);
}
</script>

<template>
  <div>
    <h2 class="zone">📝 文章转 Markdown <small>抓取正文 · 图片转存图床 · AI 总结</small></h2>

    <div class="cat-row">
      <button class="cat-chip" :class="{ active: mode === 'url' }" @click="mode = 'url'">
        按链接提取
      </button>
      <button class="cat-chip" :class="{ active: mode === 'paste' }" @click="mode = 'paste'">
        粘贴 HTML 转换
      </button>
    </div>

    <div v-if="mode === 'url'" class="inline-form">
      <input
        v-model="url"
        type="text"
        placeholder="输入文章链接，如 https://example.com/post/123"
        style="flex: 1"
        @keyup.enter="extract"
      />
      <label class="toggle">
        <input type="checkbox" v-model="uploadImages" />
        图片转存图床
      </label>
      <button type="button" class="primary" :disabled="loading" @click="extract">
        {{ loading ? '提取中…' : '提取 Markdown' }}
      </button>
    </div>

    <template v-else>
      <div class="field-row">
        <label>把网页 HTML 粘贴到这里（浏览器里 Ctrl+U 查看源码后全选复制，或右键查看源代码）</label>
        <textarea v-model="pastedHtml" rows="6" placeholder="&lt;html&gt;…&lt;/html&gt;"></textarea>
      </div>
      <button class="btn primary" :disabled="loading" @click="extract">
        {{ loading ? '转换中…' : '转换为 Markdown' }}
      </button>
    </template>

    <div v-if="logs" class="notice">{{ logs }}</div>
    <div v-if="error" class="error">⚠️ {{ error }}</div>

    <div v-if="markdown" class="md-panels">
      <div>
        <h3>
          Markdown 源码
          <button class="btn small" @click="copyMd" style="margin-left: 8px">复制</button>
          <button class="btn small" @click="download" style="margin-left: 6px">下载 .md</button>
        </h3>
        <textarea v-model="markdown" class="md-editor"></textarea>
      </div>
      <div>
        <h3>渲染预览</h3>
        <div class="md-preview" v-html="previewHtml"></div>
      </div>
    </div>

    <div v-if="markdown" class="ai-box">
      <h3 style="margin: 0 0 10px; font-size: 14px">🤖 AI 总结（可选）</h3>
      <div class="ai-config">
        <input v-model="aiBaseUrl" type="text" placeholder="API Base URL（如 https://api.openai.com）" />
        <input v-model="aiApiKey" type="password" placeholder="API Key（只存本机 localStorage）" />
        <input v-model="aiModel" type="text" placeholder="模型（如 gpt-4o-mini）" />
      </div>
      <button class="btn primary" :disabled="aiLoading" @click="summarize">
        {{ aiLoading ? '总结中…' : 'AI 总结' }}
      </button>
      <span v-if="!aiApiKey" style="font-size: 12px; color: var(--text-dim); margin-left: 10px">
        留空时使用服务端全局 AI 配置（若已设置 GLOBAL_AI_*）
      </span>
      <div v-if="aiResult" class="ai-result">{{ aiResult }}</div>
    </div>
  </div>
</template>
