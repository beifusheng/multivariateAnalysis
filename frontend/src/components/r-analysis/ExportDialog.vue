<template>
  <el-dialog :model-value="modelValue" :title="title" width="520px"
    @update:model-value="(v) => $emit('update:modelValue', v)">
    <div class="export-dialog-content">
      <p class="export-hint">{{ hint }}</p>
      <div class="export-options">
        <el-checkbox-group :model-value="selected" @update:model-value="(v) => $emit('update:selected', v)">
          <div v-for="o in options" :key="o.key" class="checkbox-wrapper">
            <el-checkbox :label="o.key">{{ o.label }}</el-checkbox>
          </div>
        </el-checkbox-group>
      </div>
      <el-alert v-if="error" type="error" :closable="false" show-icon :title="error" style="margin-top: 12px;" />
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="warning" :disabled="!selected.length" @click="$emit('confirm')">导出</el-button>
    </template>
  </el-dialog>
</template>

<script>
/**
 * 导出勾选外壳。选项清单来自各模块的 spec（[{key,label}]），这里只管显示与确认；
 * 真正写文件的 build() 在 spec 里，是纯函数，能在 Node 里断言。
 */
export default {
  name: 'ExportDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: '💾 导出结果' },
    hint: { type: String, default: '选择要导出的内容：' },
    options: { type: Array, default: () => [] },
    selected: { type: Array, default: () => [] },
    error: { type: String, default: '' }
  },
  emits: ['update:modelValue', 'update:selected', 'confirm']
};
</script>
