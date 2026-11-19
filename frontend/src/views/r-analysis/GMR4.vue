<template>
  <div class="ra-shell">
    <AnalysisHeader
      icon="🧭"
      title="GMR⁴（多响应降秩回归）"
      subtitle="多个响应变量共享少数潜在方向时，满秩系数矩阵会记住噪声：约束 rank(B)=S 并调正则强度 λ，用交叉验证 + 广义 1-SE 规则选最简约的模型"
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
              <span class="info-value">{{ tpl.spec.n }} 样本 × {{ tpl.spec.p }} 预测变量 × {{ tpl.spec.q }} 响应（真实秩 {{ tpl.spec.trueRank }}，含 {{ tpl.spec.covariates }} 个协变量）</span>
            </div>
            <div class="template-info-row">
              <span class="info-label">预期结论：</span>
              <span class="info-value">选型回到 S={{ tpl.spec.expect.rank_selected }}，偏掉协变量后 R² &gt; {{ tpl.spec.expect.R2_partialled_min }}；第 {{ tpl.spec.weakResponse }} 个响应被故意压弱，应当明显低于其余</span>
            </div>
            <div class="template-tip">
              <span class="tip-icon">💡</span><span>{{ tpl.spec.note }}</span>
            </div>
          </div>
        </div>

        <DataTemplateSelector
          icon="🧭"
          :label="`设计模板（${gmrCount} 个 · 含可运行数据）`"
          :groups="gmrGroups"
          :selected-id="selectedTplId"
          :summary="tplSummary"
          note="点击后自动写入 X / Y / Z 与参数表，可直接点「运行分析」。数据由确定性随机源合成（两次下载逐字节相同），已用便携版 R 实测：选型回到真实秩 3、偏协变量后 R² 与逐响应 R² 均与预期一致。"
          @select="loadTemplate"
          @clear="clearTemplate"
        />

        <div class="data-input-section">
          <h2 class="section-title">📊 数据输入</h2>
          <div class="input-hint-card">
            <el-icon><InfoFilled /></el-icon>
            <span>三张表都按「每行一个样本」写，行数必须一致；X 与 Y 的行序就是配对关系，错一行等于拿别的样本去解释结局。</span>
          </div>

          <div class="data-input-grid">
            <div class="data-input-card">
              <h3>🧪 预测变量 X (n × p)</h3>
              <p class="input-hint">[[x1, x2, ...], ...] 每行一个样本
[
  [0.31, -1.20, 0.44],
  [-0.88, 0.12, 1.05]
]</p>
              <el-input v-model="form.xStr" type="textarea" :rows="7" placeholder="也可以直接点「导入数据」用 Excel 的表填入" />
              <div class="validation-status">
                <el-tag :type="checks.x.ok ? 'success' : 'info'" size="small">
                  {{ checks.x.ok ? `✓ ${checks.x.n} 样本 × ${checks.x.p} 变量` : '等待输入' }}
                </el-tag>
                <span v-if="checks.x.error" class="error-text">{{ checks.x.error }}</span>
              </div>
            </div>

            <div class="data-input-card">
              <h3>🎯 响应变量 Y (n × q)</h3>
              <p class="input-hint">[[y1, y2, ...], ...] 行数与 X 一致
[
  [2.7, -0.4, 1.1, 0.2],
  [1.9, 0.8, -0.6, 0.5]
]</p>
              <el-input v-model="form.yStr" type="textarea" :rows="7" placeholder="多个响应放多列；列数决定降秩上限 min(p, q)" />
              <div class="validation-status">
                <el-tag :type="checks.y.ok ? 'success' : 'info'" size="small">
                  {{ checks.y.ok ? `✓ ${checks.y.n} 样本 × ${checks.y.q} 响应` : '等待输入' }}
                </el-tag>
                <span v-if="checks.y.error" class="error-text">{{ checks.y.error }}</span>
              </div>
            </div>

            <div class="data-input-card optional">
              <h3>🧾 协变量 Z <span class="input-hint">— 可选，建模前偏掉</span></h3>
              <p class="input-hint">[[z1, ...], ...] 每行一个样本。
注意：Z 会被从 X 与 Y 同时偏掉（Frisch–Waugh），
不是"多加一列进模型"，也不出现在系数矩阵 B 里</p>
              <el-input v-model="form.zStr" type="textarea" :rows="6" placeholder="留空表示不做协变量校正" />
              <div class="validation-status">
                <el-tag :type="checks.z.state" size="small">{{ checks.z.text }}</el-tag>
                <span v-if="checks.z.error" class="error-text">{{ checks.z.error }}</span>
              </div>
            </div>
          </div>

          <h2 class="section-title" style="margin-top: 26px">⚙️ 选型参数</h2>
          <div class="input-hint-card">
            <el-icon><InfoFilled /></el-icon>
            <span>候选秩与 lambda 留空即自动取全网格（秩 1…min(p,q)，lambda 0.001…100）。最终落点由交叉验证 + 广义 1-SE 规则决定，不需要手填秩 —— 手填等于把结论预先设定。</span>
          </div>
          <div class="params-grid">
            <div class="param-item">
              <label>候选秩 ranks（逗号分隔）</label>
              <el-input v-model="form.ranksStr" placeholder="留空 = 1,2,…,min(p,q)" />
            </div>
            <div class="param-item">
              <label>候选 lambda（逗号分隔）</label>
              <el-input v-model="form.lambdasStr" placeholder="留空 = 10^-3 … 10^2 共 12 档" />
            </div>
            <div class="param-item">
              <label>交叉验证折数 kfold</label>
              <el-input-number v-model="form.kfold" :min="2" :max="10" />
            </div>
            <div class="param-item">
              <label>随机种子 seed</label>
              <el-input-number v-model="form.seed" :min="1" :max="999999" />
            </div>
          </div>
          <div v-if="paramWarnings.length" class="param-warning">
            <el-icon><WarningFilled /></el-icon>
            <span>{{ paramWarnings.join('；') }}</span>
          </div>

          <!-- 运行按钮就在输入区下方（与另三个模块同一位置）。外壳 ToolbarActions 只有
               下载模板/导入/导出/下载输入四个动作，运行从来不在那里 —— 上一版以
               为它在，结果整个页面根本没法开始分析。 -->
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
          <el-alert v-if="diagnostics.length" :title="`引擎提醒（${diagnostics.length} 条）—— 先看这里再看数值`"
            type="warning" :closable="false" show-icon class="diag-alert">
            <div v-for="(d, i) in diagnostics" :key="i" class="diag-line">· {{ d }}</div>
          </el-alert>
          <el-alert v-else-if="!canTrustPartialled" title="没有偏掉协变量，R²（偏后）与 R²（原尺度）本来就相同"
            type="info" :closable="false" show-icon class="diag-alert" />

          <h3 class="block-title">📐 选型结果</h3>
          <InfoGrid :items="selectionInfo" />

          <h3 class="block-title">📊 逐响应 R²（降秩最容易悄悄丢掉某个响应）</h3>
          <el-table :data="perResponseRows" size="small" border>
            <el-table-column prop="name" label="响应" width="90" />
            <el-table-column prop="after" label="偏掉协变量后" width="150" />
            <el-table-column prop="before" label="原尺度" width="120" />
            <el-table-column label="判定">
              <template #default="scope">
                <el-tag :type="scope.row.weak ? 'warning' : 'success'" size="small">
                  {{ scope.row.weak ? '明显低于其余，可能被降秩丢掉' : '正常' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <h3 class="block-title">🧮 系数矩阵 B（{{ analysisResult.p }} 行 × {{ analysisResult.q }} 列，标准化尺度）</h3>
          <div class="table-scroll">
            <table class="coef-table">
              <thead>
                <tr><th>X \\ Y</th><th v-for="(_, j) in coefRows[0]" :key="j">Y{{ j + 1 }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in coefRows" :key="i">
                  <th>X{{ i + 1 }}</th><td v-for="(v, j) in row" :key="j">{{ fmt(v) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="table-note">B = U Vᵀ 的等价形式；秩 {{ analysisResult.rank_selected }} 意味着这 {{ analysisResult.p }} × {{ analysisResult.q }} 个数其实由 {{ rankDf }} 个自由度决定。</p>

          <h3 class="block-title">🧪 交叉验证网格（CV 均值，加粗=选中格）</h3>
          <div class="table-scroll">
            <table class="coef-table">
              <thead><tr><th>S \\ λ</th><th v-for="l in analysisResult.lambda_grid" :key="l">{{ l }}</th></tr></thead>
              <tbody>
                <tr v-for="(row, i) in cvRows" :key="i">
                  <th>S{{ analysisResult.rank_grid[i] }}</th>
                  <td v-for="(v, j) in row" :key="j" :class="{ picked: isPicked(i, j) }">{{ fmt(v, 4) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <ChartPanel :tabs="chartTabs" v-model:active="activeChart" :ready="!!analysisResult"
            :empty-text="`当前结果不足以画这张图（例如秩只有 1 时没有双标图可看）`" />
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
import { GMR4_CHART_TABS, GMR4_CHART_BUILDERS } from '@/utils/gmr4Charts';
import { runGMR4 } from '@/api/r';
import {
  readWorkbook, mapWorkbook, previewFromFields, writeWorkbook, templateFilename, fileStamp
} from '@/utils/sheetIo';
import {
  GMR4_IMPORT_SHEETS, GMR4_EXPORT_OPTIONS, GMR4_EXPORT_DEFAULTS, GMR4_PREVIEW_TABS,
  GMR4_TEMPLATE_GROUPS, GMR4_TEMPLATE_MAP, GMR4_TEMPLATE_COUNT,
  gmr4PlanExport, gmr4ToFormPatch, gmr4TemplateSheets
} from '@/utils/gmr4SheetSpec';

const FORMATTERS = makeFormatters();

/** 中位数：弱响应判定用。用 min 会被一个偶然很小的值拖低阈值（实测漏判过） */
function medianOf(a) {
  const s = a.filter((x) => Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (!s.length) return NaN;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * 表单里的文本 -> 数值行数组。
 * 与另三个模块不同，这里必须**保留行序**：X 的第 i 行与 Y 的第 i 行是同一个样本，
 * 所以解析只做形状检查，不做任何排序。
 */
function parseRows(text, label) {
  const s = String(text || '').trim();
  if (!s) return { ok: false, n: 0, p: 0, error: '', empty: true, label };
  let v = null;
  try { v = JSON.parse(s); } catch (e) {
    // 常见误操作：直接把 Excel 里的制表符文本粘进来
    const lines = s.split(/\r?\n/).filter((x) => x.trim());
    const rows = lines.map((ln) => ln.split(/[\t,;]+/).map((x) => Number(String(x).trim())));
    if (rows.length >= 2 && rows.every((r) => r.length >= 1) && rows.every((r) => r.every(Number.isFinite))) {
      return { ok: true, n: rows.length, p: rows[0].length, rows, error: '', label };
    }
    return { ok: false, n: 0, p: 0, rows: [], error: `${label} 不是合法 JSON 数组（也不能按制表符/逗号解析成数值表）`, label };
  }
  if (!Array.isArray(v) || !v.length) return { ok: false, n: 0, p: 0, rows: [], error: `${label} 是空的或不是数组`, label };
  // 一维数组：可能是 [[..],[..]] 少写了一层，也可能真的是一列
  if (!Array.isArray(v[0])) {
    if (v.every((x) => Number.isFinite(x))) {
      return { ok: false, n: v.length, p: 1, rows: [], error: `${label} 是一维数组 —— GMR⁴ 需要「每行一个样本」的二维数组`, label };
    }
    return { ok: false, n: 0, p: 0, rows: [], error: `${label} 里不是数字`, label };
  }
  const widths = [...new Set(v.map((r) => r.length))];
  if (widths.length > 1) {
    return { ok: false, n: v.length, p: 0, rows: [], error: `${label} 每列个数不一致（出现 ${widths.join('/')}）`, label };
  }
  // 注意 Number('') === 0 且 isFinite(0) === true：直接 Number() 会把空单元格
  // 悄悄变成 0，比不填更坏（0 在丰度/表达量里是个合法值，没人会发现）。
  const blankAt = v.findIndex((r) => r.some((x) => x === '' || x === null || x === undefined ||
    (typeof x === 'string' && !x.trim())));
  if (blankAt >= 0) {
    return { ok: false, n: v.length, p: widths[0], rows: [],
      error: `${label} 第 ${blankAt + 1} 行有空单元格 —— 空值会被当成 0，那不是缺失而是个真实数值`, label };
  }
  const bad = v.findIndex((r) => !r.every((x) => Number.isFinite(Number(x))));
  if (bad >= 0) {
    return { ok: false, n: v.length, p: widths[0], rows: [], error: `${label} 第 ${bad + 1} 行有非数字单元格`, label };
  }
  if (v.length < 2) {
    return { ok: false, n: v.length, p: widths[0], rows: [], error: `${label} 只有 1 行 —— 像是把「变量 × 样本」写反了`, label };
  }
  return { ok: true, n: v.length, p: widths[0], rows: v.map((r) => r.map(Number)), error: '', label };
}

export default {
  name: 'GMR4Analysis',
  components: {
    AnalysisHeader, AnalysisToolbar, ToolbarActions, ImportDialog, ExportDialog,
    DataTemplateSelector, ChartPanel, ResultCard, StatGrid, InfoGrid, InfoFilled, WarningFilled, VideoPlay
  },
  data() {
    return {
      isToolbarExpanded: false,          // 与另三个模块一致：进页面时工具栏是收缩的
      form: { xStr: '', yStr: '', zStr: '', ranksStr: '', lambdasStr: '', kfold: 5, seed: 12345 },
      analysisResult: null,
      selectedTplId: '',
      activeChart: 'selection',
      showImportDialog: false,
      importTabs: null, importError: '', importWarnings: [], imported: null,
      showExportDialog: false, exportError: '',
      exportOptions: [...GMR4_EXPORT_DEFAULTS],
      importSheets: GMR4_IMPORT_SHEETS,
      exportOptions2: GMR4_EXPORT_OPTIONS,
      chartTabs: GMR4_CHART_TABS,
      previewTabs: GMR4_PREVIEW_TABS
    };
  },
  computed: {
    gmrGroups() { return GMR4_TEMPLATE_GROUPS; },
    gmrCount() { return GMR4_TEMPLATE_COUNT; },
    tpl() { return GMR4_TEMPLATE_MAP[this.selectedTplId] || null; },
    selectedTemplate() { return this.tpl; },
    tplSummary() {
      return this.tpl ? `已选：${this.tpl.label}` : '未选择模板（可直接粘贴数据或导入 Excel）';
    },
    checks() {
      const x = parseRows(this.form.xStr, 'X');
      const y = parseRows(this.form.yStr, 'Y');
      const z = parseRows(this.form.zStr, 'Z');
      const out = {
        x: { ok: x.ok, n: x.n, p: x.p, error: x.error },
        y: { ok: y.ok, n: y.n, q: y.p, error: y.error },
        z: { ok: z.ok || z.empty, n: z.n, q: z.p, error: z.error, empty: z.empty }
      };
      out.z.state = z.empty ? 'info' : (out.z.ok ? 'success' : 'danger');
      out.z.text = z.empty ? '未提供（不做协变量校正）' : (out.z.ok ? `✓ ${z.n} 样本 × ${z.p} 个协变量` : '格式有误');
      if (out.x.ok && out.y.ok && x.n !== y.n) {
        out.x.error = `X 有 ${x.n} 行，Y 有 ${y.n} 行 —— 两边样本数必须一致`;
        out.x.ok = false;
      }
      if (out.z.ok && !out.z.empty && out.x.ok && z.n !== x.n) {
        out.z.error = `Z 有 ${z.n} 行，与样本数 ${x.n} 不符`;
        out.z.state = 'danger';
      }
      return out;
    },
    /**
     * 参数不拦运行（自动全网格是更好的默认），但要说出来：
     * 手写 ranks=10 而 min(p,q)=5 时，引擎会静默忽略越界值，
     * 用户如果不知道，就会以为自己在比 10 个模型。
     */
    paramWarnings() {
      const w = [];
      const c = this.checks;
      const smax = c.x.ok && c.y.ok ? Math.min(c.x.p, c.y.q) : 0;
      const ranks = this.numList(this.form.ranksStr);
      if (ranks.length && smax) {
        const over = ranks.filter((r) => r > smax);
        if (over.length) w.push(`候选秩 ${over.join(', ')} 超过上限 min(p,q)=${smax}，引擎会忽略它们`);
      }
      const lams = this.numList(this.form.lambdasStr);
      if (lams.some((l) => l < 0)) w.push('lambda 不能为负，已忽略负数');
      if (c.x.ok && c.y.ok && c.x.n <= c.x.p) {
        w.push(`样本数 ${c.x.n} 不大于变量数 ${c.x.p}：选型会很不稳，建议增多样本`);
      }
      return w;
    },
    canRun() {
      return this.checks.x.ok && this.checks.y.ok;
    },
    runHint() {
      if (!this.checks.x.ok) return this.checks.x.error || '先填预测变量 X（每行一个样本）';
      if (!this.checks.y.ok) return this.checks.y.error || '再填响应变量 Y（行数与 X 一致）';
      return '';
    },
    runReadyHint() {
      const c = this.checks;
      return `将用 ${c.x.n} 样本 × ${c.x.p} 预测 × ${c.y.q} 响应${c.z.ok && !c.z.empty ? `，偏掉 ${c.z.q || 1} 个协变量` : '，不做协变量校正'}；` +
        `秩上限 ${Math.min(c.x.p, c.y.q)}，lambda ${this.numList(this.form.lambdasStr).length || 12} 档`;
    },
    diagnostics() {
      const d = this.analysisResult && this.analysisResult.diagnostics;
      return Array.isArray(d) ? d.filter(Boolean) : [];
    },
    headlineTitle() {
      if (!this.analysisResult) return '还没有结果';
      const r = this.analysisResult;
      return `GMR⁴：选定秩 S=${r.rank_selected}（满秩 ${r.s_max}）、λ=${r.lambda_selected}`;
    },
    headlineNote() {
      if (!this.analysisResult) return '';
      return this.diagnostics.length
        ? '引擎带提醒：先看下方诊断条再看数值 —— 有几种情形下 R² 高低并不说明模型好不好'
        : this.analysisResult.selection_rule || '';
    },
    canTrustPartialled() {
      return !!this.analysisResult && this.analysisResult.covariates_partialled_out > 0;
    },
    headlineStats() {
      const r = this.analysisResult;
      if (!r) return [];
      return [
        { label: '选定秩 S', value: r.rank_selected, hint: `上限 min(p,q)=${r.s_max}` },
        { label: '选定 λ', value: this.fmt(r.lambda_selected, 4) },
        { label: 'R²（偏掉协变量后）', value: this.fmt(r.R2_partialled, 4), emphasis: true },
        { label: 'R²（原尺度）', value: this.fmt(r.R2, 4) },
        { label: '样本 / 预测 / 响应', value: `${r.n_samples} / ${r.p} / ${r.q}` },
        { label: '系数自由度', value: this.rankDf, hint: 'S(p+q−S)，降秩省下的正是这部分' }
      ];
    },
    rankDf() {
      const r = this.analysisResult;
      if (!r) return 0;
      return r.rank_selected * (r.p + r.q - r.rank_selected);
    },
    selectionInfo() {
      const r = this.analysisResult;
      if (!r) return [];
      return [
        { label: '选型依据', value: r.selection_rule || '（引擎未给出）' },
        { label: 'CV 最小点', value: `S=${r.cv && r.cv.best ? r.cv.best.rank : '?'}，λ=${r.cv && r.cv.best ? r.cv.best.lambda : '?'}` },
        { label: '1-SE 容差', value: r.cv ? this.fmt(r.cv.se_min, 5) : '—' },
        { label: '交叉验证', value: `${r.kfold} 折（种子 ${r.seed}）` },
        { label: '偏掉的协变量', value: `${r.covariates_partialled_out} 个` },
        { label: '残差平方和', value: `选定秩 ${this.fmt(r.rss_reduced, 4)} ｜ 满秩 ${this.fmt(r.rss_full, 4)}` },
        { label: '一句话解释', value: r.interpretation || '' }
      ];
    },
    perResponseRows() {
      const r = this.analysisResult;
      if (!r) return [];
      const after = r.R2_per_response_partialled || [];
      const before = r.R2_per_response || [];
      return after.map((v, i) => {
        // “其余响应”是除自己以外全部，不是前 n-1 个（那样最后一个永远不参与比较）
        const rest = after.filter((_, j) => j !== i);
        return {
          name: `Y${i + 1}`,
          after: this.fmt(v, 4),
          before: this.fmt(before[i], 4),
          // 阈值必须相对其余响应，不能写死 0.5：一批本来就都在 0.4 的数据里，
          // 0.05 那个才是真正的离群者，写死阈值会判成全员“正常”。
          // 系数从 min×0.6 改为 median×0.8 —— 前者被真模板当场漏判过
          // （Y8=0.602，其余 min=0.989，0.989×0.6=0.593 刚好放过）
          weak: after.length >= 3 && rest.length > 0 && v < medianOf(rest) * 0.8
        };
      });
    },
    coefRows() {
      const r = this.analysisResult;
      const m = r && r.coefficients;
      return Array.isArray(m) && Array.isArray(m[0]) ? m : [];
    },
    cvRows() {
      const r = this.analysisResult;
      const m = r && r.cv && r.cv.mean;
      return Array.isArray(m) && Array.isArray(m[0]) ? m : [];
    }
  },
  watch: {
    // 数据驱动重画：另三个模块的教训是初次分析不画、切 tab 才画
    analysisResult() { this.scheduleChart(); },
    activeChart() { this.scheduleChart(); }
  },
  methods: {
    fmt(v, digits = 3) { return FORMATTERS.num ? FORMATTERS.num(v, digits) : this.fallbackNum(v, digits); },
    fallbackNum(v, digits) {
      return Number.isFinite(v) ? Number(v.toFixed(digits)).toString() : '—';
    },
    numList(s) {
      // 先剔空串再 Number：Number('') 是 0，"留空"会变成"填了个 0"（ ranks=[0] 那种）
      return String(s || '').split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean)
        .map(Number).filter((x) => Number.isFinite(x));
    },
    isPicked(i, j) {
      const r = this.analysisResult;
      return r && r.rank_grid[i] === r.rank_selected && r.lambda_grid[j] === r.lambda_selected;
    },

    /* ---------------- 模板 ---------------- */
    loadTemplate(id) {
      const tpl = GMR4_TEMPLATE_MAP[id];
      if (!tpl) { this.notify('error', '模板不存在'); return; }
      // 模板数据只有一个源头：gmr4SheetSpec.gmr4TemplateSheets(id)。
      // 视图里再抄一份数字数组的话，spec 改了这边不会跟着改（另三个模块就是这么漂的）。
      const sheets = gmr4TemplateSheets(id);
      const pick = (name) => {
        const sh = sheets.find((x) => x.name === name);
        return sh ? sh.aoa.slice(1).map((r) => r.slice(1).map(Number)) : null;
      };
      const X = pick('预测变量X'); const Y = pick('响应变量Y'); const Z = pick('协变量Z');
      if (!X || !Y) { this.notify('error', '模板数据读不出来，请反馈'); return; }
      this.form.xStr = JSON.stringify(X);
      this.form.yStr = JSON.stringify(Y);
      this.form.zStr = Z && Z.length ? JSON.stringify(Z) : '';
      const params = sheets.find((x) => x.name === '模型参数');
      const kv = {};
      (params ? params.aoa.slice(1) : []).forEach((row) => { if (row[0]) kv[String(row[0])] = row[1]; });
      this.form.ranksStr = String(kv.ranks || '');
      this.form.lambdasStr = String(kv.lambdas || '');
      this.form.kfold = Number(kv.kfold) || 5;
      this.form.seed = Number(kv.seed) || 12345;
      this.selectedTplId = id;
      this.notify('success', `已载入模板：${X.length} 样本 × ${X[0].length} 预测 × ${Y[0].length} 响应`);
    },
    clearTemplate() { this.selectedTplId = ''; },

    /* ---------------- 运行 ---------------- */
    buildPayload() {
      const x = parseRows(this.form.xStr, 'X');
      const y = parseRows(this.form.yStr, 'Y');
      const z = parseRows(this.form.zStr, 'Z');
      const payload = { X: x.rows, Y: y.rows };
      if (z.ok && !z.empty) payload.Z = z.rows;
      const ranks = this.numList(this.form.ranksStr);
      const lams = this.numList(this.form.lambdasStr);
      if (ranks.length) payload.ranks = ranks;
      if (lams.length) payload.lambdas = lams;
      payload.kfold = this.form.kfold;
      payload.seed = this.form.seed;
      if (this.tpl) payload.note = `${this.tpl.label} —— ${this.tpl.spec.note}`;
      return payload;
    },

    async runAnalysis() {
      if (!this.canRun) { this.notify('error', this.runHint); return; }
      const loading = ElLoading.service({ lock: true, text: '正在做降秩选型（交叉验证网格）...', background: 'rgba(0,0,0,0.5)' });
      try {
        const result = await runGMR4(this.buildPayload());
        this.analysisResult = result;
        this.activeChart = result.rank_selected >= 2 ? 'selection' : 'cvHeat';
        this.notify('success', `完成：选定秩 S=${result.rank_selected}`);
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
    scheduleChart() {
      this.$nextTick(() => this.renderChart());
    },
    renderChart() {
      const r = this.analysisResult;
      if (!r) return Promise.resolve({ ok: false, reason: 'no-result' });
      const option = (GMR4_CHART_BUILDERS[this.activeChart] || GMR4_CHART_BUILDERS.selection)(r, FORMATTERS);
      if (!option) return Promise.resolve({ ok: false, reason: 'no-data' });
      return drawWhenReady({
        getHost: () => this.$refs.chartPanel?.getHost?.() || null,
        nextTick: this.$nextTick,
        option
      }).then((res) => {
        if (!res.ok && (res.reason === 'no-host' || res.reason === 'zero-size')) {
          this.notify('warning', `图表容器${res.reason === 'zero-size' ? '量不出尺寸（0 宽/0 高）' : '还没就绪'}（等了 ${res.waited} 帧），切换一下图表类型可重画`);
        } else if (res.ok && res.empty) {
          this.notify('warning', '图表已生成但宽度为 0（布局未完成），切换图表类型或收缩侧边栏可重画');
        }
        return res;
      });
    },

    /* ---------------- 输入 / 模板 / 导入 / 导出 ---------------- */
    async downloadInput() {
      await this.saveJson(`GMR4_输入_${this.stamp()}.json`, this.buildPayload());
    },
    async downloadTemplate() {
      const XLSX = await this.xlsx();
      // 选了设计就下那一份，没选则下默认第一个：模板与表单同源，不存在"下的和用的不一样"
      await writeWorkbook(XLSX, gmr4TemplateSheets(this.selectedTplId), this.templateFileName());
      this.notify('success', '模板已下载：预测变量X / 响应变量Y' + (this.selectedTplId ? '（当前设计）' : '') + ' / 模型参数');
    },
    templateFileName() { return templateFilename('GMR4', this.stamp()); },

    openImport() {
      this.importTabs = null; this.importError = ''; this.importWarnings = []; this.imported = null;
      this.showImportDialog = true;
    },
    async handleFileChange(raw) {
      this.importTabs = null; this.importError = ''; this.importWarnings = []; this.imported = null;
      if (!raw) return;
      try {
        const sheets = await readWorkbook(raw);
        const res = mapWorkbook(sheets, GMR4_IMPORT_SHEETS, { primary: 'X' });
        if (!res.ok) {
          this.importError = res.error; this.importWarnings = res.warnings || [];
          return;
        }
        this.importWarnings = res.warnings;
        this.imported = res.fields;
        this.importTabs = previewFromFields(res.ids, res.fields.X, res.fields);
      } catch (e) {
        this.importError = '读取失败：' + (e.message || e);
      }
    },
    applyImport() {
      if (!this.imported) {
        if (!this.importError) this.importError = '先选一个能解析的文件';
        return;
      }
      Object.assign(this.form, gmr4ToFormPatch(this.imported));
      this.showImportDialog = false;
      // 导入的是真实数据，模板说明不再适用，否则导出会把用户数据标成模板名
      this.clearTemplate();
      const c = this.checks.x;
      this.notify('success', `已填入：${c.n} 样本 × ${c.p} 预测变量`);
    },

    openExport() { this.exportError = ''; this.showExportDialog = true; },
    async confirmExport() {
      this.exportError = '';
      if (!this.analysisResult) { this.exportError = '还没有分析结果可导出'; return; }
      const jobs = gmr4PlanExport(this.exportOptions, this.exportCtx(), this.stamp());
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
        payload: this.buildPayload(),
        diagnostics: this.diagnostics,
        templateLabel: this.tpl ? `${this.tpl.label}（合成演示数据）` : '用户输入数据'
      };
    },
    async xlsx() {
      const m = await import('xlsx');
      return m.utils ? m : m.default;
    },
    async saveJson(filename, data) {
      const { saveAs } = await import('file-saver');
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
.run-button-container {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 18px;
}

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
.coef-table td.picked { font-weight: 700; background: #ecf5ff; outline: 2px solid #1f6feb; }
.table-note { font-size: 12px; color: #909399; margin: 8px 0 0; }
</style>
