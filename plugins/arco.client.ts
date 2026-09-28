// 全局注册 Arco Design Vue（纯 SPA，客户端注册即可）。
// 组件样式 arco.css 在 nuxt.config 的 css 列表中引入，保证在覆盖主题之前加载。
import ArcoVue from '@arco-design/web-vue';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(ArcoVue);
});
