<template>
  <el-dialog :model-value="modelValue" :title="title" width="760px" :close-on-click-modal="false"
    @update:model-value="(v) => $emit('update:modelValue', v)">
    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 14px;">
      <template #title>{{ hintTitle }}</template>
      <div style="line-height: 1.8; font-size: 12px;">
        <div v-for="s in sheets" :key="s.key">
          {{ s.label }}（{{ s.required ? '必需' : '可选' }}）：{{ s.desc }}
        </div>
        <div>{{ acceptLine }}</div>
      </div>
    </el-alert>

    <el-upload ref="uploadRef" drag :auto-upload="false" :limit="1" :show-file-list="false"
      :accept="accept" :on-change="onChange" :on-exceed="onExceed">
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">将文件拖到此处，或<em>点击选择</em></div>
    </el-upload>

    <el-alert v-if="error" type="error" :closable="false" show-icon :title="error" style="margin-top: 12px;" />
    <el-alert v-for="(w, i) in warnings" :key="'w' + i" type="warning" :closable="false" show-icon
      :title="w" style="margin-top: 8px;" />

    <div v-if="tabs && tabs.length" class="import-preview">
      <el-divider>数据预览</el-divider>
      <el-tabs v-model="tab">
        <el-tab-pane v-for="t in tabs" :key="t.name" :label="t.label" :name="t.name">
          <el-table :data="t.rows" border size="small" max-height="260">
            <el-table-column v-for="c in t.cols" :key="colKey(c)" :prop="colKey(c)" :label="colLabel(c)"
              :width="colKey(c) === '样本' ? 120 : undefined" :min-width="colKey(c) === '样本' ? undefined : 110" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!tabs || !tabs.length || !!error" @click="$emit('apply')">
        {{ applyLabel }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script>
import { UploadFilled } from '@element-plus/icons-vue';

/**
 * 导入对话框的外壳：说明 -> 选文件 -> 错误/警告 -> 预览 -> 由用户点"填入表单"。
 * 只有这个顺序是共用的；**哪几张表、每列什么意思**由父视图的 spec 传进来（sheets），
 * 解析结果由父视图算好后以 tabs 传入（rows/cols），这里不认得任何具体业务。
 *
 * cols 允许写 '样本' 或 { key: 'sample_id', label: '样本 ID' }，
 * 后者是 PERMANOVA / -Med 现有的写法，迁移时不必改它们的列定义。
 */
export default {
  name: 'ImportDialog',
  components: { UploadFilled },
  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: '📁 导入数据' },
    hintTitle: { type: String, default: '需要的表格（工作表名中英文都行，认不出会明确告诉你缺哪张）' },
    sheets: { type: Array, default: () => [] },
    accept: { type: String, default: '.xlsx,.xls,.csv' },
    acceptLine: { type: String, default: '支持 .xlsx / .xls / .csv；各表样本顺序可以不同，导入时按样本 ID 对齐' },
    applyLabel: { type: String, default: '填入表单' },
    tabs: { type: Array, default: null },
    error: { type: String, default: '' },
    warnings: { type: Array, default: () => [] }
  },
  emits: ['update:modelValue', 'file-change', 'apply'],
  data() {
    return { tab: '' };
  },
  watch: {
    tabs: {
      handler(v) {
        // 每次解析都回到第一个 tab，否则上次停在"坐标"、这次没有坐标表会停在空白页
        this.tab = v && v.length ? v[0].name : '';
      },
      immediate: true
    },
    // 每次打开都把队列清空：否则上次的文件还在 fileList 里，下面那个 limit=1 会吃掉选择动作
    modelValue(v) {
      if (v) this.resetUpload();
    }
  },
  methods: {
    colKey(c) {
      return typeof c === 'string' ? c : (c && c.key) || '';
    },
    colLabel(c) {
      return typeof c === 'string' ? c : (c && c.label) || c.key;
    },
    onChange(uploadFile) {
      const raw = uploadFile && (uploadFile.raw || uploadFile);
      if (raw) this.$emit('file-change', raw);
    },
    /**
     * limit=1 的坑（实机报“第二次选文件后点填入表单没反应”的真因）：
     * Element Plus 的 uploadFiles 里 `if (limit && fileList.length + files.length > limit) { onExceed(...); return; }`
     * ——auto-upload=false 时旧文件永远留在 fileList，于是新选的文件**连 on-change 都不会触发**，
     * 不接 on-exceed 就是静默无反应。这里按“后选的覆盖先选的”接住，跟一个工作簿的心智一致。
     */
    onExceed(files) {
      this.resetUpload();
      const raw = Array.isArray(files) ? files[0] : files;
      if (raw) this.$emit('file-change', raw);
    },
    resetUpload() {
      const up = this.$refs && this.$refs.uploadRef;
      if (up && typeof up.clearFiles === 'function') up.clearFiles();
    }
  }
};
</script>

<style scoped>
/* 与 ToolbarActions 同一个理由：视图的 scoped 样式选不到子组件内部的元素 */
.import-preview {
  margin-top: 20px;
}
</style>
