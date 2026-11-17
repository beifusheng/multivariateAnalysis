<template>
  <div class="template-section">
    <div class="template-header">
      <div class="template-header-title">
        <span class="template-icon">{{ icon }}</span>
        <span class="template-label">{{ label }}</span>
      </div>
      <el-button class="template-toggle-btn" @click="collapsed = !collapsed">
        <el-icon class="toggle-icon">
          <component :is="collapsed ? 'CaretRight' : 'CaretBottom'" />
        </el-icon>
        <span class="toggle-text">{{ collapsed ? '展开数据模板' : '收起数据模板' }}</span>
      </el-button>
    </div>

    <div v-if="summary" class="template-current">
      <span>📌 当前数据模板：<b>{{ selectedLabel }}</b>（{{ summary }}）</span>
      <el-button link type="primary" size="small" @click="$emit('clear')">清除</el-button>
    </div>

    <el-collapse-transition>
      <div v-show="!collapsed">
        <div class="template-note">
          <slot name="note">{{ note }}</slot>
        </div>
        <div v-for="group in groups" :key="group.name">
          <div class="template-section-title">{{ group.name }}</div>
          <div class="template-buttons">
            <el-tooltip v-for="item in group.items" :key="item.id" :content="item.tip || item.label" placement="top">
              <button type="button" @click="$emit('select', item.id)"
                :class="['btn-template', { selected: item.id === selectedId }]">
                {{ item.icon }} {{ item.label }}
              </button>
            </el-tooltip>
          </div>
        </div>
      </div>
    </el-collapse-transition>
  </div>
</template>

<script>
/**
 * 「数据模板」选择区：点一下就把可运行的合成数据填进输入框。
 *
 * 说明为什么这里直接写 button 而不是复用 TemplateButton.vue：
 * TemplateButton 取的是 template.name / template.tooltip，而数据模板的字段是
 * label / tip（与 medTemplates 的规格一致）。统一字段名要改两个既有视图，
 * 属于另一件事，等三个新视图落地后单独一次收敛（见本目录 README.md）。
 */
import { CaretRight, CaretBottom } from '@element-plus/icons-vue';

export default {
  components: { CaretRight, CaretBottom },
  name: 'DataTemplateSelector',
  props: {
    icon: { type: String, default: '🧬' },
    label: { type: String, required: true },
    note: { type: String, default: '' },
    groups: { type: Array, default: () => [] },
    selectedId: { type: String, default: '' },
    summary: { type: String, default: '' }
  },
  emits: ['select', 'clear'],
  data() {
    return { collapsed: false };
  },
  computed: {
    selectedLabel() {
      for (const g of this.groups) {
        const hit = (g.items || []).find((i) => i.id === this.selectedId);
        if (hit) return hit.label;
      }
      return '';
    }
  }
}
</script>

