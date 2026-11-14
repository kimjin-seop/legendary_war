import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { initPwa } from './pwa.js';

initPwa(); // beforeinstallprompt 를 게임 청크 로드 전에 잡고 서비스워커 등록(pwa.js)

createApp(App).use(createPinia()).use(router).mount('#app');
