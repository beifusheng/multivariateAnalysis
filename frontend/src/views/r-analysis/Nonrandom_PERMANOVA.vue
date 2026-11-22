<template>
  <div class="ra-shell">
    <AnalysisHeader
      icon="🎲"
      title="Non-random PERMANOVA（受限置换）"
      subtitle="分层 / 空间受限置换：当采样设计本身有结构时，任意乱序会造出现实中不存在的零分布，p 值偏乐观"
    />

    <AnalysisToolbar v-model:expanded="isToolbarExpanded">
      <ToolbarActions :can-run="canRun" :has-result="!!analysisResult"
        export-tip="导出分析结果（Excel / JSON / 图表 PNG）"
        @template="downloadTemplate" @import="openImport" @export="openExport" @input="downloadInput" />
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
              <!-- 引擎说“这次检验本质上不可能显著”时必须摆到明面上：
                   p=1 与“没效应”长得一模一样，但两者对用户的动作完全不同 -->
              <div v-for="(d, di) in diagnostics" :key="'dg' + di" class="headline-diagnostic">
                ⚠️ {{ d }}
              </div>
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

  <!-- 导入 / 导出：外壳共用，具体要哪几张表、能勾哪些项来自 nonrandomSheetSpec -->
  <ImportDialog v-model="showImportDialog" :sheets="importSheets" :tabs="importTabs"
    :error="importError" :warnings="importWarnings" @file-change="handleFileChange" @apply="applyImport" />

  <ExportDialog v-model="showExportDialog" :options="exportOptions2" :selected="exportOptions"
    :error="exportError" @update:selected="(v) => (exportOptions = v)" @confirm="confirmExport" />
</template>

<script>
import { ElMessage, ElLoading } from 'element-plus';
import { Download, Document, FolderOpened, InfoFilled, UploadFilled, VideoPlay } from '@element-plus/icons-vue';
import AnalysisHeader from '@/components/r-analysis/AnalysisHeader.vue';
import AnalysisToolbar from '@/components/r-analysis/AnalysisToolbar.vue';
import ToolbarActions from '@/components/r-analysis/ToolbarActions.vue';
import ImportDialog from '@/components/r-analysis/ImportDialog.vue';
import ExportDialog from '@/components/r-analysis/ExportDialog.vue';
import DataTemplateSelector from '@/components/r-analysis/DataTemplateSelector.vue';
import ChartPanel from '@/components/r-analysis/ChartPanel.vue';
import ResultCard from '@/components/r-analysis/ResultCard.vue';
import StatGrid from '@/components/r-analysis/StatGrid.vue';
import InfoGrid from '@/components/r-analysis/InfoGrid.vue';
import '@/components/r-analysis/r-analysis.css';
import { inspectMatrix, inspectSampleTable } from '@/utils/matrixInput';
import { drawWhenReady } from '@/utils/chartHost';
import { makeFormatters } from '@/utils/format';
import { NR_CHART_BUILDERS, NR_CHART_TABS } from '@/utils/nrCharts';
import { NR_TEMPLATE_GROUPS, NR_TEMPLATE_MAP, NR_TEMPLATE_COUNT, buildNonrandomTemplateData } from '@/utils/nonrandomTemplates';
import { runNonRandomPERMANOVA } from '@/api/r';
import { NR_DISTANCES, NR_SCHEMES } from '@/utils/nrOptions';
import {
  readWorkbook, mapWorkbook, previewFromFields, writeWorkbook, templateFilename, fileStamp
} from '@/utils/sheetIo';
import {
  NR_IMPORT_SHEETS, NR_EXPORT_OPTIONS, NR_EXPORT_DEFAULTS,
  planExport, nrToFormPatch, nrTemplateSheets
} from '@/utils/nonrandomSheetSpec';

const FORMATTERS = makeFormatters();

export default {
  name: 'NonrandomPERMANOVA',
  components: { AnalysisHeader, AnalysisToolbar, ToolbarActions, ImportDialog, ExportDialog, DataTemplateSelector, ChartPanel, ResultCard, StatGrid, InfoGrid, Download, Document, FolderOpened, InfoFilled, UploadFilled, VideoPlay },
  data() {
    return {
      isToolbarExpanded: false,
      nrGroups: NR_TEMPLATE_GROUPS,
      nrCount: NR_TEMPLATE_COUNT,
      selectedNrId: '',
      nrSummary: '',
      // 导入 / 导出对话框（外壳共用，内容来自 spec）
      showImportDialog: false,
      importTabs: null,
      importError: '',
      importWarnings: [],
      imported: null,
      showExportDialog: false,
      exportOptions: NR_EXPORT_DEFAULTS.slice(),
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
    importSheets() {
      return NR_IMPORT_SHEETS;
    },
    exportOptions2() {
      return NR_EXPORT_OPTIONS.map(({ key, label }) => ({ key, label }));
    },
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
    },
    /**
     * 引擎的硬提醒（零分布退化之类）。空数组就是真的没问题。
     * 以前退化设计只会安静地给 p=1 —— 与“没效应”在屏幕上长得一模一样。
     */
    diagnostics() {
      const d = this.analysisResult?.diagnostics;
      return Array.isArray(d) ? d.filter((x) => x && String(x).trim()) : [];
    }
  },
  watch: {
    activeChart() {
      this.$nextTick(() => this.renderChart());
    },
    // 关键：让“有没有数据”自己驱动重画，而不是靠 runAnalysis 里那一次性 nextTick。
    // 首次分析时 activeChart 常常没变（默认就是 'null'），watcher 不触发，
    // 只依赖那一帧的 DOM——那一帧拿不到尺寸就永远空白，直到用户切 tab。
    chartData() {
      this.$nextTick(() => this.renderChart());
    }
  },
  methods: {
    fmt(v, d = 4) { return FORMATTERS.fmt(v, d); },
    fmtP(v) { return FORMATTERS.fmtP(v); },

    /** 纯校验：返回五个输入项的状态（不改 data，供计算属性用） */
    checkAll() {
      const c = inspectMatrix(this.form.communityStr);
      // empty（还没填）与“格式错”要分开：卡片已经写了「等待输入」，
      // 再把解析器的提示挂上去就是刚进页面一片红字（实机反馈就是这个）
      const community = c.ok
        ? { ok: true, n: c.n, p: c.p }
        : { ok: false, empty: !!c.empty, error: c.empty ? '' : c.error, n: 0, p: 0 };

      const s = this.form.sampleStr.trim()
        ? inspectSampleTable(this.form.sampleStr, c.ok ? c.n : null)
        : { ok: false, empty: true, error: '' };   // 卡片自己会写「等待输入」，这里不再挂一份
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
      if (!this.chartData) return;                       // 真没数据：空态文案会说明
      return drawWhenReady({
        getHost: () => this.$refs.chartPanel?.getHost?.() || null,
        nextTick: this.$nextTick,
        option: (NR_CHART_BUILDERS[this.activeChart] || NR_CHART_BUILDERS.null)(this.chartData, FORMATTERS)
      }).then((r) => {
        // 以前这里是 `if (!el) return;`：静默放弃，于是“初次分析不画、切 tab 才画”
        if (!r.ok && (r.reason === 'no-host' || r.reason === 'zero-size')) {
          this.notify('warning', (r.reason === 'zero-size'
            ? '图表容器量不出尺寸（0 宽/0 高），等过 ' + r.waited + ' 帧仍未就绪'
            : '图表容器还没就绪（等了 ' + r.waited + ' 帧）') + '，切一下图表类型可重画');
        } else if (r.ok && r.empty) {
          // setOption 确实跑了，但图画在 0 宽容器上 => 屏幕上一片空白
          this.notify('warning', '图表已生成但宽度为 0（布局未完成），切一下图表类型或收缩侧边栏可重画');
        }
        return r;
      });
    },

    async downloadInput() {
      try {
        await this.saveJson(`Non-random-PERMANOVA_输入_${this.stamp()}.json`, this.buildPayload());
      } catch (e) {
        this.notify('error', ((e && e.message) || String(e)));
      }
    },

    // ---------------------------------------------------------- 模板 / 导入 / 导出
    // 外壳（工具栏、对话框）三个模块共用；这里只剩"本模块要哪几张表、能勾哪些项"，
    // 而那部分已经挪到 utils/nonrandomSheetSpec.js 里当纯数据 + 纯函数了。
    async downloadTemplate() {
      // 必须接住异常：上一版没有 try/catch，import('xlsx') 一失败就是未捕获 rejection，
      // 用户看到的只有"点了没反应"（PERMANOVA 那份一直有 try/catch，这里原来是漏的）。
      try {
        const XLSX = await this.xlsx();
        await writeWorkbook(XLSX, nrTemplateSheets(), this.templateFileName());
        this.notify('success', '模板已下载：物种矩阵 / 样本信息 / 坐标 / 填写说明');
      } catch (e) {
        this.notify('error', ((e && e.message) || String(e)));
      }
    },

    /** 文件名格式三个模块一致（见 sheetIo.templateFilename） */
    templateFileName() {
      return templateFilename('Non-random-PERMANOVA', this.stamp());
    },

    openImport() {
      this.importTabs = null;
      this.importError = '';
      this.importWarnings = [];
      this.imported = null;
      this.showImportDialog = true;
    },

    /** 解析交给 sheetIo.mapWorkbook 按 spec 跑：缺表指名、按主表 ID 对齐、形状隐患出警告 */
    async handleFileChange(raw) {
      this.importTabs = null;
      this.importError = '';
      this.importWarnings = [];
      this.imported = null;
      if (!raw) return;
      try {
        const sheets = await readWorkbook(raw);
        const res = mapWorkbook(sheets, NR_IMPORT_SHEETS, {
          primary: 'community',
          // 选了空间方案却没带坐标表，要当场说，不要等运行时报"缺 coordinates"
          needKeys: this.form.scheme === 'spatial' ? ['coordinate'] : [],
          needLabel: '空间受限置换'
        });
        if (!res.ok) {
          this.importError = res.error;
          this.importWarnings = res.warnings || [];
          return;
        }
        this.importWarnings = res.warnings;
        this.imported = res.fields;
        this.importTabs = previewFromFields(res.ids, res.fields.community, res.fields);
      } catch (e) {
        this.importError = '读取失败：' + (e.message || e);
      }
    },

    /** 先看后填：用户点「填入表单」才动表单，而且必须把对话框关掉 */
    applyImport() {
      if (!this.imported) {
        // 不报错就是“点了没反应”：上面已经报过的解析错优先
        if (!this.importError) this.importError = '先选一个能解析的文件';
        return;
      }
      Object.assign(this.form, nrToFormPatch(this.imported));
      this.showImportDialog = false;
      // 导入的是真实数据，设计模板说明不再适用，否则导出结果会把用户数据标成某个模板名
      this.clearNrTemplate();
      const c = this.checks.community;
      this.notify('success', `已填入：${c.n} 样本 × ${c.p} 物种`);
    },

    openExport() {
      this.exportError = '';
      this.showExportDialog = true;
    },

    /** spec 的 planExport 算出任务表，这里只负责执行（saveAs / getDataURL 是 DOM 活） */
    async confirmExport() {
      this.exportError = '';
      if (!this.analysisResult) {
        this.exportError = '还没有分析结果可导出';
        return;
      }
      const tab = NR_CHART_TABS.find((x) => x.id === this.activeChart);
      const jobs = planExport(this.exportOptions, this.exportCtx(tab ? tab.name : ''), this.stamp());
      try {
        for (const job of jobs) {
          if (job.type === 'xlsx') await writeWorkbook(await this.xlsx(), job.sheets, job.filename);
          else if (job.type === 'json') await this.saveJson(job.filename, job.data);
          else await this.exportPng(job.filename);
        }
        this.showExportDialog = false;
        this.notify('success', `已导出 ${jobs.length} 项`);
      } catch (e) {
        this.exportError = '导出失败：' + (e.message || e);
      }
    },

    /** 组装 spec 里 build()/data() 需要的上下文：全是纯数据，所以导出内容能在 Node 里断言 */
    exportCtx(chartTabName) {
      return {
        r: this.result,
        analysisResult: this.analysisResult,
        cd: (this.analysisResult && this.analysisResult.chart_data) || {},
        payload: this.buildPayload(),
        verdict: this.falsePositiveSignal ? '是（自由置换假阳性）' : this.robustSignal ? '否（结论稳健）' : '',
        interpretation: this.analysisResult && this.analysisResult.interpretation,
        diagnostics: this.diagnostics,
        permInfo: this.permutationInfo,
        modelInfo: this.modelInfo,
        templateLabel: this.selectedTemplate ? `${this.selectedTemplate.label}（合成演示数据）` : '用户输入数据',
        chartTabName
      };
    },

    async xlsx() {
      // 动态 import 失败要变成**可操作的一句人话**。实机现象就是
      // 「Failed to fetch dynamically imported module: .../.vite/deps/xlsx.js」：
      // dev 模式下那份依赖缓存被别的进程改写（我跑测试套件就会）时，浏览器手里
      // 那个旧引用取不到文件。以前这里不接异常，用户只看到"点了没反应"。
      try {
        const m = await import('xlsx');
        const lib = m.utils ? m : m.default;
        if (!lib || !lib.utils) throw new Error('xlsx 模块没有预期导出');
        return lib;
      } catch (e) {
        throw new Error('Excel 组件加载失败：' + ((e && e.message) || e) +
          '。按顺序试：① 刷新页面（Ctrl+F5）再点一次；② 仍然失败就重启 npm run dev —— ' +
          '若 dev 服务内存里的依赖元数据与磁盘不一致（例如 node_modules/.vite 被删过），' +
          '只有重启才会重建，光刷新没有用。');
      }
    },

    async saveJson(filename, data) {
      // file-saver 也是动态 import，失败原因与 xlsx 同一个（dev 依赖缓存被改写）。
      // 在这里统一变成人话，四个调用点（下载输入 / 导出 JSON）就不用各写一遍。
      let saveAs;
      try {
        ({ saveAs } = await import('file-saver'));
      } catch (e) {
        throw new Error('保存组件加载失败：' + ((e && e.message) || e) +
          '。先刷新页面（Ctrl+F5）；仍然失败就重启 npm run dev —— 依赖元数据与磁盘不一致时只有重启会重建。');
      }
      if (typeof saveAs !== 'function') throw new Error('file-saver 没有导出 saveAs');
      saveAs(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
    },

    /** 只导得出正在看的那张图：其它 tab 的图还没实例化 */
    async exportPng(filename) {
      const el = this.$refs.chartPanel?.getHost?.();
      if (!el) throw new Error('图表还没渲染');
      const echarts = await import('echarts');
      const chart = echarts.getInstanceByDom(el);
      if (!chart) throw new Error('当前没有可导出的图表实例');
      const { saveAs } = await import('file-saver');
      const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
      const bytes = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
      saveAs(new Blob([bytes], { type: 'image/png' }), filename);
    },
    /** 时间戳统一由 sheetIo.fileStamp 给（三个模块的文件名要能对上） */
    stamp() {
      return fileStamp();
    }
  }
};
</script>

<style scoped>
/* 本视图自己的元素，样式就写在这里。
   以前所有 ra 样式都堆在 PERMANOVA_Med.vue 的 scoped 块里、靠 extract_ra_styles.mjs 搬到
   r-analysis.css（那个文件头部还留着 "generated from PERMANOVA_Med.vue —— do not hand-edit"），
   结果是：往别的视图加一个类，得先去改第三个文件的 CSS。外壳与视图各自的样式自己带着，
   这里就是引擎提醒那条横幅。 */
.headline-diagnostic {
  margin: 8px 0 0 0;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.7;
  color: #84351a;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-left: 4px solid #e6a23c;
  border-radius: 6px;
  font-weight: 600;
}
</style>
