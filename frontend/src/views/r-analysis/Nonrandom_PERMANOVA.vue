<template>
  <div class="ra-shell">
    <AnalysisHeader
      icon="🎲"
      title="Non-random PERMANOVA（受限置换）"
      subtitle="分层 / 空间受限置换：当采样设计本身有结构时，任意乱序会造出现实中不存在的零分布，p 值偏乐观"
    />

    <AnalysisToolbar v-model:expanded="isToolbarExpanded">
      <el-tooltip content="下载 Excel 模板（物种矩阵 / 样本信息 / 坐标）" placement="top">
        <el-button @click="downloadTemplate" type="success" class="toolbar-btn">
          <el-icon><Document /></el-icon>
          <span class="btn-text">下载模板</span>
        </el-button>
      </el-tooltip>
      <el-tooltip content="导入 Excel/CSV 数据" placement="top">
        <el-button @click="openImport" type="primary" class="toolbar-btn">
          <el-icon><UploadFilled /></el-icon>
          <span class="btn-text">导入数据</span>
        </el-button>
      </el-tooltip>
      <el-tooltip content="导出分析结果（Excel / JSON / 图表 PNG）" placement="top">
        <el-button @click="openExport" type="warning" class="toolbar-btn" :disabled="!analysisResult">
          <el-icon><Download /></el-icon>
          <span class="btn-text">导出结果</span>
        </el-button>
      </el-tooltip>
      <el-tooltip content="下载当前输入为 JSON（可直接复用）" placement="top">
        <el-button @click="downloadInput" type="info" class="toolbar-btn" :disabled="!canRun">
          <el-icon><FolderOpened /></el-icon>
          <span class="btn-text">下载输入</span>
        </el-button>
      </el-tooltip>
    </AnalysisToolbar>

    <div class="main-content">
      <div class="config-section">
        <!-- 选中模板后的设计说明：置换方案能不能纠正假阳性，取决于设计是否混淆，
             所以这里必须把「混淆度 / 区组数」摊开给用户看，而不是只给个名字 -->
        <div v-if="selectedTemplate" class="selected-template-card">
          <div class="template-card-header">
            <div class="template-card-title">
              <span class="template-icon">📌</span>
              <span>当前设计模板</span>
            </div>
            <el-button type="info" size="small" plain round class="clear-btn" @click="clearNrTemplate">清除选择</el-button>
          </div>
          <div class="template-card-content">
            <div class="template-info-row">
              <span class="info-label">实验设计：</span>
              <span class="info-value">{{ selectedTemplate.label }}</span>
            </div>
            <div class="template-info-row">
              <span class="info-label">结构说明：</span>
              <span class="info-value">{{ builtDesign }}</span>
            </div>
            <div class="template-info-row">
              <span class="info-label">预期结论：</span>
              <span class="info-value">{{ expectText }}</span>
            </div>
            <div class="template-tip">
              <span class="tip-icon">💡</span>
              <span>{{ selectedTemplate.spec.note || selectedTemplate.tip }}</span>
            </div>
          </div>
        </div>

        <DataTemplateSelector
          icon="🎲"
          :label="`设计模板（${nrCount} 个 · 含可运行数据）`"
          :groups="nrGroups"
          :selected-id="selectedNrId"
          :summary="nrSummary"
          note="点击后自动写入物种矩阵 / 样本信息 / 空间坐标与置换方案，可直接点「运行分析」。数据为程序按设计规格合成的演示数据（非实测），已用便携版 R 逐个实测：26/26 的 p_free / p_constrained 与预期结论一致。"
          @select="loadNrTemplate"
          @clear="clearNrTemplate"
        />

        <!-- 数据输入 -->
        <div class="data-input-section">
          <h2 class="section-title">📊 数据输入</h2>
          <div class="input-hint-card">
            <el-icon><InfoFilled /></el-icon>
            <span>物种矩阵（样本 × 物种，非负计数）与样本信息表（每行一个样本）样本数必须一致；空间坐标仅在 scheme=spatial 时必填。</span>
          </div>

          <div class="data-input-grid">
            <div class="data-input-card">
              <h3>🦠 物种矩阵 (communityData)</h3>
              <p class="input-hint">n 个样本 × p 个物种，推荐二维数组（每行一个样本）
[
  [3, 0, 7, 1],
  [0, 5, 2, 0],
  [4, 1, 6, 2]
]</p>
              <el-input v-model="form.communityStr" type="textarea" :rows="7"
                placeholder="也支持 {&quot;S1&quot;: [3,0,7]} 行字典与 {&quot;OTU1&quot;: [3,0,4]} 列字典"
                />
              <div class="validation-status">
                <el-tag :type="checks.community.ok ? 'success' : 'info'" size="small">
                  {{ checks.community.ok ? `✓ ${checks.community.n} 样本 × ${checks.community.p} 物种` : '等待输入' }}
                </el-tag>
                <span v-if="checks.community.error" class="error-text">{{ checks.community.error }}</span>
              </div>
            </div>

            <div class="data-input-card">
              <h3>🧾 样本信息表 (sampleData)</h3>
              <p class="input-hint">行对象数组（每行一个样本）
[
  {"sample":"S1","group":"Control","strata":"B1"},
  {"sample":"S2","group":"Treatment","strata":"B1"}
]
或列字典 {"group":["Control","Treatment"],
        "strata":["B1","B1"]}</p>
              <el-input v-model="form.sampleStr" type="textarea" :rows="7"
                placeholder='至少要有公式里用到的变量；分层置换还需要 strata 列' />
              <div class="validation-status">
                <el-tag :type="checks.sample.ok ? 'success' : 'info'" size="small">
                  {{ checks.sample.ok ? `✓ ${checks.sample.n} 行 · 列：${checks.sample.columns.join(', ')}` : '等待输入' }}
                </el-tag>
                <span v-if="checks.sample.error" class="error-text">{{ checks.sample.error }}</span>
              </div>
            </div>

            <div class="data-input-card" :class="{ optional: form.scheme !== 'spatial' }">
              <h3>🗺️ 空间坐标 (coordinates) <span v-if="form.scheme !== 'spatial'" class="input-hint">— 仅 scheme=spatial 需要</span></h3>
              <p class="input-hint">[[x, y], ...]，每行对应一个样本；脚本按邻域半径（spatialBand）
决定哪些样本之间可以互相交换标签
[
  [1.2, 3.4],
  [1.5, 3.1],
  [42.0, 17.8]
]</p>
              <el-input v-model="form.coordinatesStr" type="textarea" :rows="7" placeholder="[[0,0],[1,0],[40,12], ...]" />
              <div class="validation-status">
                <el-tag :type="checks.coords.ok ? 'success' : 'info'" size="small">
                  {{ checks.coords.ok ? (checks.coords.n ? `✓ ${checks.coords.n} 个坐标` : '未提供') : '等待输入' }}
                </el-tag>
                <span v-if="checks.coords.error" class="error-text">{{ checks.coords.error }}</span>
              </div>
            </div>
          </div>

          <h2 class="section-title" style="margin-top: 26px">⚙️ 模型与置换方案</h2>
          <div class="input-hint-card">
            <el-icon><InfoFilled /></el-icon>
            <span>公式只支持因子（分类）变量：距离基 F 的定义是「按水平把样本分组后比较组间/组内离散度」。
              连续变量请分箱后作为因子或区组，协变量调整请用 R 的 vegan::adonis2。</span>
          </div>
          <div class="data-input-grid">
            <div class="data-input-card">
              <h3>🔤 固定效应公式</h3>
              <p class="input-hint">只写右侧项，首项是置换检验的对象；可写 "group + phase"</p>
              <el-input v-model="form.formula" placeholder="group" />
              <div class="validation-status">
                <el-tag :type="checks.formula.ok ? 'success' : 'danger'" size="small">{{ checks.formula.msg }}</el-tag>
              </div>
            </div>

            <div class="data-input-card">
              <h3>🎯 置换方案</h3>
              <p class="input-hint">free=任意乱序（标准 PERMANOVA）；stratified=区组内交换；spatial=邻域内交换</p>
              <el-select v-model="form.scheme" style="width: 100%">
                <el-option v-for="sc in SCHEMES" :key="sc.value" :label="sc.label" :value="sc.value" />
              </el-select>
              <div class="validation-status" v-if="checks.scheme.msg">
                <el-tag :type="checks.scheme.ok ? 'success' : 'danger'" size="small">{{ checks.scheme.msg }}</el-tag>
              </div>
            </div>

            <div class="data-input-card">
              <h3>🧱 分层变量 (strata)</h3>
              <p class="input-hint">sampleData 里的一列；每个区组至少 2 个样本，过小的区组会被丢弃并在结果里报告</p>
              <el-select v-model="form.strata" style="width: 100%" clearable placeholder="（不用分层）">
                <el-option v-for="c in sampleColumns" :key="c" :label="c" :value="c" />
              </el-select>
            </div>

            <div class="data-input-card">
              <h3>📏 距离与数据类型</h3>
              <p class="input-hint">ws（加权 Simpson）由本脚本实现；其余为 vegan::vegdist 支持的方法</p>
              <el-select v-model="form.distance" style="width: 100%">
                <el-option v-for="d in DISTANCES" :key="d.value" :label="d.label" :value="d.value" />
              </el-select>
              <div style="margin-top: 12px">
                <el-switch v-model="form.presenceAbsence" active-text="存在 / 缺失（二值化后再算距离）" />
              </div>
              <div style="margin-top: 8px">
                <el-switch v-model="form.controlCoverage" active-text="校正测序深度（按行归一化为相对丰度）" />
              </div>
            </div>

            <div class="data-input-card">
              <h3>🔁 置换次数与随机种子</h3>
              <p class="input-hint">至少 99 次；种子相同则结果完全可复现（脚本自己算零分布，不像 LDM 要求 100 的倍数）</p>
              <el-input-number v-model="form.permutations" :min="99" :max="99999" :step="100" style="width: 100%" />
              <div style="margin-top: 10px">
                <el-input-number v-model="form.seed" :min="1" :max="999999" style="width: 100%" />
              </div>
            </div>

            <div class="data-input-card" v-if="form.scheme === 'spatial'">
              <h3>📐 邻域半径 (spatialBand)</h3>
              <p class="input-hint">只有距离小于该半径的样本之间才允许交换标签；留空则按坐标自动取半径</p>
              <el-input-number v-model="form.spatialBand" :min="0" :max="100000" :step="1" :precision="2"
                style="width: 100%" placeholder="自动" />
            </div>
          </div>
        </div>

        <div class="run-button-container">
          <button class="btn-run" :disabled="!canRun" @click="runAnalysis">
            <el-icon><VideoPlay /></el-icon>
            运行分析
          </button>
          <span v-if="!canRun" class="run-hint">
            <el-icon><InfoFilled /></el-icon>
            <span>{{ runHint }}</span>
          </span>
        </div>

        <!-- 结果（与其它分析界面一致：放在 config-section 内部，共用同一张白卡片） -->
        <div v-if="analysisResult" class="result-section">
          <h2 class="section-title">📊 分析结果</h2>

          <div :class="['headline-card', constrainedSig ? 'sig' : 'nsig']">
            <div class="headline-left">
              <div class="headline-p">{{ fmtP(primaryP) }}</div>
              <div class="headline-caption">{{ isFreeOnly ? 'p 值（自由置换）' : 'p 值（受限置换）' }}</div>
            </div>
            <div class="headline-right">
              <el-tag :type="constrainedSig ? 'success' : 'info'" size="large" effect="dark">
                {{ constrainedSig ? '✓ 组间差异显著' : '× 组间差异不显著' }}
              </el-tag>
              <p class="headline-interp">{{ analysisResult.interpretation }}</p>
              <p class="headline-sub">
                术语 {{ result.tested_term }}｜F = {{ fmt(result.F, 4) }}｜R² = {{ fmt(result.R2, 4) }}｜
                置换 {{ result.performed }}/{{ result.requested }} 次｜可用区组 {{ result.feasible_blocks ?? '-' }}
                <template v-if="result.dropped_blocks">（丢弃 {{ result.dropped_blocks }} 个过小区组）</template>
                ｜种子 {{ result.seed }}｜{{ result.elapsed }}s
              </p>
            </div>
          </div>

          <!-- 两种方案结论不一致时，这是本次分析最重要的信息，单独提示 -->
          <el-alert v-if="falsePositiveSignal" type="warning" show-icon :closable="false"
            title="自由置换显著、受限置换不显著 —— 先前看到的显著性很可能来自分层/空间结构"
            :description="`同一个 F（${fmt(result.F, 3)}）：p(自由)=${fmtP(result.p_free)}，p(受限)=${fmtP(result.p_constrained)}。标准 PERMANOVA 把现实中不可能出现的排列也算进了零分布，因此高估了证据强度。`" />
          <el-alert v-else-if="robustSignal" type="success" show-icon :closable="false"
            title="受限置换后仍然显著 —— 组间差异不是采样结构造成的假象"
            :description="`p(自由)=${fmtP(result.p_free)}，p(受限)=${fmtP(result.p_constrained)}，两种零分布下结论一致。`" />

          <ResultCard title="⚖️ 置换方案对比">
            <StatGrid :items="headlineStats" />
            <p class="table-note">
              两个 p 用的是**同一个观测 F**，差别只来自「允许哪些排列」。分层置换把区组内本就能造出的组间差异计入零假设，
              因此设计混淆时零分布右尾更厚、p 更大。
            </p>
          </ResultCard>

          <ResultCard title="📋 逐术语检验表（边际检验）">
            <el-table :data="result.table" border style="width: 100%"
              :header-cell-style="{ background: '#f0f9ff', color: '#0369a1', fontWeight: 600 }">
              <el-table-column prop="term" label="术语" min-width="120" />
              <el-table-column prop="df" label="df" width="70" />
              <el-table-column prop="n_levels" label="水平数" width="90" />
              <el-table-column label="F" min-width="110">
                <template #default="scope">{{ fmt(scope.row.F_model, 4) }}</template>
              </el-table-column>
              <el-table-column label="R²" min-width="110">
                <template #default="scope">{{ fmt(scope.row.R2, 4) }}</template>
              </el-table-column>
            </el-table>
            <p v-if="result.balance_note" class="table-note">{{ result.balance_note }}</p>
            <p v-else class="table-note">
              交叉单元格联合检验：F = {{ fmt(result.F_cells, 4) }}（{{ result.cell_levels }} 个单元格，含交互作用；
              与非平衡设计的可加模型 adonis2(d ~ a + b) 不是同一个量）。
            </p>
          </ResultCard>

          <ResultCard title="🧱 置换执行情况">
            <InfoGrid :items="permutationInfo" />
          </ResultCard>

          <ResultCard title="🧩 模型信息">
            <InfoGrid :items="modelInfo" />
          </ResultCard>

          <ChartPanel
            ref="chartPanel"
            v-model:active="activeChart"
            :tabs="chartTabs"
            :ready="!!chartData"
            :height="520"
            empty-text="本次结果未包含图表数据（请更新 r-scripts/nonrandom_permanova.R 后重试）。"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- 导入：先预览再填入，不按行号猜对应关系 -->
  <el-dialog v-model="showImportDialog" title="📁 导入数据" width="760px" :close-on-click-modal="false">
    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 14px;">
      <template #title>需要的表格（工作表名中英文都行，不会认可以明确告诉你缺哪张）</template>
      <div style="line-height: 1.8; font-size: 12px;">
        物种矩阵（必需）：第一列样本 ID，其余每列一个物种的丰度<br />
        样本信息（必需）：第一列样本 ID，其余为分组/区组变量，<b>必须都是因子</b>（连续变量请先分箱）<br />
        坐标（可选）：选「空间受限置换」时才需要，两列 x/y<br />
        支持 .xlsx / .xls / .csv；两张表的样本顺序可以不同，导入时按样本 ID 对齐
      </div>
    </el-alert>

    <el-upload ref="uploadRef" drag :auto-upload="false" :limit="1" :on-change="handleFileChange"
      :file-list="uploadFileList" accept=".xlsx,.xls,.csv">
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">将文件拖到此处，或<em>点击选择</em></div>
    </el-upload>

    <el-alert v-if="importError" type="error" :closable="false" show-icon :title="importError"
      style="margin-top: 12px;" />
    <el-alert v-for="(w, i) in importWarnings" :key="'w' + i" type="warning" :closable="false" show-icon
      :title="w" style="margin-top: 8px;" />

    <div v-if="importPreview" class="import-preview">
      <el-divider>数据预览</el-divider>
      <el-tabs v-model="importTab">
        <el-tab-pane :label="`物种矩阵（${importPreview.n} 样本 × ${importPreview.p} 物种）`" name="community">
          <el-table :data="importPreview.communityRows" border size="small" max-height="260">
            <el-table-column prop="样本" label="样本" width="110" fixed />
            <el-table-column v-for="c in importPreview.speciesCols" :key="c" :prop="c" :label="c" min-width="110" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane :label="`样本信息（${importPreview.sampleRows.length} 行）`" name="sample">
          <el-table :data="importPreview.sampleRows" border size="small" max-height="260">
            <el-table-column v-for="c in importPreview.sampleCols" :key="c" :prop="c" :label="c" min-width="120" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane v-if="importPreview.coordRows.length" label="坐标" name="coord">
          <el-table :data="importPreview.coordRows" border size="small" max-height="260">
            <el-table-column v-for="c in importPreview.coordCols" :key="c" :prop="c" :label="c" min-width="120" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <el-button @click="showImportDialog = false">取消</el-button>
      <el-button type="primary" :disabled="!importPreview || !!importError" @click="applyImport">填入表单</el-button>
    </template>
  </el-dialog>

  <!-- 导出：选项由用户勾选，不再一键倒完 -->
  <el-dialog v-model="showExportDialog" title="💾 导出结果" width="520px">
    <div class="export-dialog-content">
      <p class="export-hint">选择要导出的内容：</p>
      <div class="export-options">
        <el-checkbox-group v-model="exportOptions">
          <div class="checkbox-wrapper"><el-checkbox label="excel">分析结果（Excel：结论对比 / 逐术语 / 置换执行 / 模型信息）</el-checkbox></div>
          <div class="checkbox-wrapper"><el-checkbox label="pcoa">PCoA 坐标（Excel）</el-checkbox></div>
          <div class="checkbox-wrapper"><el-checkbox label="null">置换零分布样本（Excel）</el-checkbox></div>
          <div class="checkbox-wrapper"><el-checkbox label="json">完整结果（JSON）</el-checkbox></div>
          <div class="checkbox-wrapper"><el-checkbox label="input">当前输入数据（JSON）</el-checkbox></div>
          <div class="checkbox-wrapper"><el-checkbox label="png">当前图表（PNG）</el-checkbox></div>
        </el-checkbox-group>
      </div>
      <el-alert v-if="exportError" type="error" :closable="false" show-icon :title="exportError" style="margin-top: 12px;" />
    </div>
    <template #footer>
      <el-button @click="showExportDialog = false">取消</el-button>
      <el-button type="warning" :disabled="exportOptions.length === 0" @click="confirmExport">导出</el-button>
    </template>
  </el-dialog>
</template>

<script>
import { ElMessage, ElLoading } from 'element-plus';
import { Download, Document, FolderOpened, InfoFilled, UploadFilled, VideoPlay } from '@element-plus/icons-vue';
import AnalysisHeader from '@/components/r-analysis/AnalysisHeader.vue';
import AnalysisToolbar from '@/components/r-analysis/AnalysisToolbar.vue';
import DataTemplateSelector from '@/components/r-analysis/DataTemplateSelector.vue';
import ChartPanel from '@/components/r-analysis/ChartPanel.vue';
import ResultCard from '@/components/r-analysis/ResultCard.vue';
import StatGrid from '@/components/r-analysis/StatGrid.vue';
import InfoGrid from '@/components/r-analysis/InfoGrid.vue';
import '@/components/r-analysis/r-analysis.css';
import { inspectMatrix, inspectSampleTable } from '@/utils/matrixInput';
import { makeFormatters } from '@/utils/format';
import { NR_CHART_BUILDERS, NR_CHART_TABS } from '@/utils/nrCharts';
import { NR_TEMPLATE_GROUPS, NR_TEMPLATE_MAP, NR_TEMPLATE_COUNT, buildNonrandomTemplateData } from '@/utils/nonrandomTemplates';
import { runNonRandomPERMANOVA } from '@/api/r';
import { NR_DISTANCES, NR_SCHEMES } from '@/utils/nrOptions';
import {
  readWorkbook, findSheet, parseCommunitySheet, parseSampleSheet, parseCoordinateSheet,
  alignBySampleId, buildTemplateSheets, writeWorkbook
} from '@/utils/sheetIo';

const FORMATTERS = makeFormatters();

export default {
  name: 'NonrandomPERMANOVA',
  components: { AnalysisHeader, AnalysisToolbar, DataTemplateSelector, ChartPanel, ResultCard, StatGrid, InfoGrid, Download, Document, FolderOpened, InfoFilled, UploadFilled, VideoPlay },
  data() {
    return {
      isToolbarExpanded: false,
      nrGroups: NR_TEMPLATE_GROUPS,
      nrCount: NR_TEMPLATE_COUNT,
      selectedNrId: '',
      nrSummary: '',
      // 导入 / 导出对话框
      showImportDialog: false,
      uploadFileList: [],
      importPreview: null,
      importError: '',
      importWarnings: [],
      imported: null,
      importTab: 'community',
      showExportDialog: false,
      exportOptions: ['excel', 'json'],
      exportError: '',
      form: {
        communityStr: '',
        sampleStr: '',
        coordinatesStr: '',
        formula: 'group',
        scheme: 'stratified',
        strata: 'strata',
        distance: 'bray',
        presenceAbsence: false,
        controlCoverage: false,
        permutations: 999,
        seed: 12345,
        spatialBand: null
      },
      chartTabs: NR_CHART_TABS,
      activeChart: 'null',
      analysisResult: null,
      DISTANCES: NR_DISTANCES,
      SCHEMES: NR_SCHEMES
    };
  },
  computed: {
    selectedTemplate() {
      return this.selectedNrId ? NR_TEMPLATE_MAP[this.selectedNrId] : null;
    },
    builtDesign() {
      if (!this.selectedNrId) return '';
      const item = NR_TEMPLATE_MAP[this.selectedNrId];
      if (!item) return '';
      try {
        return buildNonrandomTemplateData(item.spec).design;
      } catch (e) {
        return '（设计描述生成失败：' + e.message + '）';
      }
    },
    expectText() {
      const e = this.selectedTemplate?.spec?.expect;
      if (!e) return '未标注';
      const map = { sig: '显著', ns: '不显著' };
      return `自由置换 ${map[e.free] || e.free}，受限置换 ${map[e.constrained] || e.constrained}`;
    },
    /** 五项输入状态：唯一来源，模板与 canRun 都读它（原来另有 this.v，程序填表时显示会滞后） */
    checks() {
      return this.checkAll();
    },
    sampleColumns() {
      return this.checks.sample.columns || [];
    },
    canRun() {
      // 注意：计算属性里只调纯函数 checkAll()，不要写 this.v
      // （之前在这里直接调 validate()，副作用会反过来触发本属性重算）
      return Object.values(this.checkAll()).every((x) => x.ok);
    },
    runHint() {
      const c = this.checkAll();
      if (!c.community.ok) return '物种矩阵需要是 n×p 的数值矩阵';
      if (!c.sample.ok) return c.sample.error || '样本信息表需要与物种矩阵行数一致';
      if (!c.coords.ok) return c.coords.error || '空间坐标需要与样本数一致';
      if (!c.formula.ok) return c.formula.msg;
      if (!c.scheme.ok) return c.scheme.msg;
      return '请检查输入';
    },
    result() {
      const j = this.analysisResult || {};
      const o = j.observed || {};
      const p = j.permutation || {};
      const table = Array.isArray(j.anova_table) ? j.anova_table : [];
      const isFree = p.scheme === 'free';
      return {
        F: o.F_model,
        R2: o.R2,
        F_cells: o.F_cells,
        p_free: o.p_free,
        p_constrained: o.p_constrained,
        tested_term: o.tested_term || (table[0] && table[0].term) || '',
        performed: p.performed,
        requested: p.requested,
        feasible_blocks: p.feasible_blocks,
        dropped_blocks: p.dropped_blocks,
        seed: p.seed,
        elapsed: p.elapsed_seconds,
        scheme: p.scheme,
        note: p.note,
        balance_note: j.model?.balance_note,
        cell_levels: j.model?.cell_levels,
        table
      };
    },
    isFreeOnly() {
      return this.result.scheme === 'free';
    },
    primaryP() {
      return this.isFreeOnly ? this.result.p_free : this.result.p_constrained;
    },
    constrainedSig() {
      return Number.isFinite(Number(this.primaryP)) && Number(this.primaryP) < 0.05;
    },
    // 结论翻转 = 本功能存在的意义，单独判定而不是靠文案猜
    falsePositiveSignal() {
      const r = this.result;
      return Number.isFinite(r.p_free) && Number.isFinite(r.p_constrained) &&
        r.p_free < 0.05 && r.p_constrained >= 0.05 && !this.isFreeOnly;
    },
    robustSignal() {
      const r = this.result;
      return Number.isFinite(r.p_free) && Number.isFinite(r.p_constrained) &&
        r.p_free < 0.05 && r.p_constrained < 0.05 && !this.isFreeOnly;
    },
    headlineStats() {
      const r = this.result;
      const f = FORMATTERS;
      return [
        { label: '观测 F（两种方案共用）', value: f.fmt(r.F, 4), sub: `R² = ${f.fmt(r.R2, 4)}` },
        {
          label: 'p（自由置换）',
          value: f.fmtP(r.p_free),
          sub: r.p_free < 0.05 ? '显著' : '不显著',
          subClass: r.p_free < 0.05 ? 'significance-low' : '',
          valueColor: r.p_free < 0.05 ? '#67c23a' : '#909399'
        },
        {
          label: `p（${r.scheme || '受限'} 置换）`,
          value: f.fmtP(r.p_constrained),
          sub: r.p_constrained < 0.05 ? '显著' : '不显著',
          subClass: r.p_constrained < 0.05 ? 'significance-low' : '',
          valueColor: r.p_constrained < 0.05 ? '#67c23a' : '#909399'
        },
        {
          label: '结论是否被置换方案改变',
          value: this.falsePositiveSignal ? '是（假阳性被纠正）' : this.robustSignal ? '否（结论稳健）' : '—',
          sub: this.falsePositiveSignal ? '应报告受限置换的 p' : ''
        }
      ];
    },
    permutationInfo() {
      const r = this.result;
      const j = this.analysisResult || {};
      return [
        { label: '置换方案', value: r.scheme || '-' },
        { label: '检验术语', value: r.tested_term || '-' },
        { label: '请求 / 完成置换次数', value: `${r.requested} / ${r.performed}` },
        { label: '可用区组 / 丢弃区组', value: `${r.feasible_blocks ?? '-'} / ${r.dropped_blocks ?? 0}` },
        { label: '随机种子', value: String(r.seed ?? '-') },
        { label: '耗时', value: `${r.elapsed ?? '-'} 秒` },
        { label: '方案说明', value: r.note || '-' },
        { label: 'vegan / R 版本', value: `${j.vegan_version || '-'} / R ${j.r_version || '-'}` }
      ];
    },
    modelInfo() {
      const j = this.analysisResult || {};
      const m = j.model || {};
      const cov = m.coverage_control === 'relative_abundance';
      return [
        { label: '公式', value: m.formula || this.form.formula, code: true },
        { label: '距离', value: m.distance || '-' },
        { label: '数据矩阵', value: `${m.n_samples ?? '-'} 样本 × ${this.checks.community.p || '-'} 物种` },
        { label: '存在/缺失', value: m.presence_absence ? '是（>0 记为 1）' : '否（定量丰度）' },
        { label: '测序深度校正', value: cov ? '是（按行归一化为相对丰度，不重采样）' : '否' },
        { label: '交叉单元格数', value: String(m.cell_levels ?? '-') },
        { label: '运行时间', value: j.timestamp || '-' }
      ];
    },
    chartData() {
      return this.analysisResult?.chart_data || null;
    }
  },
  watch: {
    activeChart() {
      this.$nextTick(() => this.renderChart());
    }
  },
  methods: {
    fmt(v, d = 4) { return FORMATTERS.fmt(v, d); },
    fmtP(v) { return FORMATTERS.fmtP(v); },

    /** 纯校验：返回五个输入项的状态（不改 data，供计算属性用） */
    checkAll() {
      const c = inspectMatrix(this.form.communityStr);
      const community = c.ok ? { ok: true, n: c.n, p: c.p } : { ok: false, error: c.error, n: 0, p: 0 };

      const s = this.form.sampleStr.trim()
        ? inspectSampleTable(this.form.sampleStr, c.ok ? c.n : null)
        : { ok: false, error: '等待输入' };
      const sample = s.ok ? { ok: true, n: s.n, columns: s.columns, rows: s.rows } : { ok: false, error: s.error, columns: [] };

      // 坐标：只有 spatial 才强制要求；其它方案留空即可
      let coords;
      if (this.form.scheme === 'spatial') {
        // 空坐标要给出可执行的提示，不能让用户看到「JSON 解析失败」（其实是忘了填）
        if (!this.form.coordinatesStr.trim()) {
          coords = { ok: false, n: 0, error: 'spatial 方案需要每个样本的 (x,y) 坐标' };
        } else {
          const x = inspectMatrix(this.form.coordinatesStr, c.ok ? c.n : null);
          coords = x.ok
            ? (x.p === 2 ? { ok: true, n: x.n, p: x.p } : { ok: false, n: x.n, error: `坐标需要 2 列（x,y），当前 ${x.p} 列` })
            : { ok: false, n: 0, error: x.error };
        }
      } else {
        const t = this.form.coordinatesStr.trim();
        const x = t ? inspectMatrix(t) : null;
        coords = !t ? { ok: true, n: 0 }
          : x.ok ? { ok: true, n: x.n || 0 }
            : { ok: false, n: 0, error: '坐标 JSON 解析失败（当前方案不需要坐标，可清空）' };
      }

      const terms = (this.form.formula || '').split('+').map((x) => x.trim()).filter(Boolean);
      const formula = !terms.length
        ? { ok: false, msg: '公式至少需要一个因子' }
        : sample.ok && !terms.every((t) => sample.columns.includes(t))
          ? { ok: false, msg: `公式里的变量不在样本表：${terms.filter((t) => !sample.columns.includes(t)).join(', ')}` }
          : { ok: true, msg: `✓ 术语：${terms.join(' + ')}（首项为检验对象）` };

      const scheme = this.form.scheme === 'stratified' && !this.form.strata
        ? { ok: false, msg: 'stratified 方案需要选择分层变量' }
        : this.form.scheme === 'spatial' && !(coords.ok && coords.n)
          ? { ok: false, msg: 'spatial 方案需要每个样本的 (x,y) 坐标' }
          : this.form.scheme === 'stratified' && sample.ok && !sample.columns.includes(this.form.strata)
            ? { ok: false, msg: `分层变量 ${this.form.strata} 不在样本表里` }
            : { ok: true, msg: '' };

      return { community, sample, coords, formula, scheme };
    },

    loadNrTemplate(id) {
      const item = NR_TEMPLATE_MAP[id];
      if (!item) return;
      const built = buildNonrandomTemplateData(item.spec);
      const p = built.payload;
      this.selectedNrId = id;
      this.nrSummary = built.design;
      this.form.communityStr = JSON.stringify(p.communityData);
      this.form.sampleStr = JSON.stringify(p.sampleData);
      this.form.coordinatesStr = p.coordinates ? JSON.stringify(p.coordinates) : '';
      this.form.formula = p.formula;
      this.form.scheme = p.scheme;
      this.form.strata = p.strata || '';
      this.form.distance = p.distance;
      this.form.presenceAbsence = !!p.presenceAbsence;
      this.form.controlCoverage = !!p.controlCoverage;
      this.form.permutations = p.permutations;
      this.form.seed = p.seed;
      this.form.spatialBand = p.spatialBand ?? null;
      // 载入后立刻显示预期，用户可以拿它跟实跑结果对
      this.notify('success', `已载入设计「${item.label}」：${built.design}；预期 ${this.expectText}`);
    },

    clearNrTemplate() {
      this.selectedNrId = '';
      this.nrSummary = '';
    },

    buildPayload() {
      const c = inspectMatrix(this.form.communityStr);
      const s = inspectSampleTable(this.form.sampleStr, c.n);
      const payload = {
        communityData: c.rows,
        sampleData: s.rows,
        formula: this.form.formula.trim(),
        strata: this.form.strata || undefined,
        scheme: this.form.scheme,
        distance: this.form.distance,
        presenceAbsence: this.form.presenceAbsence,
        controlCoverage: this.form.controlCoverage,
        permutations: this.form.permutations,
        seed: this.form.seed
      };
      if (this.form.scheme === 'spatial') {
        const x = inspectMatrix(this.form.coordinatesStr, c.n);
        payload.coordinates = x.rows;
        if (this.form.spatialBand) payload.spatialBand = this.form.spatialBand;
      }
      // 模板自带说明：跟着结果一起导出，便于回看时知道数据是怎么来的
      if (this.selectedTemplate) payload.note = `${this.selectedTemplate.label} —— ${this.selectedTemplate.spec.note || this.selectedTemplate.tip}`;
      return payload;
    },

    async runAnalysis() {
      if (!this.canRun) {
        this.notify('error', this.runHint);
        return;
      }
      const loading = ElLoading.service({ lock: true, text: '正在执行受限置换 PERMANOVA...', background: 'rgba(0,0,0,0.5)' });
      try {
        const result = await runNonRandomPERMANOVA(this.buildPayload());
        this.analysisResult = result;
        // 只有一种置换方案时，主图（两条零分布叠加）没有对比对象，切到结论对比图更合适
        this.activeChart = result?.permutation?.scheme === 'free' ? 'pcompare' : 'null';
        this.notify('success', '分析完成');
        this.$nextTick(() => {
          document.querySelector('.ra-shell .result-section')?.scrollIntoView({ behavior: 'smooth' });
          this.renderChart();
        });
      } catch (e) {
        const msg = e?.message || String(e);
        if (msg.includes('ipcRenderer') || !window.electron) {
          this.notify('error', { message: '请在 Electron 窗口中运行（不是浏览器）', duration: 5000 });
        } else {
          this.notify('error', { message: msg, duration: 8000, showClose: true });
        }
      } finally {
        loading.close();
      }
    },

    renderChart() {
      const el = this.$refs.chartPanel?.getHost?.();
      if (!el || !this.chartData) return;
      import('echarts').then((echarts) => {
        const chart = echarts.getInstanceByDom(el) || echarts.init(el);
        const build = NR_CHART_BUILDERS[this.activeChart] || NR_CHART_BUILDERS.null;
        chart.setOption(build(this.chartData, FORMATTERS), true);
        chart.resize();
      }).catch((e) => this.notify('error', '图表库加载失败：' + e.message));
    },

    async downloadInput() {
      const { saveAs } = await import('file-saver');
      const blob = new Blob([JSON.stringify(this.buildPayload(), null, 2)], { type: 'application/json' });
      saveAs(blob, `nonrandom-permanova 输入_${this.stamp()}.json`);
    },

    // ---------------------------------------------------------- 下载模板 / 导入
    async downloadTemplate() {
      const XLSX = await this.xlsx();
      await writeWorkbook(XLSX, buildTemplateSheets(), 'Non-random-PERMANOVA_数据模板.xlsx');
      this.notify('success', '模板已下载：物种矩阵 / 样本信息 / 坐标 / 填写说明');
    },

    openImport() {
      this.importPreview = null;
      this.importError = '';
      this.importWarnings = [];
      this.imported = null;
      this.uploadFileList = [];
      this.showImportDialog = true;
    },

    /** el-upload 的 on-change：解析工作簿 -> 出预览，不直接写进表单（先看再填） */
    async handleFileChange(uploadFile) {
      this.importError = '';
      this.importWarnings = [];
      this.importPreview = null;
      this.imported = null;
      const raw = uploadFile && (uploadFile.raw || uploadFile);
      if (!raw) return;
      this.uploadFileList = [uploadFile];
      try {
        const sheets = await readWorkbook(raw);
        const cs = findSheet(sheets, 'community');
        const ss = findSheet(sheets, 'sample');
        if (!cs) { this.importError = '没找到「物种矩阵」表（可叫 群落矩阵 / 丰度矩阵 / OTU表 / community / abundance）'; return; }
        if (!ss) { this.importError = '没找到「样本信息」表（可叫 样本数据 / 分组信息 / metadata / sample）'; return; }
        const comm = parseCommunitySheet(cs.aoa);
        if (!comm.ok) { this.importError = '物种矩阵：' + comm.error; return; }
        const sample = parseSampleSheet(ss.aoa);
        if (!sample.ok) { this.importError = '样本信息：' + sample.error; return; }
        const aligned = alignBySampleId(comm, sample);
        if (!aligned.ok) { this.importError = aligned.error; return; }
        if (aligned.extra && aligned.extra.length) {
          this.importWarnings.push(`样本信息里有 ${aligned.extra.length} 个物种矩阵中没有的样本（${aligned.extra.slice(0, 4).join(', ')}${aligned.extra.length > 4 ? ' …' : ''}），已忽略`);
        }

        let coord = null;
        const ks = findSheet(sheets, 'coordinate');
        if (ks) {
          const parsed = parseCoordinateSheet(ks.aoa);
          if (!parsed.ok) { this.importError = '坐标表：' + parsed.error; return; }
          const map = new Map(parsed.ids.map((id, n) => [id, parsed.coords[n]]));
          const missing = comm.ids.filter((id) => !map.has(id));
          if (missing.length) { this.importError = `坐标表缺少样本：${missing.slice(0, 4).join(', ')}`; return; }
          // 坐标一律按物种矩阵的样本顺序重排，保证逐行对应
          coord = comm.ids.map((id) => map.get(id));
        } else if (this.form.scheme === 'spatial') {
          this.importWarnings.push('当前置换方案是「空间受限」，但文件里没有坐标表，填入后需要自己补');
        }

        this.importWarnings.push(...this.inspectImportedShapes(comm, sample));

        this.imported = { community: comm.matrix, sample: aligned.rows, coordinates: coord };
        this.importPreview = {
          n: comm.ids.length,
          p: comm.species.length,
          communityRows: comm.ids.map((id, r) => {
            const o = { 样本: id };
            comm.species.forEach((sp, c) => { o[sp] = comm.matrix[r][c]; });
            return o;
          }),
          speciesCols: comm.species.slice(0, 12),
          sampleRows: aligned.rows.slice(0, 20).map((row, i) => ({ 样本: comm.ids[i], ...row })),
          sampleCols: ['样本', ...sample.columns],
          coordRows: coord ? comm.ids.map((id, r) => ({ 样本: id, x: coord[r][0], y: coord[r][1] })) : [],
          coordCols: coord ? ['样本', 'x', 'y'] : []
        };
        this.importTab = 'community';
      } catch (e) {
        this.importError = '读取失败：' + (e.message || e);
      }
    },

    /** 数据能解析出来，不代表形状对：把常见的误传与隐患在预览里说清楚 */
    inspectImportedShapes(comm, sample) {
      const w = [];
      if (comm.species.length <= 1) w.push('物种矩阵只有 1 列物种，是不是把样本信息表放上来了？');
      const zeros = comm.matrix.filter((row) => row.every((v) => v === 0)).length;
      if (zeros) w.push(`物种矩阵里有 ${zeros} 个样本全为 0（在相异度里会被当成空群落）`);
      const numericOnly = sample.columns.filter((c) => sample.rows.every((r) => r[c] !== '' && Number.isFinite(Number(r[c]))));
      if (numericOnly.length) {
        w.push(`样本信息里这些列全是数值：${numericOnly.join(', ')}。本模块只接受因子，运行前请先分箱`);
      }
      const blank = sample.columns.filter((c) => sample.rows.some((r) => r[c] === ''));
      if (blank.length) w.push(`样本信息这些列有空值：${blank.join(', ')}（空值会作为缺失水平处理）`);
      return w;
    },

    applyImport() {
      if (!this.imported) return;
      this.form.communityStr = JSON.stringify(this.imported.community);
      this.form.sampleStr = JSON.stringify(this.imported.sample);
      if (this.imported.coordinates) this.form.coordinatesStr = JSON.stringify(this.imported.coordinates);
      // 导入的是真实数据，设计模板说明不再适用，否则导出结果会把数据标成某个模板名
      this.clearNrTemplate();
      this.showImportDialog = false;
      const c = this.checks.community;
      this.notify('success', `已填入：${c.n} 样本 × ${c.p} 物种`);
    },

    // ---------------------------------------------------------- 导出
    openExport() {
      this.exportError = '';
      this.showExportDialog = true;
    },

    async confirmExport() {
      this.exportError = '';
      if (!this.analysisResult) { this.exportError = '还没有分析结果可导出'; return; }
      try {
        if (this.exportOptions.includes('excel')) await this.exportExcel();
        if (this.exportOptions.includes('pcoa')) await this.exportSheet('PCoA坐标', this.pcoaRows(), 'PCoA坐标');
        if (this.exportOptions.includes('null')) await this.exportSheet('零分布样本', this.nullRows(), '置换零分布');
        if (this.exportOptions.includes('json')) await this.exportJson();
        if (this.exportOptions.includes('input')) await this.downloadInput();
        if (this.exportOptions.includes('png')) await this.exportPng();
        this.showExportDialog = false;
        this.notify('success', `已导出 ${this.exportOptions.length} 项`);
      } catch (e) {
        this.exportError = '导出失败：' + (e.message || e);
      }
    },

    /**
     * 所有弹出提示走这一个口子。
     * 一是样式/时长统一，二是测试里没有 document，把 vm.notify 换成收集函数
     * 就能直接断言"用户看到了什么"，而不是让 ElMessage 在 Node 里炸掉。
     */
    notify(type, options) {
      ElMessage[type](options);
    },

        async xlsx() {
      const m = await import('xlsx');
      return m.utils ? m : m.default;   // xlsx 只有具名导出
    },

    async exportSheet(name, aoa, fileTag) {
      const XLSX = await this.xlsx();
      await writeWorkbook(XLSX, [[name, aoa]], `Non-random-PERMANOVA_${fileTag}_${this.stamp()}.xlsx`);
    },

    pcoaRows() {
      const cd = this.analysisResult?.chart_data || {};
      const out = [['样本', '分组', '区组', 'PC1', 'PC2']];
      (cd.pcoa?.x || []).forEach((x, i) => out.push([
        cd.pcoa.labels?.[i] || `S${i + 1}`, cd.pcoa.group?.[i] ?? '', cd.pcoa.strata?.[i] ?? '', x, cd.pcoa.y?.[i]
      ]));
      return out;
    },

    nullRows() {
      const cd = this.analysisResult?.chart_data || {};
      const a = cd.null?.values || [];
      const b = cd.null_free?.values || [];
      const out = [['受限置换F', '自由置换F']];
      for (let i = 0; i < Math.max(a.length, b.length); i++) out.push([a[i] ?? '', b[i] ?? '']);
      return out;
    },

    async exportJson() {
      const { saveAs } = await import('file-saver');
      saveAs(new Blob([JSON.stringify(this.analysisResult, null, 2)], { type: 'application/json' }),
        `Non-random-PERMANOVA_原始输出_${this.stamp()}.json`);
    },

    /** 只导得出正在看的那张图：其它 tab 的图还没实例化 */
    async exportPng() {
      const el = this.$refs.chartPanel?.getHost?.();
      if (!el) throw new Error('图表还没渲染');
      const echarts = await import('echarts');
      const chart = echarts.getInstanceByDom(el);
      if (!chart) throw new Error('当前没有可导出的图表实例');
      const { saveAs } = await import('file-saver');
      const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
      const bytes = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
      const tab = NR_CHART_TABS.find((x) => x.id === this.activeChart);
      saveAs(new Blob([bytes], { type: 'image/png' }),
        `Non-random-PERMANOVA_${(tab && tab.name) || this.activeChart}_${this.stamp()}.png`);
    },

    async exportExcel() {
      const XLSX = await this.xlsx();
      const r = this.result;
      const summary = [
        ['项目', '值'],
        ['检验术语', r.tested_term],
        ['观测 F', r.F],
        ['R²', r.R2],
        ['p（自由置换）', r.p_free],
        [`p（${r.scheme} 置换）`, r.p_constrained],
        ['结论是否被置换方案改变', this.falsePositiveSignal ? '是（自由置换假阳性）' : this.robustSignal ? '否（结论稳健）' : ''],
        ['解释', this.analysisResult.interpretation],
        ['置换次数（请求/完成）', `${r.requested}/${r.performed}`],
        ['可用区组 / 丢弃', `${r.feasible_blocks ?? '-'}/${r.dropped_blocks ?? 0}`],
        ['随机种子', r.seed],
        ['公式', this.analysisResult.model?.formula],
        ['距离', this.analysisResult.model?.distance],
        ['测序深度校正', this.analysisResult.model?.coverage_control || '否'],
        ['vegan / R', `${this.analysisResult.vegan_version} / R ${this.analysisResult.r_version}`],
        ['数据说明', this.selectedTemplate ? `${this.selectedTemplate.label}（合成演示数据）` : '用户输入数据']
      ];
      const table = [['术语', 'df', '水平数', 'F', 'R²']];
      (r.table || []).forEach((x) => table.push([x.term, x.df, x.n_levels, x.F_model, x.R2]));
      const perm = [['项目', '值'], ...this.permutationInfo.map((x) => [x.label, x.value])];
      const model = [['项目', '值'], ...this.modelInfo.map((x) => [x.label, x.value])];
      await writeWorkbook(XLSX, [
        ['结论对比', summary],
        ['逐术语检验', table],
        ['置换执行', perm],
        ['模型信息', model]
      ], `Non-random-PERMANOVA_结果_${this.stamp()}.xlsx`);
    },
    stamp() {
      return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    }
  }
};
</script>
