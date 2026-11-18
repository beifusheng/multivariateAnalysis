<template>
  <div class="toolbar-actions">
    <el-tooltip content="下载 Excel 模板" placement="top">
      <el-button @click="$emit('template')" type="success" class="toolbar-btn">
        <el-icon><Document /></el-icon>
        <span class="btn-text">下载模板</span>
      </el-button>
    </el-tooltip>
    <el-tooltip content="导入 Excel/CSV 数据" placement="top">
      <el-button @click="$emit('import')" type="primary" class="toolbar-btn">
        <el-icon><UploadFilled /></el-icon>
        <span class="btn-text">导入数据</span>
      </el-button>
    </el-tooltip>
    <el-tooltip :content="exportTip" placement="top">
      <el-button @click="$emit('export')" type="warning" class="toolbar-btn" :disabled="!hasResult">
        <el-icon><Download /></el-icon>
        <span class="btn-text">导出结果</span>
      </el-button>
    </el-tooltip>
    <el-tooltip v-if="showInput" content="下载当前输入为 JSON（可直接复用）" placement="top">
      <el-button @click="$emit('input')" type="info" class="toolbar-btn" :disabled="!canRun">
        <el-icon><FolderOpened /></el-icon>
        <span class="btn-text">下载输入</span>
      </el-button>
    </el-tooltip>
  </div>
</template>

<script>
import { Document, Download, FolderOpened, UploadFilled } from '@element-plus/icons-vue';

/**
 * 工具栏四个动作。三个模块的**业务**完全不同，但这四个动作的语义、图标、配色、
 * 禁用条件必须一致——用户换到一个新分析页面时不该重新学一遍侧边栏。
 * 具体做什么由父视图处理事件，这里不含任何业务。
 */
export default {
  name: 'ToolbarActions',
  components: { Document, Download, FolderOpened, UploadFilled },
  props: {
    canRun: { type: Boolean, default: false },
    hasResult: { type: Boolean, default: false },
    showInput: { type: Boolean, default: true },
    exportTip: { type: String, default: '导出分析结果' }
  },
  emits: ['template', 'import', 'export', 'input']
};
</script>

<style scoped>
/*
 * 工具栏样式必须写在组件自己这里。
 * 父视图的 <style scoped> 编译成 `.toolbar-btn[data-v-父]`，而按钮是子组件内部的元素，
 * 拿不到父组件的作用域属性（SSR 渲染出的标签确实没有 data-v-）——
 * 把它们留在视图里，迁移到外壳以启的三个模块会同时失去对齐与尺寸。
 *
 * 注：旧 CSS 里的 `.toolbar-btn[type="success"]` 一类选择器从来没生效过——
 * el-button 把 type 当 prop 吃掉了，渲染出来只有 type="button"，颜色走的是
 * Element Plus 自己的 el-button--success。所以这里不搬那些死规则。
 */
.toolbar-actions {
  /* 排版方向在这里，外边距/内边距由视图的 .toolbar-content 管（免得叠成两层）*/
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar-btn {
  width: calc(100% - 24px);
  margin: 0 12px;
  justify-content: flex-start;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  height: 48px;
  display: flex;
  align-items: center;
}

.toolbar-btn .el-icon {
  font-size: 18px;
  margin-right: 10px;
  flex-shrink: 0;
}

.toolbar-btn .btn-text {
  white-space: nowrap;
}

.toolbar-btn:hover:not(:disabled) {
  transform: translateX(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
</style>
