<template>
  <div class="template-category">
    <div class="category-title">{{ category.name }}</div>
    <div class="template-buttons">
      <TemplateButton
        v-for="template in category.templates"
        :key="template.id"
        :template="template"
        :is-selected="selectedTemplate === template.id"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script>
import TemplateButton from './TemplateButton.vue';

export default {
  name: 'TemplateCategory',
  components: {
    TemplateButton
  },
  props: {
    category: {
      type: Object,
      required: true
    },
    selectedTemplate: {
      type: String,
      default: ''
    }
  },
  emits: ['select']
}
</script>

<style scoped>
.template-category {
  margin-bottom: 24px;
}

.category-title {
  font-size: 16px;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 4px solid #667eea;
}

.template-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
</style>
