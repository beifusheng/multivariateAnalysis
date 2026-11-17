<template>
  <div class="effect-stats">
    <div v-for="it in items" :key="it.label" class="stat-item">
      <div class="stat-label">{{ it.label }}</div>
      <div class="stat-value" :style="it.valueColor ? { color: it.valueColor } : null">{{ it.value }}</div>
      <div v-if="it.sub" class="stat-sub" :class="it.subClass || ''">{{ it.sub }}</div>
    </div>
  </div>
</template>

<script>
/**
 * 关键统计量网格。
 * items: [{ label, value, sub?, subClass?, valueColor? }]
 * 只接收已格式化的字符串 —— 数字格式化统一在视图/utils 里做，
 * 组件里再 toFixed 会出现「同一个 p 值两处显示位数不同」这种问题。
 */
export default {
  name: 'StatGrid',
  props: {
    items: { type: Array, default: () => [] }
  }
}
</script>
