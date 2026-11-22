/**
 * 基础路由
 * @type { *[] }
 */

const constantRouterMap = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue')
  },
  // R 统计分析方法
  {
    path: '/r-analysis/permanova',
    name: 'PERMANOVA',
    component: () => import('@/views/r-analysis/PERMANOVA.vue')
  },
  // PERMANOVA-med 中介分析
  {
    path: '/r-analysis/permanova-med',
    name: 'PERMANOVA_Med',
    component: () => import('@/views/r-analysis/PERMANOVA_Med.vue')
  },
  // Non-random PERMANOVA（分层 / 空间受限置换）
  {
    path: '/r-analysis/nonrandom-permanova',
    name: 'Nonrandom_PERMANOVA',
    component: () => import('@/views/r-analysis/Nonrandom_PERMANOVA.vue')
  },
  // GMR⁴：引擎已闭式实现并通过 17 项验收，视图与导出复用另三个模块的三层外壳
  {
    path: '/r-analysis/gmr4',
    name: 'GMR4',
    component: () => import('@/views/r-analysis/GMR4.vue')
  },
  // Bayesian ERA：引擎 40 项验收（恒等式 / vegan::rda 锚点 / 后验对 OLS / 同 seed 复现）已过，
  // 视图 Bayesian_ERA.vue 已存在。上一版这里被注释掉而首页卡片写着“缺界面与路由”——
  // 那种“文案比代码先进”就是我们对用户说假话；test_home_status 现在两边都控。
  {
    path: '/r-analysis/bayesian-era',
    name: 'Bayesian_ERA',
    component: () => import('@/views/r-analysis/Bayesian_ERA.vue')
  },
]

export default constantRouterMap