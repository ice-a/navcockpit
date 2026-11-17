import { createApp } from 'vue';
import App from './App.vue';
import './styles/base.css';
import { applyTheme, settings } from './lib/store';

// 首屏前先落主题，避免闪白
applyTheme(settings.theme);

createApp(App).mount('#app');
