// 分享：模块级单例状态 + 生成/展示动作。ShareDialog.vue 负责渲染。
// 用法：const { openShare } = useShare(); openShare({ type:'hub', coll:'tools', refId, title, desc, url })
import { reactive } from 'vue';
import { useToast } from './useToast';
import { avatarFor } from './sharePoster';

const state = reactive({
  open: false,
  readonly: false, // true = 通过 ?share= 打开的别人的分享
  loading: false,
  error: '',
  doc: null, // 服务端返回的分享快照
  shareUrl: '',
});

function localSid() {
  // 服务端不可用时的兜底：本地生成一个同样格式的短 id，至少图片能出、链接能复制
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 10; i++) out += A[Math.floor(Math.random() * A.length)];
  return out;
}

function linkOf(sid) {
  const u = new URL(location.href);
  u.search = `?share=${sid}`;
  u.hash = '';
  return u.toString();
}

export function useShare() {
  const { toast } = useToast();

  /** 展示一条已存在的分享（?share= 深链用） */
  function showShare(doc) {
    state.doc = doc;
    state.shareUrl = linkOf(doc.sid);
    state.readonly = true;
    state.error = '';
    state.open = true;
  }

  /**
   * 为一块内容创建（或复用）分享。
   * @param {object} payload { type, coll, refId, title, desc, url, badge, avatar }
   */
  async function openShare(payload) {
    if (!payload || !payload.title) return;
    state.loading = true;
    state.error = '';
    state.readonly = false;
    state.open = true;
    state.doc = null;

    const body = {
      type: payload.type || 'card',
      coll: payload.coll || '',
      refId: payload.refId || '',
      title: String(payload.title).slice(0, 120),
      desc: String(payload.desc || '').slice(0, 400),
      url: String(payload.url || '').slice(0, 600),
      badge: String(payload.badge || '').slice(0, 40),
      avatar: payload.avatar || avatarFor(payload.refId || payload.url || payload.title),
    };

    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message || b.statusMessage || `HTTP ${res.status}`);
      }
      state.doc = { ...body, ...(await res.json()) };
    } catch (e) {
      // 服务端挂了也不能挡住「生成图片」这条路
      state.error = String(e.message || e);
      state.doc = { ...body, sid: localSid(), views: 0, createdAt: new Date().toISOString() };
    } finally {
      state.shareUrl = linkOf(state.doc.sid);
      state.loading = false;
    }
  }

  function closeShare() {
    state.open = false;
    state.doc = null;
    state.error = '';
    // 清掉地址栏里的 ?share=，否则刷新会再弹一次
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('share')) {
      const u = new URL(location.href);
      u.searchParams.delete('share');
      history.replaceState(null, '', u.toString());
    }
  }

  return { shareState: state, openShare, showShare, closeShare };
}
