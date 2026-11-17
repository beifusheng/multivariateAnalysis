<template>
  <div class="visualization-section">
    <h3>{{ title }}</h3>
    <el-tabs :model-value="active" @tab-change="(n) => $emit('update:active', n)">
      <el-tab-pane v-for="t in tabs" :key="t.id" :label="t.name" :name="t.id" />
    </el-tabs>
    <div v-if="!ready" class="chart-empty">{{ emptyText }}</div>
    <div v-else ref="host" class="chart-container" :style="{ height: height + 'px' }"></div>
  </div>
</template>

<script>
/**
 * 图表区外壳：tab 切换 + 容器 ref + 空态提示。
 * ECharts 实例由父视图创建（通过 expose 的 getHost()），
 * 因为不同分析的 option 生成器在 utils 里，视图只负责「拿到 DOM 就画」。
 */
export default {
  name: 'ChartPanel',
  props: {
    title: { type: String, default: '📈 数据可视化' },
    tabs: { type: Array, default: () => [] },
    active: { type: String, default: '' },
    ready: { type: Boolean, default: false },
    emptyText: { type: String, default: '本次结果未包含图表数据。' },
    height: { type: Number, default: 500 }
  },
  emits: ['update:active'],
  methods: {
    getHost() {
      return this.$refs.host || null;
    }
  }
}
</script>
