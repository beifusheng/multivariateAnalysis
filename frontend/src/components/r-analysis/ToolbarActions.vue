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
