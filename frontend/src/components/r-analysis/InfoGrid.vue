<template>
  <div class="info-grid">
    <div v-for="it in items" :key="it.label" class="info-item">
      <span class="info-label">{{ it.label }}</span>
      <code v-if="it.code" class="formula-code">{{ it.value }}</code>
      <span v-else class="info-value">{{ it.value }}</span>
    </div>
  </div>
</template>

<script>
// 模型信息网格；items: [{ label, value, code? }]，code=true 用等宽字体显示公式
export default {
  name: 'InfoGrid',
  props: {
    items: { type: Array, default: () => [] }
  }
}
</script>
