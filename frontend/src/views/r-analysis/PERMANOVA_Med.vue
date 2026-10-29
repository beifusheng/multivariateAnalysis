<template>
  <div class="permanova-med-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <div>
          <h1 class="page-title">🧬 PERMANOVA-med 中介分析</h1>
          <p class="page-subtitle">中介效应分析：研究预测变量 X 如何通过中介变量 M 影响结果变量 Y</p>
        </div>
        <el-button @click="$router.push('/')" class="btn-back">
          <el-icon>
            <ArrowLeft />
          </el-icon>
          返回首页
        </el-button>
      </div>
    </div>

    <!-- 侧边工具栏 -->
    <div class="side-toolbar" :class="{ 'toolbar-expanded': isToolbarExpanded }">
      <div class="toolbar-toggle" @click="toggleToolbar">
        <el-icon class="toggle-icon" :class="{ 'rotated': isToolbarExpanded }">
          <Setting />
        </el-icon>
      </div>

      <div class="toolbar-content">
        <el-tooltip content="下载 Excel 模板" placement="top">
          <el-button @click="downloadTemplate" type="success" class="toolbar-btn">
            <el-icon>
              <Download />
            </el-icon>
            <span class="btn-text">下载模板</span>
          </el-button>
        </el-tooltip>

        <el-tooltip content="导入 Excel/CSV 数据" placement="top">
          <el-button @click="showImportDialog = true" type="primary" class="toolbar-btn">
            <el-icon>
              <Upload />
            </el-icon>
            <span class="btn-text">导入数据</span>
          </el-button>
        </el-tooltip>

        <el-tooltip content="导出分析结果" placement="top">
          <el-button @click="showExportDialog = true" type="warning" class="toolbar-btn" :disabled="!analysisResult">
            <el-icon>
              <FolderOpened />
            </el-icon>
            <span class="btn-text">导出结果</span>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <div class="config-section">

        <!-- 当前选择的模板 -->
        <div v-if="selectedTemplate" class="selected-template-card">
          <div class="template-card-header">
            <div class="template-card-title">
              <span class="template-icon">📌</span>
              <span>当前选择的模板</span>
            </div>
            <el-button type="info" size="small" plain round @click="clearSelectedTemplate" class="clear-btn">
              清除选择
            </el-button>
          </div>
          <div class="template-card-content">
            <div class="template-info-row">
              <span class="info-label">模板名称：</span>
              <span class="info-value template-name">{{ selectedTemplate.name }}</span>
            </div>
            <div class="template-info-row">
              <span class="info-label">模型公式：</span>
              <code class="formula-code">{{ selectedTemplate.formula }}</code>
            </div>
            <div class="template-tip">
              <span class="tip-icon">💡</span>
              <span>修改公式或数据将自动清除模板选择</span>
            </div>
          </div>
        </div>

        <!-- 常用公式模板 -->
        <div class="template-section">
          <div class="template-header">
            <div class="template-header-title">
              <span class="template-icon">📋</span>
              <span class="template-label">常用公式模板</span>
            </div>
            <el-button class="template-toggle-btn" @click="toggleTemplateCollapse">
              <el-icon class="toggle-icon">
                <component :is="templateCollapsed ? 'CaretRight' : 'CaretBottom'" />
              </el-icon>
              <span class="toggle-text">
                {{ templateCollapsed ? '展开所有模板' : '收起模板' }}
              </span>
            </el-button>
          </div>

          <el-collapse-transition>
            <div v-show="!templateCollapsed">

              <!-- 生物医学方向 -->
              <div class="template-section-title">🔬 生物医学方向</div>
              <div class="template-buttons">
                <el-tooltip content="肠道菌群通过代谢物影响疾病" placement="top">
                  <button type="button" @click="loadTemplate('gut_microbiome_metabolites')"
                    :class="['btn-template', { selected: selectedTemplateId === 'gut_microbiome_metabolites' }]">
                    🦠 肠道菌群 - 代谢物 - 疾病
                  </button>
                </el-tooltip>
                <el-tooltip content="脑肠轴通过神经递质影响行为" placement="top">
                  <button type="button" @click="loadTemplate('brain_gut_axis')"
                    :class="['btn-template', { selected: selectedTemplateId === 'brain_gut_axis' }]">
                    🧠 脑肠轴 - 神经递质 - 行为
                  </button>
                </el-tooltip>
                <el-tooltip content="免疫系统通过炎症反应影响癌症" placement="top">
                  <button type="button" @click="loadTemplate('immune_inflammation_cancer')"
                    :class="['btn-template', { selected: selectedTemplateId === 'immune_inflammation_cancer' }]">
                    🛡️ 免疫 - 炎症 - 癌症
                  </button>
                </el-tooltip>
              </div>

              <!-- 心理学方向 -->
              <div class="template-section-title">🧠 心理学方向</div>
              <div class="template-buttons">
                <el-tooltip content="压力通过睡眠质量影响抑郁" placement="top">
                  <button type="button" @click="loadTemplate('stress_depression_sleep')"
                    :class="['btn-template', { selected: selectedTemplateId === 'stress_depression_sleep' }]">
                    😴 压力 - 睡眠 - 抑郁
                  </button>
                </el-tooltip>
                <el-tooltip content="社会支持通过认知偏差影响焦虑" placement="top">
                  <button type="button" @click="loadTemplate('social_anxiety_cognition')"
                    :class="['btn-template', { selected: selectedTemplateId === 'social_anxiety_cognition' }]">
                    💭 社交 - 认知 - 焦虑
                  </button>
                </el-tooltip>
              </div>

              <!-- 教育研究方向 -->
              <div class="template-section-title">🎓 教育研究方向</div>
              <div class="template-buttons">
                <el-tooltip content="动机通过学习策略影响学业成就" placement="top">
                  <button type="button" @click="loadTemplate('motivation_strategy_achievement')"
                    :class="['btn-template', { selected: selectedTemplateId === 'motivation_strategy_achievement' }]">
                    📚 动机 - 策略 - 学业
                  </button>
                </el-tooltip>
                <el-tooltip content="教学通过学生投入影响表现" placement="top">
                  <button type="button" @click="loadTemplate('teaching_engagement_performance')"
                    :class="['btn-template', { selected: selectedTemplateId === 'teaching_engagement_performance' }]">
                    👨‍🏫 教学 - 投入 - 表现
                  </button>
                </el-tooltip>
              </div>

              <!-- 市场营销方向 -->
              <div class="template-section-title">🛒 市场营销方向</div>
              <div class="template-buttons">
                <el-tooltip content="品牌形象通过忠诚度影响购买" placement="top">
                  <button type="button" @click="loadTemplate('brand_image_loyalty_purchase')"
                    :class="['btn-template', { selected: selectedTemplateId === 'brand_image_loyalty_purchase' }]">
                    🏷️ 品牌形象 - 忠诚度 - 购买
                  </button>
                </el-tooltip>
                <el-tooltip content="广告通过品牌态度影响意向" placement="top">
                  <button type="button" @click="loadTemplate('advertising_attitude_intention')"
                    :class="['btn-template', { selected: selectedTemplateId === 'advertising_attitude_intention' }]">
                    📺 广告 - 态度 - 意向
                  </button>
                </el-tooltip>
              </div>

              <!-- 环境科学方向 -->
              <div class="template-section-title">🌿 环境科学方向</div>
              <div class="template-buttons">
                <el-tooltip content="污染通过生物多样性影响生态系统" placement="top">
                  <button type="button" @click="loadTemplate('pollution_biodiversity_ecosystem')"
                    :class="['btn-template', { selected: selectedTemplateId === 'pollution_biodiversity_ecosystem' }]">
                    🌍 污染 - 生物多样性 - 生态
                  </button>
                </el-tooltip>
              </div>

            </div>
          </el-collapse-transition>
        </div>

        <!-- 数据输入区域 -->
        <div class="data-input-section">
          <h2 class="section-title">📊 数据输入</h2>

          <div class="input-hint-card">
            <el-icon>
              <InfoFilled />
            </el-icon>
            <span>请输入 4 个数据矩阵，所有矩阵的样本数必须一致。协变量为可选项。</span>
          </div>
          <div class="data-input-grid">
            <!-- 结果变量 Y -->
            <div class="data-input-card">
              <h3>📈 结果变量 (Y)</h3>
              <p class="input-hint">因变量矩阵，n 个样本 × m 个变量</p>
              <el-input v-model="permanovaMedParams.outcomeDataStr" type="textarea" :rows="6" placeholder='请输入 JSON 格式，例如：
{
  "Sample1": [1.2, 3.4, 2.1],
  "Sample2": [2.3, 4.5, 3.2],
  "Sample3": [1.8, 3.9, 2.7]
}' @change="onOutcomeDataChange" />
              <div class="validation-status">
                <el-tag :type="permanovaMedParams.outcomeDataValid ? 'success' : 'info'" size="small">
                  {{ permanovaMedParams.outcomeDataValid ? '✓ 数据有效' : '等待输入' }}
                </el-tag>
                <span v-if="permanovaMedParams.outcomeDataError" class="error-text">
                  {{ permanovaMedParams.outcomeDataError }}
                </span>
              </div>
            </div>

            <!-- 中介变量 M -->
            <div class="data-input-card">
              <h3>🔗 中介变量 (M)</h3>
              <p class="input-hint">中介变量矩阵，n 个样本 × p 个变量</p>
              <el-input v-model="permanovaMedParams.mediatorDataStr" type="textarea" :rows="6" placeholder='请输入 JSON 格式，例如：
{
  "Sample1": [0.5, 1.2],
  "Sample2": [0.7, 1.5],
  "Sample3": [0.6, 1.3]
}' @change="onMediatorDataChange" />
              <div class="validation-status">
                <el-tag :type="permanovaMedParams.mediatorDataValid ? 'success' : 'info'" size="small">
                  {{ permanovaMedParams.mediatorDataValid ? '✓ 数据有效' : '等待输入' }}
                </el-tag>
                <span v-if="permanovaMedParams.mediatorDataError" class="error-text">
                  {{ permanovaMedParams.mediatorDataError }}
                </span>
              </div>
            </div>

            <!-- 预测变量 X -->
            <div class="data-input-card">
              <h3>📊 预测变量 (X)</h3>
              <p class="input-hint">自变量矩阵，n 个样本 × q 个变量</p>
              <el-input v-model="permanovaMedParams.predictorDataStr" type="textarea" :rows="6" placeholder='请输入 JSON 格式，例如：
{
  "Sample1": [1, 0],
  "Sample2": [0, 1],
  "Sample3": [1, 1]
}' @change="onPredictorDataChange" />
              <div class="validation-status">
                <el-tag :type="permanovaMedParams.predictorDataValid ? 'success' : 'info'" size="small">
                  {{ permanovaMedParams.predictorDataValid ? '✓ 数据有效' : '等待输入' }}
                </el-tag>
                <span v-if="permanovaMedParams.predictorDataError" class="error-text">
                  {{ permanovaMedParams.predictorDataError }}
                </span>
              </div>
            </div>

            <!-- 协变量（可选） -->
            <div class="data-input-card optional">
              <h3>🔧 协变量（可选）</h3>
              <p class="input-hint">需要控制的混杂变量</p>
              <el-input v-model="permanovaMedParams.covariatesStr" type="textarea" :rows="6" placeholder='请输入 JSON 格式，例如：
{
  "Age": [25, 30, 35],
  "BMI": [22.5, 25.0, 23.5]
}
如不需要，留空即可' @change="onCovariatesChange" />
              <div class="validation-status">
                <el-tag :type="permanovaMedParams.covariatesValid ? 'success' : 'info'" size="small">
                  {{ permanovaMedParams.covariatesValid ? '✓ 数据有效' : '可选' }}
                </el-tag>
              </div>
            </div>
          </div>

          <!-- 分析参数 -->
          <div class="analysis-params-card">
            <h3>⚙️ 分析参数</h3>
            <div class="params-grid">
              <div class="param-item">
                <label>置换次数：</label>
                <el-input-number v-model="permanovaMedParams.permutations" :min="99" :max="9999" :step="100"
                  controls-position="right" />
                <el-tooltip content="置换检验次数，越多越准确但越慢" placement="top">
                  <el-icon class="help-icon">
                    <QuestionFilled />
                  </el-icon>
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 运行分析按钮 -->
      <div class="run-section">
        <el-button type="primary" size="large" class="btn-run" @click="runPERMANOVAMed" :disabled="!canRunAnalysis">
          <el-icon>
            <VideoPlay />
          </el-icon>
          运行分析
        </el-button>
        <span v-if="!canRunAnalysis" class="run-hint">
          请确保所有数据有效
        </span>
      </div>
    </div>

    <!-- 分析结果 -->
    <div v-if="analysisResult" class="result-section">
      <h2 class="section-title">📊 分析结果</h2>

      <!-- 全局效应 -->
      <div class="global-effect-card">
        <h3>🌍 全局效应</h3>
        <div class="effect-stats">
          <div class="stat-item">
            <div class="stat-label">统计量</div>
            <div class="stat-value">{{ analysisResult.global_effect?.statistic?.toFixed(4) || 'N/A' }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">p 值</div>
            <div class="stat-value" :class="getSignificanceClass(analysisResult.global_effect?.p_value)">
              {{ analysisResult.global_effect?.p_value?.toFixed(4) || 'N/A' }}
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-label">R²</div>
            <div class="stat-value">{{ analysisResult.global_effect?.R2?.toFixed(4) || 'N/A' }}</div>
          </div>
        </div>
      </div>

      <!-- 中介效应 -->
      <div class="mediator-effects-card">
        <h3>🔗 中介效应</h3>
        <el-table :data="analysisResult.mediator_effects || []" border style="width: 100%"
          :header-cell-style="{ background: '#f0f9ff', color: '#0369a1', fontWeight: 600 }">
          <el-table-column prop="variable" label="中介变量" min-width="150" />
          <el-table-column prop="indirect_effect" label="间接效应" min-width="100">
            <template #default="scope">
              {{ scope.row.indirect_effect?.toFixed(4) }}
            </template>
          </el-table-column>
          <el-table-column prop="direct_effect" label="直接效应" min-width="100">
            <template #default="scope">
              {{ scope.row.direct_effect?.toFixed(4) }}
            </template>
          </el-table-column>
          <el-table-column prop="total_effect" label="总效应" min-width="100">
            <template #default="scope">
              {{ scope.row.total_effect?.toFixed(4) }}
            </template>
          </el-table-column>
          <el-table-column prop="p_value" label="p 值" min-width="100">
            <template #default="scope">
              <span :class="getSignificanceClass(scope.row.p_value)">
                {{ scope.row.p_value?.toFixed(4) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="proportion_mediated" label="中介比例" min-width="100">
            <template #default="scope">
              {{ (scope.row.proportion_mediated * 100)?.toFixed(2) }}%
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 可视化图表 -->
      <div class="visualization-section">
        <h3>📈 数据可视化</h3>
        <el-tabs v-model="activeChartType" @tab-click="handleChartTypeChange">
          <el-tab-pane v-for="chart in chartTypes" :key="chart.id" :label="chart.name" :name="chart.id">
            <div ref="pcoaChart" class="chart-container" style="height: 500px;"></div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>

  <!-- 导入对话框 -->
  <el-dialog v-model="showImportDialog" title="📥 导入数据" width="900px" :close-on-click-modal="false">
    <el-upload drag :auto-upload="false" :on-change="handleFileChange" :show-file-list="false" accept=".xlsx,.xls,.csv">
      <el-icon class="el-icon--upload">
        <UploadFilled />
      </el-icon>
      <div class="el-upload__text">
        将文件拖到此处，或<em>点击上传</em>
      </div>
      <template #tip>
        <div class="el-upload__tip">
          支持 Excel (.xlsx/.xls) 和 CSV 文件，包含 4 个 sheet：Outcome、Mediator、Predictor、Covariates
        </div>
      </template>
    </el-upload>

    <div v-if="importPreview" class="import-preview">
      <el-tabs v-model="importPreviewActiveTab">
        <el-tab-pane label="结果变量 (Y)" name="outcome">
          <el-table :data="importPreview.outcomePreview" border max-height="300">
            <el-table-column v-for="col in importPreview.outcomeCols" :key="col.key" :prop="col.key"
              :label="col.label" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="中介变量 (M)" name="mediator">
          <el-table :data="importPreview.mediatorPreview" border max-height="300">
            <el-table-column v-for="col in importPreview.mediatorCols" :key="col.key" :prop="col.key"
              :label="col.label" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="预测变量 (X)" name="predictor">
          <el-table :data="importPreview.predictorPreview" border max-height="300">
            <el-table-column v-for="col in importPreview.predictorCols" :key="col.key" :prop="col.key"
              :label="col.label" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="协变量" name="covariates">
          <el-table :data="importPreview.covariatesPreview" border max-height="300">
            <el-table-column v-for="col in importPreview.covariatesCols" :key="col.key" :prop="col.key"
              :label="col.label" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <el-button @click="showImportDialog = false">取消</el-button>
      <el-button type="primary" @click="confirmImport">确认导入</el-button>
    </template>
  </el-dialog>

  <!-- 导出对话框 -->
  <el-dialog v-model="showExportDialog" title="💾 导出结果" width="500px">
    <div class="export-dialog-content">
      <p class="export-hint">选择要导出的内容：</p>

      <div class="export-options">
        <el-checkbox-group v-model="exportOptions">
          <div class="checkbox-wrapper">
            <el-checkbox label="json">完整结果 (JSON)</el-checkbox>
          </div>
          <div class="checkbox-wrapper">
            <el-checkbox label="globalEffect">全局效应 (Excel)</el-checkbox>
          </div>
          <div class="checkbox-wrapper">
            <el-checkbox label="mediatorEffects">中介效应 (Excel)</el-checkbox>
          </div>
          <div class="checkbox-wrapper">
            <el-checkbox label="chartPNG">当前图表 (PNG)</el-checkbox>
          </div>
        </el-checkbox-group>
      </div>
    </div>

    <template #footer>
      <el-button @click="showExportDialog = false">取消</el-button>
      <el-button type="warning" @click="confirmExport" :disabled="exportOptions.length === 0">
        导出
      </el-button>
    </template>
  </el-dialog>
</template>

<script>
import { defineComponent } from 'vue';
import {
  ArrowLeft, Document, Connection, DataLine, TrendCharts,
  Histogram, Filter, InfoFilled, QuestionFilled, VideoPlay, UploadFilled,
  Download, Upload, FolderOpened, Setting, CaretRight, CaretBottom
} from '@element-plus/icons-vue';
import { ElLoading, ElMessage } from 'element-plus';
import TemplateCategory from '../../components/r-analysis/TemplateCategory.vue';
import templateData from '../../data/permanova-med-templates.json';
import chartConfig from '../../data/permanova-med-charts.json';

export default defineComponent({
  name: 'PERMANOVA_Med',
  components: {
    TemplateCategory,
    ArrowLeft, Document, Connection, DataLine, TrendCharts,
    Histogram, Filter, InfoFilled, QuestionFilled, VideoPlay, UploadFilled,
    Download, Upload, FolderOpened, Setting, CaretRight, CaretBottom
  },
  data() {
    return {
      // 模板相关
      selectedTemplateId: null,
      selectedTemplate: null,
      templateCollapsed: false,

      // 分析参数
      permanovaMedParams: {
        outcomeDataStr: '',
        mediatorDataStr: '',
        predictorDataStr: '',
        covariatesStr: '',
        outcomeDataValid: false,
        mediatorDataValid: false,
        predictorDataValid: false,
        covariatesValid: true,
        outcomeDataError: '',
        mediatorDataError: '',
        predictorDataError: '',
        covariatesError: '',
        permutations: 999
      },

      // 分析结果
      analysisResult: null,

      // 图表相关
      activeChartType: 'path',

      // 侧边栏
      isToolbarExpanded: true,

      // 导入相关
      showImportDialog: false,
      importPreview: null,
      importPreviewActiveTab: 'outcome',
      importError: '',
      importedData: null,

      // 导出相关
      showExportDialog: false,
      exportOptions: ['json', 'globalEffect', 'mediatorEffects', 'chartPNG'],
      exportError: ''
    };
  },

  computed: {
    templateConfig() {
      return templateData;
    },

    chartTypes() {
      return chartConfig.chartTypes.filter(c => c.enabled);
    },

    canRunAnalysis() {
      return this.permanovaMedParams.outcomeDataValid &&
        this.permanovaMedParams.mediatorDataValid &&
        this.permanovaMedParams.predictorDataValid;
    }
  },

  mounted() {
    console.log('[PERMANOVA-med] mounted');
  },

  methods: {
    // 返回主页
    goBack() {
      this.$router.push('/');
    },

    // 切换工具栏
    toggleToolbar() {
      this.isToolbarExpanded = !this.isToolbarExpanded;
    },

    // 切换模板折叠状态
    toggleTemplateCollapse() {
      this.templateCollapsed = !this.templateCollapsed;
    },

    // 加载模板
    loadTemplate(templateId) {
      console.log('[PERMANOVA-med] Load template:', templateId);

      if (this.selectedTemplateId === templateId) {
        this.clearSelectedTemplate();
        return;
      }

      this.selectedTemplateId = templateId;

      // 查找模板
      for (const cat of this.templateConfig.categories) {
        const tmpl = cat.templates.find(t => t.id === templateId);
        if (tmpl) {
          this.selectedTemplate = { ...tmpl, color: cat.color };
          break;
        }
      }

      console.log('[PERMANOVA-med] Loaded template:', this.selectedTemplate);
    },

    // 清除选择
    clearSelectedTemplate() {
      this.selectedTemplateId = null;
      this.selectedTemplate = null;
    },

    // 数据验证
    validateOutcomeData() {
      try {
        if (!this.permanovaMedParams.outcomeDataStr.trim()) {
          this.permanovaMedParams.outcomeDataValid = false;
          this.permanovaMedParams.outcomeDataError = '请输入结果变量数据';
          return;
        }

        const data = JSON.parse(this.permanovaMedParams.outcomeDataStr);
        const keys = Object.keys(data);

        if (keys.length === 0) {
          this.permanovaMedParams.outcomeDataValid = false;
          this.permanovaMedParams.outcomeDataError = '至少需要一个样本';
          return;
        }

        const firstLength = data[keys[0]].length;
        for (const key of keys) {
          if (!Array.isArray(data[key]) || data[key].length !== firstLength) {
            this.permanovaMedParams.outcomeDataValid = false;
            this.permanovaMedParams.outcomeDataError = '所有变量的数组长度必须一致';
            return;
          }
        }

        this.permanovaMedParams.outcomeDataValid = true;
        this.permanovaMedParams.outcomeDataError = '';
      } catch (e) {
        this.permanovaMedParams.outcomeDataValid = false;
        this.permanovaMedParams.outcomeDataError = 'JSON 格式错误：' + e.message;
      }
    },

    validateMediatorData() {
      try {
        if (!this.permanovaMedParams.mediatorDataStr.trim()) {
          this.permanovaMedParams.mediatorDataValid = false;
          this.permanovaMedParams.mediatorDataError = '请输入中介变量数据';
          return;
        }

        const data = JSON.parse(this.permanovaMedParams.mediatorDataStr);
        const keys = Object.keys(data);

        if (keys.length === 0) {
          this.permanovaMedParams.mediatorDataValid = false;
          this.permanovaMedParams.mediatorDataError = '至少需要一个样本';
          return;
        }

        const firstLength = data[keys[0]].length;
        for (const key of keys) {
          if (!Array.isArray(data[key]) || data[key].length !== firstLength) {
            this.permanovaMedParams.mediatorDataValid = false;
            this.permanovaMedParams.mediatorDataError = '所有变量的数组长度必须一致';
            return;
          }
        }

        this.permanovaMedParams.mediatorDataValid = true;
        this.permanovaMedParams.mediatorDataError = '';
      } catch (e) {
        this.permanovaMedParams.mediatorDataValid = false;
        this.permanovaMedParams.mediatorDataError = 'JSON 格式错误：' + e.message;
      }
    },

    validatePredictorData() {
      try {
        if (!this.permanovaMedParams.predictorDataStr.trim()) {
          this.permanovaMedParams.predictorDataValid = false;
          this.permanovaMedParams.predictorDataError = '请输入预测变量数据';
          return;
        }

        const data = JSON.parse(this.permanovaMedParams.predictorDataStr);
        const keys = Object.keys(data);

        if (keys.length === 0) {
          this.permanovaMedParams.predictorDataValid = false;
          this.permanovaMedParams.predictorDataError = '至少需要一个样本';
          return;
        }

        const firstLength = data[keys[0]].length;
        for (const key of keys) {
          if (!Array.isArray(data[key]) || data[key].length !== firstLength) {
            this.permanovaMedParams.predictorDataValid = false;
            this.permanovaMedParams.predictorDataError = '所有变量的数组长度必须一致';
            return;
          }
        }

        this.permanovaMedParams.predictorDataValid = true;
        this.permanovaMedParams.predictorDataError = '';
      } catch (e) {
        this.permanovaMedParams.predictorDataValid = false;
        this.permanovaMedParams.predictorDataError = 'JSON 格式错误：' + e.message;
      }
    },

    validateCovariates() {
      try {
        if (!this.permanovaMedParams.covariatesStr.trim()) {
          this.permanovaMedParams.covariatesValid = true;
          return;
        }

        const data = JSON.parse(this.permanovaMedParams.covariatesStr);
        const keys = Object.keys(data);

        if (keys.length === 0) {
          this.permanovaMedParams.covariatesValid = true;
          return;
        }

        const firstLength = data[keys[0]].length;
        for (const key of keys) {
          if (!Array.isArray(data[key]) || data[key].length !== firstLength) {
            this.permanovaMedParams.covariatesValid = false;
            this.permanovaMedParams.covariatesError = '所有变量的数组长度必须一致';
            return;
          }
        }

        this.permanovaMedParams.covariatesValid = true;
        this.permanovaMedParams.covariatesError = '';
      } catch (e) {
        this.permanovaMedParams.covariatesValid = false;
        this.permanovaMedParams.covariatesError = 'JSON 格式错误：' + e.message;
      }
    },

    onOutcomeDataChange() {
      this.validateOutcomeData();
    },

    onMediatorDataChange() {
      this.validateMediatorData();
    },

    onPredictorDataChange() {
      this.validatePredictorData();
    },

    onCovariatesChange() {
      this.validateCovariates();
    },

    // 运行分析
    async runPERMANOVAMed() {
      console.log('[PERMANOVA-med] runPERMANOVAMed called');

      const loadingInstance = ElLoading.service({
        lock: true,
        text: '正在执行 PERMANOVA-med 分析...',
        background: 'rgba(0, 0, 0, 0.5)'
      });

      try {
        // 使用用户输入的数据
        const params = {
          outcomeData: JSON.parse(this.permanovaMedParams.outcomeDataStr),
          mediatorData: JSON.parse(this.permanovaMedParams.mediatorDataStr),
          predictorData: JSON.parse(this.permanovaMedParams.predictorDataStr),
          covariates: this.permanovaMedParams.covariatesStr.trim() ?
            JSON.parse(this.permanovaMedParams.covariatesStr) : null,
          permutations: this.permanovaMedParams.permutations
        };

        console.log('[PERMANOVA-med] Running analysis with params:', params);

        const result = await window.electron.ipc.invoke(
          'controller/r/runPERMANOVAMed',
          JSON.parse(JSON.stringify(params))
        );

        console.log('[PERMANOVA-med] Analysis result:', result);

        if (result.success) {
          this.analysisResult = result;
          ElMessage.success('PERMANOVA-med 分析完成！');

          // 自动切换到结果区域
          this.$nextTick(() => {
            document.querySelector('.result-section')?.scrollIntoView({ behavior: 'smooth' });
          });
        } else {
          ElMessage.error('分析失败：' + (result.error || '未知错误'));
        }
      } catch (error) {
        console.error('[PERMANOVA-med] Analysis error:', error);
        ElMessage.error('分析失败：' + error.message);
      } finally {
        loadingInstance.close();
      }
    },

    // 处理图表切换
    handleChartTypeChange() {
      console.log('[PERMANOVA-med] Chart type changed to:', this.activeChartType);
      this.$nextTick(() => {
        this.renderCurrentChart();
      });
    },

    // 渲染当前图表
    renderCurrentChart() {
      const chartContainer = this.$refs.pcoaChart;
      if (!chartContainer || !this.analysisResult) return;

      const echarts = require('echarts');
      let myChart = echarts.getInstanceByDom(chartContainer);

      if (!myChart) {
        myChart = echarts.init(chartContainer);
      } else {
        myChart.clear();
      }

      const chartType = this.activeChartType;
      console.log('[PERMANOVA-med] Rendering chart:', chartType);

      // TODO: 实现各种图表渲染
      // 暂时显示占位
      const option = {
        title: {
          text: '图表开发中...',
          left: 'center',
          top: 'center'
        }
      };

      myChart.setOption(option);
    },

    // 下载模板
    async downloadTemplate() {
      try {
        const XLSX = await import('xlsx');
        const FileSaver = await import('file-saver');

        const wb = XLSX.utils.book_new();

        // 创建 4 个 sheet
        const outcomeSheet = XLSX.utils.aoa_to_sheet([
          ['样本 ID', 'Y1', 'Y2', 'Y3'],
          ['Sample1', 1.2, 3.4, 2.1],
          ['Sample2', 2.3, 4.5, 3.2]
        ]);

        const mediatorSheet = XLSX.utils.aoa_to_sheet([
          ['样本 ID', 'M1', 'M2'],
          ['Sample1', 0.5, 1.2],
          ['Sample2', 0.7, 1.5]
        ]);

        const predictorSheet = XLSX.utils.aoa_to_sheet([
          ['样本 ID', 'X1'],
          ['Sample1', 1],
          ['Sample2', 0]
        ]);

        const covariatesSheet = XLSX.utils.aoa_to_sheet([
          ['样本 ID', 'Age', 'BMI'],
          ['Sample1', 25, 22.5],
          ['Sample2', 30, 25.0]
        ]);

        XLSX.utils.book_append_sheet(wb, outcomeSheet, 'Outcome');
        XLSX.utils.book_append_sheet(wb, mediatorSheet, 'Mediator');
        XLSX.utils.book_append_sheet(wb, predictorSheet, 'Predictor');
        XLSX.utils.book_append_sheet(wb, covariatesSheet, 'Covariates');

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        FileSaver.saveAs(blob, `PERMANOVA-med 模板_${timestamp}.xlsx`);

        ElMessage.success('模板下载成功！');
      } catch (error) {
        console.error('[PERMANOVA-med] Download template error:', error);
        ElMessage.error('模板下载失败：' + error.message);
      }
    },

    // 处理文件导入
    handleFileChange(file) {
      console.log('[PERMANOVA-med] File selected:', file.name);

      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const XLSX = await import('xlsx');
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });

          console.log('[PERMANOVA-med] Workbook sheets:', workbook.SheetNames);

          // 解析 4 个 sheet
          const outcomeData = XLSX.utils.sheet_to_json(workbook.Sheets['Outcome']);
          const mediatorData = XLSX.utils.sheet_to_json(workbook.Sheets['Mediator']);
          const predictorData = XLSX.utils.sheet_to_json(workbook.Sheets['Predictor']);
          const covariatesData = workbook.Sheets['Covariates'] ?
            XLSX.utils.sheet_to_json(workbook.Sheets['Covariates']) : [];

          console.log('[PERMANOVA-med] Parsed data:', {
            outcome: outcomeData.length,
            mediator: mediatorData.length,
            predictor: predictorData.length,
            covariates: covariatesData.length
          });

          this.importPreview = {
            outcomePreview: outcomeData,
            outcomeCols: outcomeData.length > 0 ?
              Object.keys(outcomeData[0]).map(k => ({ key: k, label: k })) : [],
            mediatorPreview: mediatorData,
            mediatorCols: mediatorData.length > 0 ?
              Object.keys(mediatorData[0]).map(k => ({ key: k, label: k })) : [],
            predictorPreview: predictorData,
            predictorCols: predictorData.length > 0 ?
              Object.keys(predictorData[0]).map(k => ({ key: k, label: k })) : [],
            covariatesPreview: covariatesData,
            covariatesCols: covariatesData.length > 0 ?
              Object.keys(covariatesData[0]).map(k => ({ key: k, label: k })) : []
          };

          this.importedData = {
            outcome: outcomeData,
            mediator: mediatorData,
            predictor: predictorData,
            covariates: covariatesData
          };

        } catch (error) {
          console.error('[PERMANOVA-med] Parse file error:', error);
          this.importError = '文件解析失败：' + error.message;
        }
      };

      reader.onerror = () => {
        this.importError = '文件读取失败';
      };

      reader.readAsArrayBuffer(file.raw);
    },

    // 确认导入
    confirmImport() {
      if (!this.importedData) {
        ElMessage.error('请先选择文件');
        return;
      }

      try {
        // 转换数据格式
        const outcomeData = this.convertImportData(this.importedData.outcome);
        const mediatorData = this.convertImportData(this.importedData.mediator);
        const predictorData = this.convertImportData(this.importedData.predictor);
        const covariatesData = this.importedData.covariates.length > 0 ?
          this.convertImportData(this.importedData.covariates) : null;

        // 填充到输入框
        this.permanovaMedParams.outcomeDataStr = JSON.stringify(outcomeData, null, 2);
        this.permanovaMedParams.mediatorDataStr = JSON.stringify(mediatorData, null, 2);
        this.permanovaMedParams.predictorDataStr = JSON.stringify(predictorData, null, 2);
        this.permanovaMedParams.covariatesStr = covariatesData ?
          JSON.stringify(covariatesData, null, 2) : '';

        // 验证数据
        this.validateOutcomeData();
        this.validateMediatorData();
        this.validatePredictorData();
        this.validateCovariates();

        this.showImportDialog = false;
        ElMessage.success('数据导入成功！');
      } catch (error) {
        console.error('[PERMANOVA-med] Import error:', error);
        ElMessage.error('导入失败：' + error.message);
      }
    },

    // 转换导入数据格式
    convertImportData(dataArray) {
      const result = {};
      if (dataArray.length === 0) return result;

      const keys = Object.keys(dataArray[0]);
      const sampleIdKey = keys.find(k => k.includes('样本') || k.toLowerCase().includes('sample') || k === 'id');

      if (!sampleIdKey) {
        // 如果没有样本 ID 列，使用索引
        for (let i = 0; i < dataArray.length; i++) {
          result[`Sample${i + 1}`] = keys
            .filter(k => k !== 'id')
            .map(k => dataArray[i][k]);
        }
      } else {
        // 使用样本 ID 列
        for (const row of dataArray) {
          const sampleId = row[sampleIdKey];
          result[sampleId] = keys
            .filter(k => k !== sampleIdKey)
            .map(k => row[k]);
        }
      }

      return result;
    },

    // 导出结果
    async confirmExport() {
      if (!this.analysisResult) {
        ElMessage.error('没有可导出的分析结果');
        return;
      }

      try {
        const XLSX = await import('xlsx');
        const { saveAs } = await import('file-saver');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

        // 导出 JSON
        if (this.exportOptions.includes('json')) {
          const jsonStr = JSON.stringify(this.analysisResult, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          saveAs(blob, `PERMANOVA-med 结果_${timestamp}.json`);
        }

        // 导出全局效应
        if (this.exportOptions.includes('globalEffect')) {
          const ws = XLSX.utils.json_to_sheet([this.analysisResult.global_effect]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Global_Effect');
          const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([wbout], { type: 'application/octet-stream' });
          saveAs(blob, `全局效应_${timestamp}.xlsx`);
        }

        // 导出中介效应
        if (this.exportOptions.includes('mediatorEffects')) {
          const ws = XLSX.utils.json_to_sheet(this.analysisResult.mediator_effects);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Mediator_Effects');
          const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([wbout], { type: 'application/octet-stream' });
          saveAs(blob, `中介效应_${timestamp}.xlsx`);
        }

        // 导出图表
        if (this.exportOptions.includes('chartPNG')) {
          const chartContainer = this.$refs.pcoaChart;
          if (chartContainer) {
            const echarts = await import('echarts');
            const myChart = echarts.getInstanceByDom(chartContainer);
            if (myChart) {
              const url = myChart.getDataURL({
                type: 'png',
                pixelRatio: 2,
                backgroundColor: '#ffffff'
              });
              saveAs(url, `分析图表_${timestamp}.png`);
            }
          }
        }

        this.showExportDialog = false;
        ElMessage.success('导出成功！');
      } catch (error) {
        console.error('[PERMANOVA-med] Export error:', error);
        ElMessage.error('导出失败：' + error.message);
      }
    },

    // 获取显著性样式
    getSignificanceClass(pValue) {
      if (!pValue) return '';
      if (pValue < 0.001) return 'significance-high';
      if (pValue < 0.01) return 'significance-medium';
      if (pValue < 0.05) return 'significance-low';
      return '';
    }
  }
});
</script>

<style scoped>
.permanova-med-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
}

.page-header {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 20px;
  padding: 28px 36px;
  margin-bottom: 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-back {
  padding: 12px 28px;
  font-size: 15px;
  font-weight: 700;
  border-radius: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  color: white;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-back:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.5);
}

.btn-back:active {
  transform: translateY(-1px);
}

.page-title {
  font-size: 36px;
  font-weight: 800;
  margin: 0 0 10px 0;
  color: #1a202c;
  letter-spacing: -0.5px;
}

.page-subtitle {
  font-size: 17px;
  color: #718096;
  margin: 0;
  font-weight: 400;
  line-height: 1.6;
}

/* 主内容区域 */
.main-content {
  max-width: 1400px;
  margin: 0 auto;
}

.config-section {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 20px;
  padding: 36px 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.3);
  margin-bottom: 30px;
}

/* 模板区域样式（与 PERMANOVA 保持一致） */
.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 8px;
  border: 1px solid #bae6fd;
  box-shadow: 0 2px 8px rgba(14, 165, 233, 0.1);
}

.template-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.template-icon {
  font-size: 20px;
}

.template-label {
  font-size: 15px;
  font-weight: 600;
  color: #0369a1;
  letter-spacing: 0.5px;
}

.template-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(14, 165, 233, 0.3);
}

.template-toggle-btn:hover {
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.5);
}

.template-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1890ff;
  margin: 16px 0 8px 0;
  padding: 8px 12px;
  background: linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%);
  border-radius: 6px;
  border-left: 4px solid #1890ff;
}

.template-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.btn-template {
  padding: 10px 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-template:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
}

.btn-template:active {
  transform: translateY(0);
}

.btn-template.selected {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.5);
  border: 2px solid #fff;
}

/* 当前选择的模板卡片 */
.selected-template-card {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border: 2px solid #bae6fd;
  border-radius: 12px;
  padding: 20px;
  margin: 16px 0;
  box-shadow: 0 4px 16px rgba(3, 105, 161, 0.1);
  transition: all 0.3s ease;
}

.selected-template-card:hover {
  box-shadow: 0 6px 20px rgba(3, 105, 161, 0.15);
  border-color: #7dd3fc;
}

.template-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid #bae6fd;
}

.template-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #0369a1;
}

.clear-btn {
  border-color: #0284c7;
  color: #0284c7;
  font-size: 13px;
  padding: 6px 16px;
  transition: all 0.3s ease;
}

.clear-btn:hover {
  background: #0284c7;
  color: white;
}

.template-card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-info-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-label {
  font-weight: 600;
  color: #0369a1;
  white-space: nowrap;
  min-width: 80px;
  font-size: 14px;
  flex-shrink: 0;
}

.info-value {
  flex: 1;
  color: #0c4a6e;
  font-size: 14px;
  line-height: 1.6;
  text-align: left;
}

.template-name {
  font-weight: 600;
  color: #0369a1;
}

.formula-code {
  background: rgba(255, 255, 255, 0.6);
  padding: 6px 12px;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.template-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border-radius: 8px;
  border: 1px solid #fde68a;
  font-size: 13px;
  color: #92400e;
}

.tip-icon {
  font-size: 16px;
}

.template-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.template-icon {
  font-size: 28px;
}

.template-title {
  font-size: 24px;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
}

.template-formula,
.template-description,
.template-details .detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 12px;
  margin-bottom: 12px;
  font-size: 15px;
  color: #334155;
}

.template-formula .el-icon,
.template-description .el-icon,
.template-details .detail-row .el-icon {
  font-size: 20px;
  color: #0369a1;
  flex-shrink: 0;
  margin-top: 2px;
}

/* 数据输入区域 */
.data-input-section {
  max-width: 1400px;
  margin: 0 auto 30px;
}

.input-hint-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 12px;
  border: 2px solid #bae6fd;
  margin-bottom: 24px;
  font-size: 15px;
  color: #0369a1;
}

.input-hint-card .el-icon {
  font-size: 20px;
  color: #0284c7;
}

.data-input-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 24px;
  margin-bottom: 24px;
}

.data-input-card {
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 24px;
  transition: all 0.3s ease;
}

.data-input-card:hover {
  border-color: #667eea;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.15);
}

.data-input-card.optional {
  border-style: dashed;
}

.data-input-card h3 {
  font-size: 18px;
  font-weight: 700;
  color: #1a202c;
  margin: 0 0 8px;
}

.input-hint {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 12px;
}

.validation-status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.error-text {
  font-size: 13px;
  color: #ef4444;
}

/* 分析参数 */
.analysis-params-card {
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 24px;
  margin-top: 24px;
}

.analysis-params-card h3 {
  font-size: 18px;
  font-weight: 700;
  color: #1a202c;
  margin: 0 0 16px;
}

.params-grid {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.param-item label {
  font-size: 15px;
  color: #475569;
  font-weight: 500;
}

.help-icon {
  color: #94a3b8;
  cursor: help;
}

/* 运行按钮 */
.run-section {
  margin-top: 32px;
  text-align: center;
}

.btn-run {
  padding: 16px 64px;
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
  transition: all 0.3s ease;
}

.btn-run:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.5);
}

.btn-run:active:not(:disabled) {
  transform: translateY(-1px);
}

.btn-run:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.run-hint {
  display: block;
  margin-top: 12px;
  font-size: 14px;
  color: #64748b;
}

/* 结果区域 */
.result-section {
  max-width: 1400px;
  margin: 0 auto 30px;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 20px;
  padding: 32px 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.global-effect-card,
.mediator-effects-card,
.visualization-section {
  margin-bottom: 32px;
}

.global-effect-card h3,
.mediator-effects-card h3,
.visualization-section h3 {
  font-size: 20px;
  font-weight: 700;
  color: #1a202c;
  margin: 0 0 20px;
}

.effect-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.stat-item {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}

.stat-label {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #0369a1;
}

.stat-value.significance-high {
  color: #ef4444;
}

.stat-value.significance-medium {
  color: #f59e0b;
}

.stat-value.significance-low {
  color: #10b981;
}

/* 图表容器 */
.chart-container {
  width: 100%;
  height: 500px;
}

/* 侧边工具栏 */
.side-toolbar {
  position: fixed;
  right: 0px;
  top: 50%;
  transform: translateY(-50%);
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 8px 0 0 8px;
  box-shadow: -4px 4px 24px rgba(0, 0, 0, 0.12);
  border: 2px solid #e2e8f0;
  transition: all 0.3s ease;
  z-index: 1000;
  overflow: visible;
}

.side-toolbar.toolbar-expanded {
  width: 180px;
}

.side-toolbar:not(.toolbar-expanded) {
  width: 0px;
}

.toolbar-toggle {
  position: absolute;
  left: -20px;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 1001;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.toolbar-toggle:hover {
  transform: translateY(-50%) scale(1.1);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.toggle-icon {
  color: white;
  font-size: 20px;
  transition: transform 0.3s ease;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

.toolbar-content {
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  opacity: 1;
  visibility: visible;
  transition: opacity 0.2s ease, visibility 0.2s ease;
}

.side-toolbar:not(.toolbar-expanded) .toolbar-content {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.toolbar-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.toolbar-btn .btn-text {
  font-size: 14px;
  font-weight: 500;
}

/* 导入/导出对话框 */
.import-preview {
  margin-top: 20px;
}

.export-dialog-content {
  padding: 20px 0;
}

.export-hint {
  font-size: 15px;
  color: #475569;
  margin: 0 0 20px;
}

.export-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
}

/* 响应式 */
@media (max-width: 768px) {
  .data-input-grid {
    grid-template-columns: 1fr;
  }

  .effect-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
