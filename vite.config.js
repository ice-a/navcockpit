import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 纯静态站点：构建产物 dist/ 直接丢给 Cloudflare Pages，无需任何服务端。
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
  },
});
