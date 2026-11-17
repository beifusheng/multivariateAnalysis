<template>
  <div class="side-toolbar" :class="{ 'toolbar-expanded': expanded }">
    <div class="toolbar-toggle" @click="$emit('update:expanded', !expanded)">
      <el-icon class="toggle-icon" :class="{ rotated: expanded }"><Setting /></el-icon>
    </div>
    <div class="toolbar-content">
      <slot />
    </div>
  </div>
</template>

<script>
// 侧边工具栏：只负责容器与展开态，按钮由父视图通过默认插槽给出
// （三个分析的按钮语义不同，强行统一反而要在组件里塞业务判断）
export default {
  name: 'AnalysisToolbar',
  props: {
    expanded: { type: Boolean, default: false }
  },
  emits: ['update:expanded']
}
</script>
