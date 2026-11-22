<template>
  <div class="ra-shell">
    <AnalysisHeader
      icon="🎯"
      title="Bayesian ERA（贝叶斯扩展冗余分析 · 含中介效应）"
      subtitle="把 X→M→Y 拆成直接 / 间接 / 总三条通路，每个效应给后验均值与等尾区间；再按 Borcard 三分法拆 X 独有、X∩M（经中介）、M 独有与残差。共轭 Gibbs 采样，附 split-R̂ 与 ESS 收敛诊断"
    />

    <AnalysisToolbar v-model:expanded="isToolbarExpanded">
      <ToolbarActions :can-run="canRun" :has-result="!!analysisResult"
        export-tip="导出分析结果（Excel / JSON / 图表 PNG）"
        @template="downloadTemplate" @import="openImport" @export="openExport" @input="downloadInput" />
    </AnalysisToolbar>

    <div class="main-content">
      <div class="config-section">
        <div v-if="selectedTemplate" class="selected-template-card">
          <div class="template-card-header">
            <div class="template-card-title">
              <span class="template-icon">📌</span><span>当前设计模板</span>
            </div>
            <el-button type="info" size="small" plain round @click="clearTemplate">清除选择</el-button>
          </div>
          <div class="template-card-content">
            <div class="template-info-row">
              <span class="info-label">数据结构：</span>
              <span class="info-value">{{ tplShapeLine }}</span>
            </div>
            <div class="template-info-row">
              <span class="info-label">预期结论：</span>
              <span class="info-value">{{ tplExpectLine }}</span>
            </div>
            <div class="template-tip">
              <span class="tip-icon">💡</span><span>{{ tpl.spec.note }}</span>
            </div>
          </div>
        </div>

        <DataTemplateSelector
          icon="🎯"
          :label="`设计模板（${eraCount} 个 · 含可运行数据）`"
          :groups="eraGroups"
          :selected-id="selectedTplId"
          :summary="tplSummary"
          note="点击后自动写入 X / M / Y 与参数表，可直接点「运行分析」。通路系数 γ / β / ω 写在明面上（不是随机撒一把再宣称有中介），数据由确定性随机源合成；已用便携版 R 实测：恒等式 tot = dir + ind 逐 draw 成立，区间覆盖标准化尺度真值，整体 R² 与 vegan::rda 的约束惯量比一致。"
          @select="loadTemplate"
          @clear="clearTemplate"
        />

        <div class="data-input-section">
          <h2 class="section-title">📊 数据输入</h2>
          <div class="input-hint-card">
            <el-icon><InfoFilled /></el-icon>
            <span>三张表都按「每行一个样本」写，行数必须一致且同序。中介分析的全部信息都在行与行的配对上 —— Y 与 M 错一行，等于拿别的样本的中介去解释结局。</span>
          </div>

          <div class="data-input-grid">
            <div class="data-input-card">
              <h3>🧪 预测变量 X (n × p)</h3>
              <p class="input-hint">[[x1, x2, ...], ...] 每行一个样本
[
  [0.31, -1.20],
  [-0.88, 0.12]
]</p>
              <el-input v-model="form.xStr" type="textarea" :rows="6" placeholder="也可以点「导入数据」用 Excel 的三张表填入" />
              <div class="validation-status">
                <el-tag :type="checks.x.ok ? 'success' : 'info'" size="small">
                  {{ checks.x.ok ? `✓ ${checks.x.n} 样本 × ${checks.x.p} 变量` : '等待输入' }}
                </el-tag>
                <span v-if="checks.x.error" class="error-text">{{ checks.x.error }}</span>
              </div>
            </div>

            <div class="data-input-card">
              <h3>🔗 中介变量 M (n × k)</h3>
              <p class="input-hint">[[m1, ...], ...] 行数与 X 一致
[
  [0.44, 1.05],
  [-0.60, 0.22]
]</p>
              <el-input v-model="form.mStr" type="textarea" :rows="6" placeholder="至少一个中介变量；没有 M 就不是中介分析" />
              <div class="validation-status">
                <el-tag :type="checks.m.ok ? 'success' : 'info'" size="small">
                  {{ checks.m.ok ? `✓ ${checks.m.n} 样本 × ${checks.m.k} 个中介` : '等待输入' }}
                </el-tag>
                <span v-if="checks.m.error" class="error-text">{{ checks.m.error }}</span>
              </div>
            </div>

            <div class="data-input-card">
              <h3>🎯 响应变量 Y (n × q)</h3>
              <p class="input-hint">[[y1, y2, ...], ...] 行数与 X 一致
[
  [2.7, -0.4],
  [1.9, 0.8]
]</p>
              <el-input v-model="form.yStr" type="textarea" :rows="6" placeholder="多个响应放多列，每格给出直接/间接/总三条通路" />
              <div class="validation-status">
                <el-tag :type="checks.y.ok ? 'success' : 'info'" size="small">
                  {{ checks.y.ok ? `✓ ${checks.y.n} 样本 × ${checks.y.q} 响应` : '等待输入' }}
                </el-tag>
                <span v-if="checks.y.error" class="error-text">{{ checks.y.error }}</span>
              </div>
            </div>
          </div>

          <h2 class="section-title" style="margin-top: 26px">⚙️ 采样设置</h2>
          <div class="input-hint-card">
            <el-icon><InfoFilled /></el-icon>
            <span>默认 4 条链 × 4000 迭代、每 5 步留 1 个。这几个数不是拍出来的：n=200 的实测里 2000 迭代就到 R̂≈1.0005，而多响应 24 格那张表在 4000 迭代下 R̂ 最坏 1.0023。想更稳就加大 iterations，别减 chains —— 少于 2 条链根本算不出 split-R̂，也就没有收敛证据。</span>
          </div>
          <div class="params-grid">
            <div class="param-item">
              <label>链数 chains</label>
              <el-input-number v-model="form.chains" :min="2" :max="12" :step="1" />
            </div>
            <div class="param-item">
              <label>迭代数 iterations（每条链）</label>
              <el-input-number v-model="form.iterations" :min="500" :max="40000" :step="500" />
            </div>
            <div class="param-item">
              <label>薄抽 thin</label>
              <el-input-number v-model="form.thin" :min="1" :max="50" :step="1" />
            </div>
            <div class="param-item">
              <label>随机种子 seed</label>
              <el-input-number v-model="form.seed" :min="1" :max="999999" />
            </div>
            <div class="param-item">
              <label>先验强度 λ（系数 ~ N(0, 1/λ)）</label>
              <el-input-number v-model="form.priorLambda" :min="0.001" :max="100" :step="0.1" :precision="3" />
            </div>
            <div class="param-item">
              <label>区间宽度 prob</label>
              <el-input-number v-model="form.prob" :min="0.5" :max="0.99" :step="0.01" :precision="2" />
            </div>
          </div>
          <div v-if="paramWarnings.length" class="param-warning">
            <el-icon><WarningFilled /></el-icon>
            <span>{{ paramWarnings.join('；') }}</span>
          </div>

          <!-- 运行按钮就在输入区下方（与另三个模块同一位置）。外壳 ToolbarActions 只有
               下载模板/导入/导出/下载输入四个动作，运行从来不在那里 —— 上一版以为它在，
               结果整个页面根本没法开始分析。 -->
          <div class="run-button-container">
            <button class="btn-run" :disabled="!canRun" @click="runAnalysis">
              <el-icon><VideoPlay /></el-icon>
              运行分析
            </button>
            <span v-if="!canRun" class="run-hint">
              <el-icon><InfoFilled /></el-icon>
              <span>{{ runHint }}</span>
            </span>
            <span v-else class="run-hint">{{ runReadyHint }}</span>
          </div>
        </div>

        <div v-if="analysisResult" class="result-section">
        <ResultCard :title="headlineTitle" :note="headlineNote">
          <StatGrid :items="headlineStats" />

          <el-alert v-if="convergenceBad" :title="`收敛未达标：${convergenceText} —— 下面的区间不可信，先加大迭代数重跑`"
            type="error" :closable="false" show-icon class="diag-alert" />
          <el-alert v-if="diagnostics.length" :title="`引擎提醒（${diagnostics.length} 条）—— 先看这里再看数值`"
            type="warning" :closable="false" show-icon class="diag-alert">
            <div v-for="(d, i) in diagnostics" :key="i" class="diag-line">· {{ d }}</div>
          </el-alert>

          <h3 class="block-title">🧭 效应表（标准化尺度，每格三条通路）</h3>
          <p class="table-note">区间不含 0 才算"这条通路有证据"。<b>OLS 列是同数据的闭式解</b>：后验均值与它差得远，说明要么没收敛、要么先验太强，不是"贝叶斯更准"。</p>
          <el-table :data="effectRows" size="small" border>
            <el-table-column prop="cell" label="格子" width="96" fixed />
            <el-table-column label="直接效应" min-width="220">
              <template #default="s">
                <span class="est">{{ s.row.d_est }}</span>
                <span class="ci">[{{ s.row.d_lo }}, {{ s.row.d_hi }}]</span>
                <el-tag :type="s.row.d_excl ? 'success' : 'info'" size="small">{{ s.row.d_excl ? '不含 0' : '含 0' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="间接效应（经 M）" min-width="240">
              <template #default="s">
                <span class="est">{{ s.row.i_est }}</span>
                <span class="ci">[{{ s.row.i_lo }}, {{ s.row.i_hi }}]</span>
                <el-tag :type="s.row.i_excl ? 'success' : 'info'" size="small">{{ s.row.i_excl ? '不含 0' : '含 0' }}</el-tag>
                <span class="ci">P&gt;0 {{ s.row.i_p0 }}</span>
              </template>
            </el-table-column>
            <el-table-column label="总效应" min-width="200">
              <template #default="s">
                <span class="est">{{ s.row.t_est }}</span>
                <span class="ci">[{{ s.row.t_lo }}, {{ s.row.t_hi }}]</span>
                <el-tag v-if="s.row.masked" type="warning" size="small">方向相反 · 遮掩</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="OLS 对照" width="220">
              <template #default="s">
                <span class="ci">直接 {{ s.row.d_ols }}</span>
                <span class="ci">间接 {{ s.row.i_ols }}</span>
              </template>
            </el-table-column>
          </el-table>

          <h3 class="block-title">🧮 方差分解（Borcard 三分法，逐响应）</h3>
          <div class="table-scroll">
            <table class="coef-table">
              <thead><tr><th>响应</th><th>X 独有</th><th>X∩M（经中介）</th><th>M 独有</th><th>残差</th><th>合计</th></tr></thead>
              <tbody>
                <tr v-for="(row, c) in partitionRows" :key="c">
                  <th>Y{{ c + 1 }}</th>
                  <td>{{ row[0] }}</td><td>{{ row[1] }}</td><td>{{ row[2] }}</td><td>{{ row[3] }}</td>
                  <td :class="{ picked: Math.abs(row[4] - 1) > 1e-6 }">{{ fmt(row[4], 6) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="table-note">每行四块之和必须等于 1（合计列不等于 1 会高亮，那是引擎内部校验失败）。
<b>负值不是错误而是事实</b>：共线很强时 B 的偏 R² 可以为负，此时"X 独有"这种说法本身就不成立 —— 去看 M 与 X 的相关结构，别把这个数当解释力。</p>

          <h3 class="block-title">📈 模型信息</h3>
          <InfoGrid :items="modelInfo" />

          <ChartPanel ref="chartPanel" :tabs="chartTabs" v-model:active="activeChart" :ready="!!analysisResult"
            :note="chartNote" :empty-text="`当前结果不足以画这张图（例如后验抽样没带回来）`" />
        </ResultCard>
        </div>
      </div>
    </div>
  </div>

  <ImportDialog v-model="showImportDialog" :sheets="importSheets" :tabs="importTabs"
    :error="importError" :warnings="importWarnings" @file-change="handleFileChange" @apply="applyImport" />
  <ExportDialog v-model="showExportDialog" :options="exportOptions2" :selected="exportOptions"
    :error="exportError" @update:selected="(v) => (exportOptions = v)" @confirm="confirmExport" />
</template>

<script>
import { ElMessage, ElLoading } from 'element-plus';
import { InfoFilled, WarningFilled, VideoPlay } from '@element-plus/icons-vue';
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
import { drawWhenReady } from '@/utils/chartHost';
import { makeFormatters } from '@/utils/format';
import { ERA_CHART_TABS, ERA_CHART_BUILDERS, ERA_CHART_BLANK_REASON } from '@/utils/eraCharts';
import { runBayesianERA_Mediation } from '@/api/r';
import { readWorkbook, mapWorkbook, writeWorkbook, templateFilename, fileStamp } from '@/utils/sheetIo';
import {
  ERA_IMPORT_SHEETS, eraImportTabs, ERA_EXPORT_OPTIONS, ERA_EXPORT_DEFAULTS, ERA_PREVIEW_TABS,
  ERA_FORM_FIELDS, ERA_TEMPLATE_GROUPS, ERA_TEMPLATE_MAP, ERA_TEMPLATE_COUNT,
  eraPlanExport, eraToFormPatch, eraTemplateSheets, eraTemplateFileTag
} from '@/utils/eraSheetSpec';

const FORMATTERS = makeFormatters();

/**
 * 表单文本 -> 数值行数组。行序就是样本配对，所以解析只做形状检查，绝不排序。
 * 与 GMR⁴ 同一实现口径（空单元格必须报错而不是变成 0：0 在生态/表达量里是合法值，
 * 没人会发现），只是这里三份数据表同权重，X/M/Y 都必填。
 */
function parseRows(text, label) {
  const s = String(text || '').trim();
  if (!s) return { ok: false, n: 0, p: 0, rows: [], error: '', empty: true, label };
  let v = null;
  try { v = JSON.parse(s); } catch (e) {
    const lines = s.split(/\r?\n/).filter((x) => x.trim());
    const rows = lines.map((ln) => ln.split(/[\t,;]+/).map((x) => Number(String(x).trim())));
    if (rows.length >= 2 && rows.every((r) => r.length >= 1) && rows.every((r) => r.every(Number.isFinite))) {
      return { ok: true, n: rows.length, p: rows[0].length, rows, error: '', label };
    }
    return { ok: false, n: 0, p: 0, rows: [], error: `${label} 不是合法 JSON 数组（也不能按制表符/逗号解析成数值表）`, label };
  }
  if (!Array.isArray(v) || !v.length) return { ok: false, n: 0, p: 0, rows: [], error: `${label} 是空的或不是数组`, label };
  if (!Array.isArray(v[0])) {
    if (v.every((x) => Number.isFinite(x))) {
      return { ok: false, n: v.length, p: 1, rows: [], error: `${label} 是一维数组 —— 需要「每行一个样本」的二维数组`, label };
    }
    return { ok: false, n: 0, p: 0, rows: [], error: `${label} 里不是数字`, label };
  }
  const widths = [...new Set(v.map((r) => r.length))];
  if (widths.length > 1) return { ok: false, n: v.length, p: 0, rows: [], error: `${label} 每行列数不一致（出现 ${widths.join('/')}）`, label };
  const blankAt = v.findIndex((r) => r.some((x) => x === '' || x === null || x === undefined ||
    (typeof x === 'string' && !x.trim())));
  if (blankAt >= 0) {
    return { ok: false, n: v.length, p: widths[0], rows: [],
      error: `${label} 第 ${blankAt + 1} 行有空单元格 —— 空值会被当成 0，那不是缺失而是个真实数值` };
  }
  const bad = v.findIndex((r) => !r.every((x) => Number.isFinite(Number(x))));
  if (bad >= 0) return { ok: false, n: v.length, p: widths[0], rows: [], error: `${label} 第 ${bad + 1} 行有非数字单元格`, label };
  if (v.length < 2) return { ok: false, n: v.length, p: widths[0], rows: [], error: `${label} 只有 1 行 —— 像是把「变量 × 样本」写反了`, label };
  return { ok: true, n: v.length, p: widths[0], rows: v.map((r) => r.map(Number)), error: '', label };
}

export default {
  name: 'BayesianERAAnalysis',
  components: {
    AnalysisHeader, AnalysisToolbar, ToolbarActions, ImportDialog, ExportDialog,
    DataTemplateSelector, ChartPanel, ResultCard, StatGrid, InfoGrid, InfoFilled, WarningFilled, VideoPlay
  },
  data() {
    // 字段清单只有一个源头：eraSheetSpec.ERA_FORM_FIELDS。
    // GMR⁴ 那次「导入后参数进不了表单」的其中一半就是补丁键名与表单字段名不符，
    // 而当时没有任何一处代码知道两边是否一致 —— 现在 test_era_view 直接断言两边相等。
    return {
      isToolbarExpanded: false,          // 与另三个模块一致：进页面时工具栏是收缩的
      form: { xStr: '', mStr: '', yStr: '', chains: 4, iterations: 4000, thin: 5,
        seed: 12345, priorLambda: 1, prob: 0.95 },
      analysisResult: null,
      lastPayload: null,
      selectedTplId: '',
      activeChart: ERA_CHART_TABS[0].id,   // 默认永远是声明里的第一张（效应森林图）
      showImportDialog: false,
      importTabs: null, importError: '', importWarnings: [], imported: null,
      showExportDialog: false, exportError: '',
      exportOptions: [...ERA_EXPORT_DEFAULTS],
      importSheets: ERA_IMPORT_SHEETS,
      exportOptions2: ERA_EXPORT_OPTIONS,
      chartTabs: ERA_CHART_TABS,
      previewTabs: ERA_PREVIEW_TABS
    };
  },
  computed: {
    eraGroups() { return ERA_TEMPLATE_GROUPS; },
    eraCount() { return ERA_TEMPLATE_COUNT; },
    tpl() { return ERA_TEMPLATE_MAP[this.selectedTplId] || null; },
    selectedTemplate() { return this.tpl; },
    tplSummary() { return this.tpl ? `已选：${this.tpl.label}` : '未选择模板（可直接粘贴数据或导入 Excel）'; },
    /**
     * 卡片上的字只能引用 spec 里真存在的键。GMR⁴ 曾在这里写 tpl.spec.trueRank 这种
     * 三个都不存在的字段，当着用户的面写 undefined；所以这里既不做兜底猜测，
     * 也不给"没声明的量"编一个说法。
     */
    tplShapeLine() {
      const t = this.tpl;
      if (!t) return '';
      const s = t.spec;
      return `${s.n} 样本 × ${s.p} 预测 × ${s.k} 中介 × ${s.q} 响应（共 ${s.p * s.q} 个格子）`;
    },
    tplExpectLine() {
      const t = this.tpl;
      if (!t) return '';
      const e = t.spec.expect || {};
      const parts = [];
      if (e.indirect_excl_zero_min != null) parts.push(`至少 ${e.indirect_excl_zero_min} 格间接效应区间不含 0`);
      if (e.indirect_excl_zero_max != null) parts.push(e.indirect_excl_zero_max === 0
        ? '没有一格间接效应该被认为不含 0（这张表教的就是"没有"也要说出口）'
        : `间接效应不含 0 的格子数不超过 ${e.indirect_excl_zero_max}`);
      if (e.direct_excl_zero_min != null) parts.push(`至少 ${e.direct_excl_zero_min} 格直接效应不含 0`);
      if (e.direct_contains_zero_min != null) parts.push(`至少 ${e.direct_contains_zero_min} 格直接效应含 0（完全中介）`);
      if (e.sign_inconsistent_min != null) parts.push(`至少 ${e.sign_inconsistent_min} 格直接与间接方向相反（遮掩效应）`);
      if (e.total_contains_zero_min != null) parts.push(`至少 ${e.total_contains_zero_min} 格总效应含 0`);
      if (e.r2_xm_min != null) parts.push(`整体 R²(X,M) > ${e.r2_xm_min}`);
      if (e.convergence_ok != null) parts.push('收敛必须达标（R̂ / ESS 都在阈内）');
      if (e.must_warn) parts.push(`诊断里必须出现「${e.must_warn}」`);
      if (!parts.length) parts.push('这份设计故意不给"标准答案"，请看图与诊断');
      return parts.join('；');
    },
    checks() {
      const x = parseRows(this.form.xStr, 'X');
      const m = parseRows(this.form.mStr, 'M');
      const y = parseRows(this.form.yStr, 'Y');
      const out = {
        x: { ok: x.ok, n: x.n, p: x.p, error: x.error },
        m: { ok: m.ok, n: m.n, k: m.p, error: m.error },
        y: { ok: y.ok, n: y.n, q: y.p, error: y.error }
      };
      // 三表行数必须一致：行序就是样本配对，不一致时“能算”不代表“算的是同一批样本”。
      // 上一版这里写的是 x.n !== y.n（跟参数 a/b 无关），于是 M 行数不同永远抓不住。
      const nref = out.x.ok ? x.n : (out.m.ok ? m.n : y.n);
      ['x', 'm', 'y'].forEach((kk) => {
        if (!out[kk].ok) return;
        if (out[kk].n !== nref) {
          out[kk].error = `${kk.toUpperCase()} 有 ${out[kk].n} 行，与样本数 ${nref} 不符 —— 三张表行数必须一致且同序`;
          out[kk].ok = false;
        }
      });
      return out;
    },
    /**
     * 采样参数不拦运行（默认值就是好默认），但越界必须说出来 ——
     * 引擎会静默把 chains 抬到 2、把 iterations 抬到 200，用户如果不知道，
     * 就会以为自己跑的是自己填的那个数（GMR⁴ 的候选秩越界是同一类事）。
     */
    paramWarnings() {
      const w = [];
      const c = this.checks;
      if (this.form.chains < 2) w.push('链数少于 2：split-R̂ 无法计算，引擎会抬到 2 条链');
      if (this.form.iterations < 1000) w.push(`迭代数 ${this.form.iterations} 偏少：区间可能是自相关撑开的，实测 4000 就够，别低于 2000`);
      if (this.form.thin > 0 && this.form.iterations / this.form.thin < 400) {
        w.push(`留样只有约 ${Math.floor(this.form.iterations / this.form.thin)} 个/链：ESS 大概不够 400，诊断会报警`);
      }
      if (this.form.priorLambda > 10) w.push(`先验强度 λ=${this.form.priorLambda} 很强：后验会被先验拉向 0，与 OLS 的对照会明显偏离`);
      const n = c.x.ok ? c.x.n : 0;
      if (c.x.ok && c.m.ok && c.y.ok && n <= c.x.p + c.m.k + 2) {
        w.push(`样本数 ${n} 不足以同时估 ${c.x.p + c.m.k} 个系数：引擎会直接拒绝，请先增多样本或减少变量`);
      } else if (n && n <= 15) {
        w.push(`只有 ${n} 个样本：区间宽度主要由先验撑着，别把结论写成因果`);
      }
      return w;
    },
    canRun() { return this.checks.x.ok && this.checks.m.ok && this.checks.y.ok; },
    runHint() {
      const c = this.checks;
      if (!c.x.ok) return c.x.error || '先填预测变量 X（每行一个样本）';
      if (!c.m.ok) return c.m.error || '再填中介变量 M（行数与 X 一致）—— 没有 M 就不是中介分析';
      if (!c.y.ok) return c.y.error || '最后填响应变量 Y（行数与 X 一致）';
      return '';
    },
    runReadyHint() {
      const c = this.checks;
      const kept = Math.floor(this.form.iterations / this.form.thin) * this.form.chains;
      return `将用 ${c.x.n} 样本 × ${c.x.p} 预测 × ${c.m.k} 中介 × ${c.y.q} 响应（${c.x.p * c.y.q} 个格子）；` +
        `${this.form.chains} 链 × ${this.form.iterations} 迭代 / thin ${this.form.thin} ≈ 留样 ${kept} 条`;
    },
    diagnostics() {
      const d = this.analysisResult && this.analysisResult.diagnostics;
      return Array.isArray(d) ? d.filter(Boolean) : [];
    },
    convergence() { return (this.analysisResult && this.analysisResult.convergence) || null; },
    convergenceText() {
      const cv = this.convergence;
      if (!cv) return '';
      return `R̂ 最大 ${this.fmt(cv.rhat_max, 4)}（阈值 ${this.analysisResult.thresholds.rhat_max}）、ESS 最小 ${this.fmt(cv.ess_min, 0)}（阈值 ${this.analysisResult.thresholds.ess_min}）`;
    },
    convergenceBad() {
      const cv = this.convergence;
      return !!cv && cv.ok === false;
    },
    headlineTitle() {
      if (!this.analysisResult) return '还没有结果';
      const r = this.analysisResult;
      const nInd = (r.effects.indirect.hdi_lo || []).filter((v, i) =>
        v > 0 || r.effects.indirect.hdi_hi[i] < 0).length;
      return `Bayesian ERA：${r.p}→${r.k}→${r.q}，${r.cell_labels.length} 个格子里 ${nInd} 格间接效应区间不含 0`;
    },
    headlineNote() {
      if (!this.analysisResult) return '';
      if (this.convergenceBad) return '先解决收敛再看数：区间此刻不可信，加 iterations 重跑不是可选项';
      return this.analysisResult.interpretation || '';
    },
    headlineStats() {
      const r = this.analysisResult;
      if (!r) return [];
      const meanR2 = (r.r2.XM || []).reduce((a, b) => a + b, 0) / (r.q || 1);
      return [
        { label: '样本 / X / M / Y', value: `${r.n} / ${r.p} / ${r.k} / ${r.q}` },
        { label: '整体 R²(X,M)', value: this.fmt(meanR2, 4), emphasis: true },
        { label: '经中介的份额', value: this.fmt(this.meanOf(r.variance_partition.shared), 4), hint: 'X∩M，Borcard 分解的交叉项' },
        { label: 'split-R̂ 最大', value: this.fmt(r.convergence.rhat_max, 4), hint: `阈值 ${r.thresholds.rhat_max}` },
        { label: 'ESS 最小', value: this.fmt(r.convergence.ess_min, 0), hint: `阈值 ${r.thresholds.ess_min}` },
        { label: 'WAIC（Y 侧）', value: this.fmt(r.waic.waic, 2), hint: '只算响应侧，M 侧不计入' }
      ];
    },
    effectRows() {
      const r = this.analysisResult;
      if (!r) return [];
      const e = r.effects;
      return (r.cell_labels || []).map((cell, i) => {
        const excl = (blk) => e[blk].hdi_lo[i] > 0 || e[blk].hdi_hi[i] < 0;
        return {
          cell,
          d_est: this.fmt(e.direct.mean[i]), d_lo: this.fmt(e.direct.hdi_lo[i]), d_hi: this.fmt(e.direct.hdi_hi[i]),
          d_excl: excl('direct'), d_ols: this.fmt(e.direct.ols[i]),
          i_est: this.fmt(e.indirect.mean[i]), i_lo: this.fmt(e.indirect.hdi_lo[i]), i_hi: this.fmt(e.indirect.hdi_hi[i]),
          i_excl: excl('indirect'), i_p0: this.fmt(e.indirect.prob_gt0[i], 2), i_ols: this.fmt(e.indirect.ols[i]),
          t_est: this.fmt(e.total.mean[i]), t_lo: this.fmt(e.total.hdi_lo[i]), t_hi: this.fmt(e.total.hdi_hi[i]),
          // 遮掩效应：两条通路都成立且方向相反 —— 这时候"总效应不显著"最容易被读成"没效应"
          masked: excl('direct') && excl('indirect') &&
            Math.sign(e.direct.mean[i]) !== Math.sign(e.indirect.mean[i])
        };
      });
    },
    partitionRows() {
      const r = this.analysisResult;
      if (!r) return [];
      const vp = r.variance_partition;
      return Array.from({ length: r.q }, (_, c) => [
        this.fmt(vp.x_unique[c], 4), this.fmt(vp.shared[c], 4),
        this.fmt(vp.m_unique[c], 4), this.fmt(vp.residual[c], 4),
        Number(vp.x_unique[c]) + Number(vp.shared[c]) + Number(vp.m_unique[c]) + Number(vp.residual[c])
      ]);
    },
    modelInfo() {
      const r = this.analysisResult;
      if (!r) return [];
      const ic = r.identity_check;
      return [
        { label: '采样', value: `${r.chains} 链 × ${r.iterations} 迭代 / thin ${r.thin}，种子 ${r.seed}（同输入必同输出）` },
        { label: '先验', value: `系数 ~ N(0, 1/${r.prior_lambda})，方差 逆伽马(1e-3, 1e-3)` },
        { label: '区间口径', value: `${Math.round((r.prob || 0.95) * 100)}% 等尾分位数区间（不是最高密度区间 HDI）` },
        { label: '恒等式校验', value: `tot − (dir + ind) = ${this.fmt(ic.total_minus_parts, 3)}；后验 vs OLS 偏差 ${this.fmt(ic.posterior_vs_ols_direct, 4)} / ${this.fmt(ic.posterior_vs_ols_indirect, 4)}（容差 ${this.fmt(ic.tolerance, 4)}）` },
        { label: '标准化尺度', value: `X ${this.joined(r.X_scale)}；M ${this.joined(r.M_scale)}；Y ${this.joined(r.Y_scale)} —— 效应都在 z 尺度上，可直接跨变量比较` },
        { label: '一句话解释', value: r.interpretation || '' }
      ];
    },
    /**
     * 合法空白必须是**计算属性**，不能是 renderChart 里写的状态：切 tab 时 DOM 要同帧
     * 跟着变，否则 renderChart 量不到容器（note 期间它不在 DOM 里），会把能画的图报成故障。
     * 这是 GMR⁴ 双标图那次弹错警告的直接教训。
     */
    chartNote() {
      const r = this.analysisResult;
      if (!r) return '';
      if (this.activeChart === 'density') {
        const d = r.draws && r.draws.ind;
        if (!Array.isArray(d) || !d.length || !Array.isArray(d[0])) {
          return '后验抽样没有随结果带回来（或形状不是 格子 × 抽样），这张密度图无数据可画 —— ' +
            '森林图与诊断图不受影响。';
        }
      }
      return '';
    }
  },
  watch: {
    // 数据驱动重画：另三个模块的教训是初次分析不画、切 tab 才画
    analysisResult() { this.scheduleChart(); },
    activeChart() { this.scheduleChart(); }
  },
  methods: {
    fmt(v, digits = 4) { return FORMATTERS.fmt(v, digits); },
    meanOf(a) { return Array.isArray(a) && a.length ? a.reduce((x, y) => x + Number(y), 0) / a.length : NaN; },
    joined(v) { return Array.isArray(v) ? v.map((x) => this.fmt(x, 3)).join(', ') : '—'; },

    /* ---------------- 模板 ---------------- */
    loadTemplate(id) {
      const tpl = ERA_TEMPLATE_MAP[id];
      if (!tpl) { this.notify('error', '模板不存在'); return; }
      // 模板数据只有一个源头：eraSheetSpec.eraTemplateSheets(id)。
      // 视图里再抄一份数字数组的话，spec 改了这边不会跟着改（另三个模块就是这么漂的）。
      const sheets = eraTemplateSheets(id);
      const pick = (name) => {
        const sh = sheets.find((x) => x.name === name);
        return sh ? sh.aoa.slice(1).map((r) => r.slice(1).map(Number)) : null;
      };
      const X = pick('预测变量X'); const M = pick('中介变量M'); const Y = pick('响应变量Y');
      if (!X || !M || !Y) { this.notify('error', '模板数据读不出来，请反馈'); return; }
      this.form.xStr = JSON.stringify(X);
      this.form.mStr = JSON.stringify(M);
      this.form.yStr = JSON.stringify(Y);
      const params = sheets.find((x) => x.name === '模型参数');
      const kv = {};
      (params ? params.aoa.slice(1) : []).forEach((row) => { if (row[0]) kv[String(row[0])] = row[1]; });
      // 键名一律取表单字段（ERA_FORM_FIELDS），不在这里猜：Excel 里叫 prior_lambda，
      // 表单里叫 priorLambda，改名只发生在 eraToFormPatch / loadTemplate 这一处。
      if (kv.chains !== undefined) this.form.chains = Number(kv.chains) || 4;
      if (kv.iterations !== undefined) this.form.iterations = Number(kv.iterations) || 4000;
      if (kv.thin !== undefined) this.form.thin = Number(kv.thin) || 5;
      if (kv.seed !== undefined) this.form.seed = Number(kv.seed) || 12345;
      if (kv.prior_lambda !== undefined) this.form.priorLambda = Number(kv.prior_lambda) || 1;
      if (kv.prob !== undefined) this.form.prob = Number(kv.prob) || 0.95;
      this.selectedTplId = id;
      this.notify('success', `已载入模板：${X.length} 样本 × ${X[0].length} 预测 × ${M[0].length} 中介 × ${Y[0].length} 响应`);
    },
    clearTemplate() { this.selectedTplId = ''; },

    /* ---------------- 运行 ---------------- */
    buildPayload() {
      const x = parseRows(this.form.xStr, 'X');
      const m = parseRows(this.form.mStr, 'M');
      const y = parseRows(this.form.yStr, 'Y');
      const payload = {
        X: x.rows, M: m.rows, Y: y.rows,
        chains: this.form.chains, iterations: this.form.iterations, thin: this.form.thin,
        seed: this.form.seed, prior_lambda: this.form.priorLambda, prob: this.form.prob
      };
      if (this.tpl) payload.note = `${this.tpl.label} —— ${this.tpl.spec.note}`;
      return payload;
    },

    async runAnalysis() {
      if (!this.canRun) { this.notify('error', this.runHint); return; }
      const payload = this.buildPayload();
      const loading = ElLoading.service({
        lock: true,
        text: `正在共轭 Gibbs 采样（${payload.chains} 链 × ${payload.iterations} 迭代）... 多响应格子多时会慢`,
        background: 'rgba(0,0,0,0.5)'
      });
      try {
        const result = await runBayesianERA_Mediation(payload);
        this.analysisResult = result;
        this.lastPayload = payload;
        this.activeChart = ERA_CHART_TABS[0].id;   // 永远回到第一张，不条件跳转
        this.notify('success', `完成：${result.cell_labels.length} 个格子，R̂ 最大 ${this.fmt(result.convergence.rhat_max, 4)}`);
        this.$nextTick(() => document.querySelector('.ra-shell .result-section')?.scrollIntoView({ behavior: 'smooth' }));
      } catch (e) {
        const msg = e?.message || String(e);
        if (msg.includes('ipcRenderer') || !window.electron) {
          this.notify('error', { message: '请在 Electron 窗口中运行（不是浏览器）', duration: 5000 });
        } else {
          this.notify('error', { message: msg, duration: 9000, showClose: true });
        }
      } finally { loading.close(); }
    },

    /* ---------------- 图表 ---------------- */
    scheduleChart() { this.$nextTick(() => this.renderChart()); },
    renderChart() {
      const tab = this.activeChart;
      const fail = (reason, extra) => {
        // 每条失败路径都必须开口并说清缺什么。本模块已经因为静默 return 挨过两次：
        // 一次漏 ref（画不出还不吭声），一次 option 为 null 时直接 return ——
        // 用户看到的都是同一件事：图表区一片空白，没有任何线索。
        const msg = `图表「${tab}」没画出来：${reason}${extra ? ' —— ' + extra : ''}`;
        console.warn('[Bayesian ERA]', msg, { activeChart: tab, keys: Object.keys(this.analysisResult || {}) });
        this.notify('warning', msg);
        return Promise.resolve({ ok: false, reason });
      };
      const r = this.analysisResult;
      if (!r) return fail('no-result', '先点「运行分析」');
      const builder = ERA_CHART_BUILDERS[tab];
      if (!builder) return fail('no-builder', `未知的图表类型 ${tab}`);
      let option = null;
      try { option = builder(r, FORMATTERS); } catch (e) { return fail('builder-threw', e.message); }
      if (!option) {
        // 合法空白（数学上就不存在 / 抽样没带回来）走图区里的说明文字，不弹警告。
        // 警告只留给真故障：一个说清事实的安静面板比一个揪心的吐司强。
        if (this.chartNote) return Promise.resolve({ ok: false, reason: 'legit-empty', quiet: true });
        return fail('no-data', `结果里缺少 ${ERA_CHART_BLANK_REASON[tab] || '必要字段'}`);
      }
      const host = () => {
        const panel = this.$refs.chartPanel;
        return panel && typeof panel.getHost === 'function' ? panel.getHost() : null;
      };
      if (!this.$refs.chartPanel) return fail('no-ref', '外壳 ChartPanel 的 ref 没注册（模板漏了 ref="chartPanel"）');
      // drawWhenReady 里是 echarts.init/setOption —— 抛异常的话 promise 直接 reject，
      // 用户看到的就是"容器在、canvas 没有、什么提示也没有"（实机就是这个现象）。
      return Promise.resolve().then(() => drawWhenReady({ getHost: host, nextTick: this.$nextTick, option })).then((res) => {
        if (!res.ok) return fail(res.reason || 'unknown', res.reason === 'zero-size' ? '容器量不出尺寸' : '容器还没挂上');
        if (res.empty) this.notify('warning', `图表「${tab}」已生成但宽度为 0（布局未完成），切换图表类型可重画`);
        return res;
      }).catch((e) => fail('echarts-threw', (e && e.message) || String(e)));
    },

    /* ---------------- 输入 / 模板 / 导入 / 导出 ---------------- */
    async downloadInput() {
      // 不接异常就是"点了没反应"——用户根本不知道是没点上还是加载失败
      try {
        await this.saveJson(`BayesianERA_输入_${this.stamp()}.json`, this.buildPayload());
      } catch (e) {
        this.notify('error', ((e && e.message) || String(e)));
      }
    },
    async downloadTemplate() {
      // 必须接住异常：上一版没有 try/catch，import('xlsx') 一失败就是未捕获 rejection，
      // 用户看到的只有"点了没反应"（PERMANOVA 那份一直有 try/catch，这里原来是漏的）。
      try {
        const XLSX = await this.xlsx();
        await writeWorkbook(XLSX, eraTemplateSheets(this.selectedTplId), this.templateFileName());
        this.notify('success', '模板已下载：预测变量X / 中介变量M / 响应变量Y / 模型参数' + (this.selectedTplId ? '（当前设计）' : ''));
      } catch (e) {
        this.notify('error', ((e && e.message) || String(e)));
      }
    },
    templateFileName() {
      // 文件名要能认出是哪份设计：六份模板同名，用户下三份就分不清谁是谁（实测就是这样）。
      // 后缀用卡片上的中文名，不用内部 id —— id 在界面上根本看不到。
      const base = templateFilename('BayesianERA', this.stamp());
      const tag = this.selectedTplId ? eraTemplateFileTag(this.selectedTplId) : '';
      return tag ? base.replace(/\.xlsx$/, `_${tag}.xlsx`) : base;
    },
    openImport() {
      this.importTabs = null; this.importError = ''; this.importWarnings = []; this.imported = null;
      this.showImportDialog = true;
    },
    async handleFileChange(raw) {
      this.importTabs = null; this.importError = ''; this.importWarnings = []; this.imported = null;
      if (!raw) return;
      try {
        const sheets = await readWorkbook(raw);
        const res = mapWorkbook(sheets, ERA_IMPORT_SHEETS, { primary: 'X' });
        if (!res.ok) { this.importError = res.error; this.importWarnings = res.warnings || []; return; }
        this.importWarnings = res.warnings;
        this.imported = res.fields;
        // 必须用自己的预览器：previewFromFields 只认群落矩阵形状，喂行优先表会返回空数组
        this.importTabs = eraImportTabs(res.ids, res.fields);
      } catch (e) {
        this.importError = '读取失败：' + (e.message || e);
      }
    },
    applyImport() {
      if (!this.imported) {
        if (!this.importError) this.importError = '先选一个能解析的文件';
        return;
      }
      Object.assign(this.form, eraToFormPatch(this.imported));
      this.showImportDialog = false;
      // 导入的是真实数据，模板说明不再适用，否则导出会把用户数据标成模板名
      this.clearTemplate();
      this.notify('success', `已填入：${this.checks.x.n} 样本 × ${this.checks.x.p} 预测 × ${this.checks.m.k} 中介 × ${this.checks.y.q} 响应`);
    },
    openExport() { this.exportError = ''; this.showExportDialog = true; },
    async confirmExport() {
      this.exportError = '';
      if (!this.analysisResult) { this.exportError = '还没有分析结果可导出'; return; }
      const jobs = eraPlanExport(this.exportOptions, this.exportCtx(), this.stamp());
      try {
        for (const job of jobs) {
          if (job.type === 'xlsx') await writeWorkbook(await this.xlsx(), job.sheets, job.filename);
          else if (job.type === 'json') await this.saveJson(job.filename, job.data);
          else await this.exportPng(job.filename);
        }
        this.showExportDialog = false;
        this.notify('success', `已导出 ${jobs.length} 项`);
      } catch (e) { this.exportError = '导出失败：' + (e.message || e); }
    },
    exportCtx() {
      return {
        r: this.analysisResult,
        analysisResult: this.analysisResult,
        payload: this.lastPayload || this.buildPayload(),
        diagnostics: this.diagnostics,
        templateLabel: this.tpl ? `${this.tpl.label}（合成演示数据）` : '用户输入数据'
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
    async exportPng(filename) {
      const el = this.$refs.chartPanel?.getHost?.();
      if (!el) throw new Error('图表还没渲染，切到「数据可视化」再导');
      const echarts = await import('echarts');
      const chart = echarts.getInstanceByDom(el);
      if (!chart) throw new Error('当前没有可导出的图表实例');
      const { saveAs } = await import('file-saver');
      const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
      const bytes = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
      saveAs(new Blob([bytes], { type: 'image/png' }), filename);
    },
    stamp() { return fileStamp(); },
    notify(type, message) { ElMessage({ type, message, duration: 4000, showClose: true }); }
  }
};
</script>

<style scoped>
.run-button-container { display: flex; align-items: center; gap: 14px; margin-top: 18px; }
.params-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-top: 12px; }
.param-item label { display: block; font-size: 12px; color: #606266; margin-bottom: 6px; }
.param-warning { margin-top: 12px; padding: 10px 12px; border-radius: 8px; background: #fdf6ec; border-left: 3px solid #e6a23c; display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: #b8560f; }
.block-title { margin: 22px 0 10px; font-size: 15px; color: #303133; }
.diag-alert { margin: 12px 0; }
.diag-line { font-size: 12.5px; line-height: 1.7; }
.table-scroll { overflow-x: auto; }
.coef-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.coef-table th, .coef-table td { border: 1px solid #ebeef5; padding: 4px 8px; text-align: right; }
.coef-table thead th, .coef-table tbody th { background: #f5f7fa; text-align: center; }
.coef-table td.picked { font-weight: 700; background: #fef0f0; outline: 2px solid #f56c6c; }
.table-note { font-size: 12px; color: #909399; margin: 8px 0 0; }
.est { font-weight: 600; margin-right: 6px; }
.ci { font-size: 12px; color: #606266; margin-right: 8px; }
</style>
