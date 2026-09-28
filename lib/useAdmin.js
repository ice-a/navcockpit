// 后台登录态（复用 ADMIN_PASSWORD 校验流程）。
// 写操作统一带 x-admin-password 头；密码存 sessionStorage（与原 HubTab 一致）。
import { ref } from 'vue';
import { useToast } from './useToast';

const adminMode = ref(typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem('admin_pwd'));

export function useAdmin() {
  const { toast } = useToast();

  function adminHeaders() {
    return { 'x-admin-password': sessionStorage.getItem('admin_pwd') || '' };
  }

  async function login(password) {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.message || `HTTP ${res.status}`);
    }
    sessionStorage.setItem('admin_pwd', password);
    adminMode.value = true;
    toast('已进入管理', 'success');
  }

  function logout() {
    sessionStorage.removeItem('admin_pwd');
    adminMode.value = false;
    toast('已退出管理', 'info');
  }

  return { adminMode, adminHeaders, login, logout };
}
