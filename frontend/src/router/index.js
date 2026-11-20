import { createRouter, createWebHashHistory } from 'vue-router'
import routerMap from './routerMap'

const Router = createRouter({
  history: createWebHashHistory(),
  routes: routerMap,
  /**
   * 不写这个就会“刚分进去就在半页位置”：hash 路由换页不重新加载文档，
   * 浏览器也就不会替你把 scrollY 归零，上一页滚到哪新页就在哪。
   * 实机反馈：“刚进 Non-random / GMR⁴，视窗不在最上面，而是居中”。
   * 后退/前进仍然还给 savedPosition —— 那是用户预期的“回到我刚才看的地方”。
   */
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    return { top: 0 };
  }
})

export default Router
