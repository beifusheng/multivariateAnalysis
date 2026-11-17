<template>
  <div class="result-card">
    <h3>{{ title }}</h3>
    <slot />
    <p v-if="note" class="table-note">{{ note }}</p>
  </div>
</template>

<script>
// 结果区的一张卡片（标题 + 内容 + 脚注），三个新分析共用
export default {
  name: 'ResultCard',
  props: {
    title: { type: String, required: true },
    note: { type: String, default: '' }
  }
}
</script>
