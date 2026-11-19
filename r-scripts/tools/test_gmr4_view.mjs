#!/usr/bin/env node
/**
 * GMR4.vue 视图逻辑回归
 * ---------------------------------------------------------------
 *   node r-scripts/tools/test_gmr4_view.mjs
 *
 * 与 test_pm_view 同一套办法：用 vite 的 ssrLoadModule 真加载 SFC，
 * 于是"import 写了个不存在的导出"、"computed 里拼错字段"这类问题当场红，
 * 而不是等用户点进去看到白屏。
 *
 * 钉住的四类高发问题：
 *  A 形状误判（一维数组 / 写反 / 参差 / 空格被当 0）
 *  B 行序被动（X 与 Y 的第 i 行是同一个样本，任何排序都是错的）
 *  C 导出类型视图执行不了（CSV 那次就是 spec 发明了个外壳不会处理的类型）
 *  D 图表静默放弃（容器没就绪时必须开口，而不是"切 tab 才画"）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'node:url';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FRONTEND = path.join(ROOT, 'frontend');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable/bin/Rscript.exe');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gmr4view-'));

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (detail ? ` —— ${detail}` : '')); console.log(`  ✗ ${name}\n      ${String(detail).slice(0, 190)}`); }
};

const { gmr4SheetSpec: spec, gmr4Charts, format: formatMod } = await loadFrontendUtils(['gmr4SheetSpec', 'gmr4Charts', 'format']);
const FMT = formatMod.makeFormatters();

const { createServer } = await import(pathToFileURL(path.join(FRONTEND, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({
  root: FRONTEND, configFile: path.join(FRONTEND, 'vite.config.js'),
  server: { middlewareMode: true }, appType: 'custom', logLevel: 'error'
});
let comp;
try {
  comp = (await server.ssrLoadModule('/src/views/r-analysis/GMR4.vue')).default;
  check('视图 SFC 能被加载（import 与 computed 拼写当场验）', !!comp && typeof comp.methods === 'object');
} catch (e) {
  check('视图 SFC 能被加载', false, e.message);
  await server.close();
  process.exit(1);
}

const viewSource = fs.readFileSync(path.join(FRONTEND, 'src/views/r-analysis/GMR4.vue'), 'utf8');

const makeVm = () => {
  const notices = [];
  const vm = {
    ...comp.data(), $refs: {}, $nextTick: (f) => f && f(),
    notify: (type, message) => notices.push({ type, message: typeof message === 'string' ? message : message.message })
  };
  for (const [k, fn] of Object.entries(comp.computed)) {
    Object.defineProperty(vm, k, { get: () => fn.call(vm), configurable: true });
  }
  for (const [k, fn] of Object.entries(comp.methods)) vm[k] = fn.bind(vm);
  // 桩要放在 methods 绑定之后：视图的 notify 本身就是 method，先装会被后绑的真方法
  // （调 ElMessage，SSR 里静默无事发生）顶掉 —— notices 永远空，看起来像"代码没开口"，
  // 其实是测试自己把耳朵堵上了。
  vm.notify = (type, message) => notices.push({ type, message: typeof message === 'string' ? message : message.message });
  vm._notices = notices;
  return vm;
};

console.log('\n=== 1. 形状判定（A）===');
{
  const vm = makeVm();
  vm.form.xStr = JSON.stringify([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  check('二维数组认下来：3 样本 × 3 变量', vm.checks.x.ok && vm.checks.x.n === 3 && vm.checks.x.p === 3,
    JSON.stringify(vm.checks.x));

  vm.form.xStr = JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  check('一维数组被拒且说清要"每行一个样本"（不许当成一列继续跑）',
    !vm.checks.x.ok && /一维数组/.test(vm.checks.x.error), vm.checks.x.error);

  vm.form.xStr = JSON.stringify([[1, 2, 3, 4, 5, 6, 7, 8, 9]]);
  check('只有 1 行 -> 提示像是「变量×样本」写反',
    !vm.checks.x.ok && /写反/.test(vm.checks.x.error), vm.checks.x.error);

  vm.form.xStr = '[[1,2],[3,4,5]]';
  check('每行个数不一致被拒', !vm.checks.x.ok && /个数不一致/.test(vm.checks.x.error), vm.checks.x.error);

  vm.form.xStr = '[[1,2],[3,""],[4,5]]';
  check('空格被单独点名（与“非数字”分开：空串转数字会得到 0，那不是缺失而是一个真实值）',
    !vm.checks.x.ok && /有空单元格/.test(vm.checks.x.error) && /当成 0/.test(vm.checks.x.error), vm.checks.x.error);

  vm.form.xStr = '1\t2\t3\n4\t5\t6\n7\t8\t9';
  check('从 Excel 直接粘的制表符文本能用（不是只吃 JSON）',
    vm.checks.x.ok && vm.checks.x.n === 3, vm.checks.x.error);

  vm.form.xStr = '';
  check('空 X 不报错，只是 canRun=false + 文案指路',
    !vm.checks.x.error && !vm.canRun && /先填预测变量/.test(vm.runHint), vm.runHint);
}

console.log('\n=== 2. 行序与配对（B）===');
{
  const vm = makeVm();
  const X = [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]];
  const Y = [[1, 1, 0], [2, 0, 1], [3, 1, 1], [4, 0, 0], [5, 1, 0], [6, 0, 1]];
  vm.form.xStr = JSON.stringify(X); vm.form.yStr = JSON.stringify(Y);
  const p = vm.buildPayload();
  check('payload 的行序与输入完全一致（没有任何排序）',
    JSON.stringify(p.X) === JSON.stringify(X) && JSON.stringify(p.Y) === JSON.stringify(Y));
  check('X/Y 样本数不一致时拦住 X 并说明两个数',
    (() => { const v2 = makeVm(); v2.form.xStr = JSON.stringify(X); v2.form.yStr = JSON.stringify(Y.slice(0, 4));
      return !v2.canRun && /X 有 6 行，Y 有 4 行/.test(v2.checks.x.error); })(), '');
  check('Z 行数不符 -> danger 态并说清与谁不符',
    (() => { const v3 = makeVm(); v3.form.xStr = JSON.stringify(X); v3.form.yStr = JSON.stringify(Y);
      v3.form.zStr = JSON.stringify([[1], [2]]);
      return v3.checks.z.state === 'danger' && /与样本数 6 不符/.test(v3.checks.z.error); })(), '');
  check('Z 留空 -> payload 不带 Z（引擎会当成"不做校正"而不是空矩阵奇异）',
    !('Z' in vm.buildPayload()));
  check('ranks/lambdas 留空 -> 不带这两个键，让引擎自动全网格',
    !('ranks' in vm.buildPayload()) && !('lambdas' in vm.buildPayload()));
}

console.log('\n=== 3. 参数提示（不拦运行，但要说）===');
{
  const vm = makeVm();
  vm.form.xStr = JSON.stringify([[1, 2], [3, 4], [5, 6], [7, 8]]);      // p=2
  vm.form.yStr = JSON.stringify([[1, 1], [2, 0], [0, 1], [1, 0]]);      // q=2
  vm.form.ranksStr = '1,2,9';
  check('候选秩超过 min(p,q) 时提示会被引擎忽略',
    vm.paramWarnings.some((w) => /超过上限 min\(p,q\)=2/.test(w)), JSON.stringify(vm.paramWarnings));
  vm.form.ranksStr = '1,2';
  vm.form.xStr = JSON.stringify([[1, 2, 3, 4], [2, 3, 4, 5]]);           // n=2, p=4
  vm.form.yStr = JSON.stringify([[1, 2], [3, 4]]);
  check('样本数不大于变量数时给出不稳警告（而不是照样开跑不吭声）',
    vm.paramWarnings.some((w) => /选型会很不稳/.test(w)), JSON.stringify(vm.paramWarnings));
}

console.log('\n=== 4. 导出：只给视图执行得了的类型（C）===');
{
  const vm = makeVm();
  // 真实路径里没结果根本进不到导出（工具栏 disabled），这里先给一份最小结果
  vm.analysisResult = {
    n_samples: 4, p: 2, q: 2, s_max: 2, rank_selected: 2, lambda_selected: 1,
    R2: 0.5, R2_partialled: 0.6, R2_per_response: [0.5, 0.5], R2_per_response_partialled: [0.6, 0.6],
    rank_grid: [1, 2], lambda_grid: [0.1, 1],
    cv: { mean: [[1, 2], [0.5, 0.6]], se: [[0.1, 0.1], [0.1, 0.1]], best: { rank: 2, lambda: 0.1, value: 0.5 }, se_min: 0.1 },
    coefficients: [[1, 2], [3, 4]], rss_reduced: 1, rss_full: 1, kfold: 4, seed: 12345,
    covariates_partialled_out: 0, selection_rule: 'r', interpretation: 'i', diagnostics: []
  };
  vm.form.xStr = JSON.stringify([[1, 2], [3, 4], [5, 6], [7, 8]]);
  vm.form.yStr = JSON.stringify([[1, 2], [3, 4], [5, 6], [7, 8]]);
  const jobs = spec.gmr4PlanExport(vm.exportOptions.concat(['chart', 'input']), vm.exportCtx(), 'S');
  const kinds = new Set(jobs.map((j) => j.type));
  check('导出任务类型都在视图 confirmExport 会处理的三种之内（xlsx/json/png）',
    jobs.every((j) => ['xlsx', 'json', 'png'].includes(j.type)), [...kinds].join(','));
  check('视图里不出现 CSV 写出分支（曾经 spec 造过 csv，外壳根本不会执行）',
    !/csv/i.test(viewSource.replace(/\.csv/g, '')) || /accept|导入/.test(viewSource), '');
}

console.log('\n=== 5. 图表：数据不足与容器未就绪都要开口（D）===');
{
  const full = {
    rank_selected: 3, lambda_selected: 1, s_max: 5, p: 5, q: 8, n_samples: 36,
    R2: 0.31, R2_partialled: 0.93, R2_per_response: [0.35, 0.3, 0.33, 0.29, 0.31, 0.3, 0.32, 0.05],
    R2_per_response_partialled: [0.95, 0.93, 0.94, 0.92, 0.93, 0.94, 0.92, 0.21],
    rank_grid: [1, 2, 3, 4, 5], lambda_grid: [0.01, 0.1, 1, 10],
    cv: { mean: [[1, 2, 3, 4], [0.9, 1.2, 2, 3], [0.5, 0.6, 1.2, 2], [0.55, 0.62, 1.1, 1.9], [0.6, 0.7, 1.0, 1.8]],
          se: [[0.1, 0.1, 0.1, 0.1], [0.09, 0.1, 0.1, 0.1], [0.08, 0.09, 0.1, 0.1], [0.08, 0.09, 0.1, 0.11], [0.09, 0.1, 0.11, 0.12]],
          best: { rank: 3, lambda: 0.01, value: 0.5 }, se_min: 0.08 },
    coefficients: [[1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8]],
    U: [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]],
    V: [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3]],
    rss_reduced: 12, rss_full: 11, kfold: 4, seed: 12345, covariates_partialled_out: 1,
    selection_rule: '按广义 1-SE 规则取了最简约的 S=3', interpretation: '选了秩 S=3', diagnostics: []
  };
  const vm = makeVm();
  vm.analysisResult = full;
  check('四种图都能从结果里出 option（选型/热图/逐响应/双标）',
    ['selection', 'cvHeat', 'r2', 'biplot'].every((id) => gmr4Charts.GMR4_CHART_BUILDERS[id](full, FMT) ),
    JSON.stringify(Object.keys(gmr4Charts.GMR4_CHART_BUILDERS)));
  const rank1 = { ...full, rank_selected: 1, U: full.U.map((r) => r.slice(0, 1)), V: full.V.map((r) => r.slice(0, 1)) };
  check('秩只有 1 时双标图返回 null（画不得出来说明文字，而不是空图骗人）',
    gmr4Charts.GMR4_CHART_BUILDERS.biplot(rank1, FMT) === null);
  check('弱响应被标出来（阈值用其余响应最小值的相对判定，不是写死 0.5）',
    vm.perResponseRows[7].weak === true && vm.perResponseRows.slice(0, 7).every((x) => !x.weak),
    JSON.stringify(vm.perResponseRows.map((x) => x.weak)));
  // 选中格按"值"定位：S=3 在 rank_grid 的第 3 行、λ=1 在 lambda_grid 的第 3 列
  check('热图选中格由 rank_grid/lambda_grid 的值定位（不是行列下标硬配对）',
    vm.isPicked(2, 2) === true && vm.isPicked(0, 0) === false && vm.isPicked(4, 3) === false,
    JSON.stringify([vm.isPicked(2, 2), vm.isPicked(0, 0)]));
  check('选中的 λ 不在网格里时整表不高亮（宁可没有标记，也不标错格子）',
    (() => { const v2 = makeVm(); v2.analysisResult = { ...full, lambda_selected: 0.77 };
      return v2.cvRows.every((row, i) => row.every((_, j) => !v2.isPicked(i, j))); })(), '');
  check('系数表按行优先渲染（p 行），不转置',
    vm.coefRows.length === 5 && vm.coefRows[0].length === 8);
  check('带 diagnostics 时头部说明改成"先看诊断"（颜色不许先替用户下结论）',
    (() => { const v2 = makeVm(); v2.analysisResult = { ...full, diagnostics: ['响应侧 Y\'Y 奇异，加了正则'] };
      return /先看下方诊断/.test(v2.headlineNote); })(), '');
  check('无 diagnostics 时头部直接给选型依据原文',
    /1-SE/.test(vm.headlineNote), vm.headlineNote);
  check('R² 两行都在概览里，且偏后那个是强调项',
    vm.headlineStats.some((x) => x.label === 'R²（偏掉协变量后）' && x.emphasis) &&
      vm.headlineStats.some((x) => x.label === 'R²（原尺度）'));

  // 容器拿不到时必须开口（这是 PERMANOVA 那轮"初次不画"的同一类问题）
  const vm3 = makeVm();
  vm3.analysisResult = full;
  vm3.$refs = {};
  const res = await vm3.renderChart();
  check('容器未就绪 -> 返回 no-host 且真的 notify 了（静默放弃就是"切 tab 才画"）',
    res && res.ok === false && vm3._notices.some((n) => n.type === 'warning' && /容器/.test(n.message)),
    JSON.stringify({ res, notices: vm3._notices }));
}

console.log('\n=== 6. 端到端：模板 -> 表单 -> 真 R ===');
{
  const vm = makeVm();
  vm.loadTemplate('lowrank3');
  check('模板填入表单（X/Y/Z 都有行）', vm.canRun && vm.checks.x.n === 36 && vm.checks.y.q === 8 && vm.checks.z.ok,
    JSON.stringify([vm.checks.x, vm.checks.y, vm.checks.z]));
  check('模板的 ranks/kfold/seed 也进表单了',
    vm.form.ranksStr === '1,2,3,4,5' && vm.form.kfold === 4 && vm.form.seed === 12345,
    JSON.stringify([vm.form.ranksStr, vm.form.kfold, vm.form.seed]));
  check('选中模板后 payload 带 note（导出时能认出数据来自哪个设计）',
    /真实秩|低秩|36 样本|教学/.test(String(vm.buildPayload().note || '')), String(vm.buildPayload().note));

  const f = path.join(TMP, 'in.json');
  fs.writeFileSync(f, JSON.stringify(vm.buildPayload()));
  let code = 0;
  try {
    execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/gmr4.R'), f, f + '.out', f + '.err'], { stdio: 'pipe', timeout: 600000 });
  } catch (e) { code = e.status || 1; }
  check('视图组出来的 payload 真跑通', code === 0, code ? fs.readFileSync(f + '.err', 'utf8') : '');
  if (code === 0) {
    const r = JSON.parse(fs.readFileSync(f + '.out', 'utf8'));
    vm.analysisResult = r;
    check('端到端结果满足模板预期 S=3', r.rank_selected === 3, `S=${r.rank_selected}`);
    check('结果喂给视图后所有区块都有内容（概览/选型信息/两张表/图）',
      vm.headlineStats.length >= 6 && vm.selectionInfo.length >= 6 && vm.coefRows.length === r.p &&
        vm.cvRows.length === r.rank_grid.length && !!gmr4Charts.GMR4_CHART_BUILDERS.selection(r, FMT));
    check('视图不做任何隐式兜底（模板名不会盖在用户导入的数据上）',
      (() => { const v2 = makeVm(); v2.form.xStr = '[[1,2],[3,4],[5,6]]'; v2.form.yStr = '[[1,2],[3,4],[5,6]]';
        return v2.buildPayload().note === undefined; })(), '');
  }
}

console.log('\n=== 7. 源码层面（外壳与命名一致性）===');
{
  check('路由已注册（视图不注册就是永远进不去，而首页会先亮绿）',
    /path: '\/r-analysis\/gmr4'/.test(fs.readFileSync(path.join(FRONTEND, 'src/router/routerMap.js'), 'utf8')));
  check('视图用的是三层外壳（自己的 template 选择器/导入导出对话框都来自 components）',
    /<DataTemplateSelector/.test(viewSource) && /<ImportDialog/.test(viewSource) && /<ExportDialog/.test(viewSource) &&
      /<ChartPanel/.test(viewSource) && /<StatGrid/.test(viewSource));
  check('重画由数据驱动（watch analysisResult/activeChart），不靠一次 $nextTick 运气',
    /analysisResult\(\) \{ this\.scheduleChart\(\); \}/.test(viewSource) && /activeChart\(\) \{ this\.scheduleChart\(\); \}/.test(viewSource));
  check('文件名走 sheetIo.fileStamp（四个模块的时间戳格式要能对上）',
    /fileStamp\(\)/.test(viewSource) && /templateFilename\('GMR4'/.test(viewSource));
  check('spec 是唯一数据源（视图里没有再抄一份模板数字数组）',
    !/const TPL_X|const TEMPLATE_X|\[\[[0-9.]+,\s*[0-9.]+,\s*[0-9.]+,\s*[0-9.]+,\s*[0-9.]+\]/.test(viewSource));
}

await server.close();
console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
process.exit(fail ? 1 : 0);
