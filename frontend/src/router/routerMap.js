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
  // {
  //   path: '/r-analysis/gmr4',
  //   name: 'GMR4',
  //   component: () => import('@/views/r-analysis/GMR4.vue')
  // },
  // {
  //   path: '/r-analysis/bayesian-era',
  //   name: 'Bayesian_ERA',
  //   component: () => import('@/views/r-analysis/Bayesian_ERA.vue')
  // },
  // {
  //   path: '/r-analysis/nonrandom-permanova',
  //   name: 'Nonrandom_PERMANOVA',
  //   component: () => import('@/views/r-analysis/Nonrandom_PERMANOVA.vue')
  // },
]

export default constantRouterMap