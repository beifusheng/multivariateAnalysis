import { createApp } from 'vue';
import App from './App.vue';
import './assets/global.less';
import components from './components/global';
import Router from './router/index';

// Element Plus
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import zhCn from 'element-plus/dist/locale/zh-cn.mjs';

const app = createApp(App)

// 使用 Element Plus
app.use(ElementPlus, {
  locale: zhCn,
});

// components
for (const i in components) {
  app.component(i, components[i])
}

app.use(Router).mount('#app')
