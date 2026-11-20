<template>
  <div class="visualization-section">
    <h3>{{ title }}</h3>
    <el-tabs :model-value="active" @tab-change="(n) => $emit('update:active', n)">
      <el-tab-pane v-for="t in tabs" :key="t.id" :label="t.name" :name="t.id" />
    </el-tabs>
    <div v-if="!ready" class="chart-empty">{{ emptyText }}</div>
    <!-- note：结果在、但这张图本局上就是“没东西可画”（合法空白，不是故障）。
         没这个分支时，S=1 点双标图只能收到一个挘心的「没画出来」警告，
         而图区里什么都不写 —— 用户无法区分“程序挂了”与“数学上不存在这张图”。
         注意必须用 v-else-if 而不是 v-show：后者的容器在 note 期间是 display:none，
         下一次切回来时量不到尺寸，反而变成真的 zero-size 故障。 -->
    <div v-else-if="note" class="chart-empty">{{ note }}</div>
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
    // 合法空白的说明文字（空串 = 没这回事，正常画图）。
    // 与 emptyText 分开是有意的：emptyText = 还没结果，note = 有结果但这张图本就不存在。
    note: { type: String, default: '' },
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
