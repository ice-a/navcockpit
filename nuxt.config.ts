// Nuxt 3 前后端一体：前端页面 + server/api 路由（Nitro，Node runtime）。
// 远程 MongoDB、热榜抓取、网页正文提取都在服务端完成，浏览器只调用 /api/*。
export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  ssr: false, // 与原项目一致的纯 SPA，避免 canvas 等浏览器 API 的水合问题

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // ===== 分析/广告（公开配置，前端可读；留空则不注入对应脚本）=====
    // 环境变量覆盖方式：NUXT_PUBLIC_GA_ID / NUXT_PUBLIC_ADSENSE_CLIENT /
    // NUXT_PUBLIC_CLARITY_ID / NUXT_PUBLIC_BING_UET_ID
    public: {
      gaId: '', // Google Analytics 4，形如 G-XXXXXXXXXX
      adsenseClient: '', // Google AdSense，形如 ca-pub-XXXXXXXX
      clarityId: '', // Microsoft Clarity（Bing 家族的免费行为分析），32 位 hex
      bingUetId: '', // Bing UET（微软广告统计），形如 12345678
    },
  },

  app: {
    head: {
      title: '领航舱 · 个人导航与工具箱',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
        { name: 'description', content: '领航舱 NavCockpit：网站导航 · 热榜 · AI 资源 · 个性头像 · GitHub · Cloudflare DNS 一舱掌控' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/favicon.png' },
      ],
      htmlAttrs: { lang: 'zh-CN' },
    },
  },
});
