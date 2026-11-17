<template>
  <div class="page-header">
    <div class="header-content">
      <div>
        <h1 class="page-title">{{ icon }} {{ title }}</h1>
        <p class="page-subtitle">{{ subtitle }}</p>
      </div>
      <el-button @click="$router.push('/')" class="btn-back">
        <el-icon><ArrowLeft /></el-icon>
        返回首页
      </el-button>
    </div>
  </div>
</template>

<script>
/**
 * 分析界面统一页头。
 * 样式全部走 components/r-analysis/r-analysis.css（从 PERMANOVA_Med.vue 抽取），
 * 组件本身不写 style，避免「同一个按钮三处不同圆角」。
 */
import { ArrowLeft } from '@element-plus/icons-vue';

export default {
  components: { ArrowLeft },
  name: 'AnalysisHeader',
  props: {
    icon: { type: String, default: '📊' },
    title: { type: String, required: true },
    subtitle: { type: String, default: '' }
  }
}
</script>

