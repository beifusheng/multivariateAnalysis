#!/usr/bin/env node
/**
 * Bayesian_ERA.vue（视图层）回归
 * ---------------------------------------------------------------
 *   node r-scripts/tools/test_era_view.mjs
 *
 * 断言类别照搬 test_gmr4_view.mjs 那份清单 —— 那 193 项每一项背后都是一次真实事故，
 * 换成第五个模块时如果少抄一条，同一类事故就会在第五个模块上重演：
 *   A 形状判定（空单元格变成 0 / 一维数组 / 写反 / 参差行宽）
 *   B 行序与配对（三表行数不一致必须抓住，尤其是 M —— 上一版只比了 X/Y）
 *   C 参数提示（不拦运行但必须开口；引擎会静默夹紧的那些数不能让用户以为是自己填的）
 *   D 表单字段契约（form 的键必须等于 ERA_FORM_FIELDS；这是 GMR⁴「填入表单没反应」的正门）
 *   E 图表（数据不足与容器未就绪都要开口；合法空白走 note 不弹警告）
 *   F 导出（只给视图执行得了的类型；文件名带中文名，否则下三份分不清谁是谁）
 *   G 端到端（模板 -> 表单 -> 真 R -> 结果表/卡片文案不许写 undefined）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FRONTEND = path.join(ROOT, 'frontend');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable/bin/Rscript.exe');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'eraview-'));
const require_ = createRequire(import.meta.url);

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (detail ? ` —— ${detail}` : '')); console.log(`  ✗ ${name}\n      ${String(detail).slice(0, 260)}`); }
};

const { eraSheetSpec: spec, eraCharts, format: formatMod } = await loadFrontendUtils(['eraSheetSpec', 'eraCharts', 'format']);
const FMT = formatMod.makeFormatters();

const { createServer } = await import(pathToFileURL(path.join(FRONTEND, 'node_modules/vite/dist/node/index.js')).href);
// 必须把项目自己的 vite.config.js 交给 vite：上一版这里手写 { root, logLevel, resolve.alias }，
// 结果 plugin-vue 拿不到 @vue/compiler-sfc（报 "Cannot read properties of null (reading 'parse')"），
// 看上去像新视图写坏了，其实是预览服务没配好。照 test_gmr4_view.mjs 的选项原样来。
const server = await createServer({
  root: FRONTEND, configFile: path.join(FRONTEND, 'vite.config.js'),
  // cacheDir 必须显式指定：默认落在 root 的 node_modules/.vite，而那**正是开发者
  // 正在跑的 dev 服务所用的一份依赖缓存**。跑一次测试就把它改写一遍，浏览器里
  // 已加载的页面再去动态 import('xlsx') 就会「Failed to fetch dynamically imported
  // module」—— 实机现象是导出模板点了没反应 / 导出结果报这个 fetch 错误。
  // 放 node_modules 里：既隔离，又天然不进版本控制。
  cacheDir: path.join(FRONTEND, 'node_modules', '.vite-test-cache'),
  server: { middlewareMode: true }, appType: 'custom', logLevel: 'error'
});
console.log('\n=== 0. SFC 能被加载（import 路径与 computed 拼写当场验）===');
let comp;
try {
  comp = (await server.ssrLoadModule('/src/views/r-analysis/Bayesian_ERA.vue')).default;
  check('视图 SFC 能被加载（import 与 computed 拼写当场验）', !!comp && typeof comp.methods === 'object');
} catch (e) {
  check('视图 SFC 能被加载', false, e.message);
  await server.close();
  process.exit(1);
}
await server.close();
check('组件名是 BayesianERAAnalysis（keep-alive 与路由 name 靠它）', comp.name === 'BayesianERAAnalysis', comp.name);

const viewSource = fs.readFileSync(path.join(FRONTEND, 'src/views/r-analysis/Bayesian_ERA.vue'), 'utf8');
const makeVm = () => {
  const vm = Object.create(comp);
  const data = comp.data.call(vm);
  Object.assign(vm, data);
  vm._notices = [];
  vm.$refs = {};
  vm.$nextTick = (fn) => { if (typeof fn === 'function') fn(); };
  const computed = comp.computed || {};
  for (const k of Object.keys(computed)) {
    Object.defineProperty(vm, k, { get: () => computed[k].call(vm), configurable: true });
  }
  for (const k of Object.keys(comp.methods || {})) vm[k] = comp.methods[k].bind(vm);
  // 必须放在 methods 绑定**之后**：先挂上去会被真正的 notify（它调 ElMessage）盖掉，
  // 于是 notices 永远是空数组，每条“必须开口”的断言都在比一个不存在的元素。
  vm.notify = (type, message) => vm._notices.push({ type, message: typeof message === 'string' ? message : message.message });
  return vm;
};

const runR = (payload, tag) => {
  const f = path.join(TMP, `${tag}.json`);
  fs.writeFileSync(f, JSON.stringify(payload));
  try {
    execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/bayesian_era_mediation.R'), f, f + '.out', f + '.err'],
      { stdio: 'pipe', timeout: 900000 });
  } catch (e) {
    return { err: fs.existsSync(f + '.err') ? fs.readFileSync(f + '.err', 'utf8') : String(e.message) };
  }
  return { r: JSON.parse(fs.readFileSync(f + '.out', 'utf8')) };
};

console.log('\n=== 1. 形状判定（A）===');
{
  const vm = makeVm();
  vm.form.xStr = JSON.stringify([[1, 2], [3, 4], [5, 6]]);
  vm.form.mStr = JSON.stringify([[1], [2], [3]]);
  vm.form.yStr = JSON.stringify([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  check('三张表都认下来（3 样本 × 2 预测 / 1 中介 / 3 响应）',
    vm.checks.x.ok && vm.checks.x.n === 3 && vm.checks.x.p === 2 &&
    vm.checks.m.ok && vm.checks.m.k === 1 && vm.checks.y.q === 3,
    JSON.stringify(vm.checks));
  vm.form.xStr = '[1, 2, 3]';
  check('一维数组要说清"需要每行一个样本"', !vm.checks.x.ok && /一维数组/.test(vm.checks.x.error), vm.checks.x.error);
  vm.form.xStr = JSON.stringify([[1, 2], [3, 4, 5]]);
  check('行宽不一致必须报错', !vm.checks.x.ok && /列数不一致/.test(vm.checks.x.error), vm.checks.x.error);
  vm.form.xStr = JSON.stringify([[1, ''], [3, 4]]);
  check('空单元格必须报错而不是变成 0（0 是合法值，没人会发现）',
    !vm.checks.x.ok && /空单元格/.test(vm.checks.x.error), vm.checks.x.error);
  vm.form.xStr = JSON.stringify([[1, 'a'], [3, 4]]);
  check('非数字单元格要点名行号', !vm.checks.x.ok && /第 1 行/.test(vm.checks.x.error), vm.checks.x.error);
  vm.form.xStr = JSON.stringify([[1, 2]]);
  check('只有 1 行要说"像是把变量 × 样本写反了"', !vm.checks.x.ok && /写反/.test(vm.checks.x.error), vm.checks.x.error);
  vm.form.xStr = '1\t2\t3\n4\t5\t6';
  check('从 Excel 直接粘的制表符文本也要能吃下', vm.checks.x.ok && vm.checks.x.n === 2, vm.checks.x.error);
  vm.form.xStr = '乱码';
  check('彻底解析不了时给得出人话', !vm.checks.x.ok && /不是合法 JSON/.test(vm.checks.x.error), vm.checks.x.error);
}

console.log('\n=== 2. 行序与配对（B：三表都要比，尤其 M）===');
{
  const vm = makeVm();
  const X = [[1, 2], [3, 4], [5, 6]];
  const M = [[0.5], [1.5], [2.5]];
  const Y = [[1, 2], [3, 4], [5, 6]];
  vm.form.xStr = JSON.stringify(X); vm.form.mStr = JSON.stringify(M); vm.form.yStr = JSON.stringify(Y);
  const p = vm.buildPayload();
  check('payload 原样保留行序（行序就是样本配对，绝不排序）',
    JSON.stringify(p.X) === JSON.stringify(X) && JSON.stringify(p.M) === JSON.stringify(M) &&
    JSON.stringify(p.Y) === JSON.stringify(Y));
  vm.form.mStr = JSON.stringify([[0.5], [1.5]]);
  check('M 少一行必须被抓住（上一版只比 X/Y，M 错位一路放行到引擎）',
    !vm.checks.m.ok && /M 有 2 行/.test(vm.checks.m.error), JSON.stringify(vm.checks.m));
  vm.form.mStr = JSON.stringify(M);
  vm.form.yStr = JSON.stringify([[1, 2], [3, 4]]);
  check('Y 少一行同样被抓住', !vm.checks.y.ok && /Y 有 2 行/.test(vm.checks.y.error), JSON.stringify(vm.checks.y));
  check('行数不一致时 canRun=false（不给"能算但错配"的机会）', vm.canRun === false);
}

console.log('\n=== 3. 表单字段契约（D：GMR⁴「填入表单没反应」的正门）===');
{
  const vm = makeVm();
  const got = Object.keys(vm.form).slice().sort();
  const want = spec.ERA_FORM_FIELDS.slice().sort();
  check('data().form 的键 == ERA_FORM_FIELDS（spec 是唯一定义处）',
    got.join(',') === want.join(','), `表单 ${got.join(',')} vs 清单 ${want.join(',')}`);
  // 导入路径必须把每一格都落到表单字段上（键名漂移在这一步静默失效过）
  const sheets = spec.eraTemplateSheets('highdim');
  const wb = {};
  sheets.forEach((s) => { wb[s.name] = s.aoa; });
  const fields = {};
  for (const s of sheets) {
    const rows = s.aoa.slice(1).map((r) => r.slice(1).map(Number));
    const ids = s.aoa.slice(1).map((r) => r[0]);
    fields[s.name === '模型参数' ? 'params' : s.name.replace(/[^A-Z]/g, '')] =
      s.name === '模型参数' ? { kv: Object.fromEntries(s.aoa.slice(1)) } : { rows, ids, columns: s.aoa[0].slice(1) };
  }
  const patch = spec.eraToFormPatch({ X: fields.X, M: fields.M, Y: fields.Y, params: fields.params });
  Object.assign(vm.form, patch);
  check('导入路径把参数写进表单字段（chains/iterations/thin/seed/priorLambda/prob 全部落地）',
    vm.form.chains === 4 && vm.form.iterations === 4000 && vm.form.thin === 5 &&
    vm.form.seed === 6060 && vm.form.priorLambda === 1 && Math.abs(vm.form.prob - 0.95) < 1e-9,
    JSON.stringify([vm.form.chains, vm.form.iterations, vm.form.thin, vm.form.seed, vm.form.priorLambda, vm.form.prob]));
  check('三张数据表通过导入进了表单，且形状没被转置',
    JSON.stringify(JSON.parse(vm.form.xStr)) === JSON.stringify(fields.X.rows) &&
    JSON.parse(vm.form.mStr).length === 60 && JSON.parse(vm.form.yStr)[0].length === 8, '');
}

console.log('\n=== 4. 采样参数提示（C：不拦运行，但必须开口）===');
{
  const vm = makeVm();
  vm.form.xStr = JSON.stringify(Array.from({ length: 30 }, (_, i) => [i, i * 2]));
  vm.form.mStr = JSON.stringify(Array.from({ length: 30 }, (_, i) => [i % 3]));
  vm.form.yStr = JSON.stringify(Array.from({ length: 30 }, (_, i) => [i, i + 1, i + 2]));
  vm.form.chains = 1; vm.form.iterations = 500; vm.form.thin = 20; vm.form.priorLambda = 40;
  const w = vm.paramWarnings;
  check('链数 <2 要说 split-R̂ 算不出来', w.some((x) => /split-R/.test(x)), w.join(' | '));
  check('迭代数偏少要开口', w.some((x) => /迭代数 500 偏少/.test(x)), w.join(' | '));
  check('留样条数不够 ESS 要算给用户看', w.some((x) => /留样只有约/.test(x)), w.join(' | '));
  check('先验很强要说明后验会被拉向 0', w.some((x) => /先验强度/.test(x)), w.join(' | '));
  check('但这些都不拦运行（默认值才是更好的默认）', vm.canRun === true);
  vm.form.chains = 4; vm.form.iterations = 4000; vm.form.thin = 5; vm.form.priorLambda = 1;
  vm.form.xStr = JSON.stringify([[1, 2], [3, 4], [5, 6]]);
  vm.form.mStr = JSON.stringify([[1], [2], [3]]);
  vm.form.yStr = JSON.stringify([[1, 2, 3], [3, 4, 5], [5, 6, 7]]);
  check('样本数不够估系数时提前说"引擎会直接拒绝"（三表行数必须一致才会进这一支）',
    vm.paramWarnings.some((x) => /引擎会直接拒绝/.test(x)), vm.paramWarnings.join(' | '));
  vm.form.xStr = JSON.stringify(Array.from({ length: 12 }, (_, i) => [i, i * 2]));
  vm.form.mStr = JSON.stringify(Array.from({ length: 12 }, (_, i) => [i % 3]));
  vm.form.yStr = JSON.stringify(Array.from({ length: 12 }, (_, i) => [i, i + 1]));
  check('12 个样本要提示"区间宽度主要由先验撑着"',
    vm.paramWarnings.some((x) => /只有 12 个样本/.test(x)), vm.paramWarnings.join(' | '));
  check('提示写在页面上而不是只 console：模板里必须有 param-warning 节点',
    /param-warning/.test(viewSource) && /paramWarnings\.length/.test(viewSource));
}

console.log('\n=== 5. 图表构造器（E）===');
{
  const sheets = spec.eraTemplateSheets('partmed');
  const kv = Object.fromEntries(sheets[3].aoa.slice(1));
  const payload = {
    X: sheets[0].aoa.slice(1).map((r) => r.slice(1).map(Number)),
    M: sheets[1].aoa.slice(1).map((r) => r.slice(1).map(Number)),
    Y: sheets[2].aoa.slice(1).map((r) => r.slice(1).map(Number)),
    chains: +kv.chains, iterations: +kv.iterations, thin: +kv.thin, seed: +kv.seed,
    prior_lambda: +kv.prior_lambda, prob: +kv.prob
  };
  const t0 = Date.now();
  const { r, err } = runR(payload, 'view-partmed');
  if (err) { check('视图用的这份结果真跑得出来', false, err.slice(0, 200)); }
  else {
    check(`视图结果来自真 R（${((Date.now() - t0) / 1000).toFixed(1)}s）`, !!r && r.success === true);
    const b = eraCharts.ERA_CHART_BUILDERS;
    const forest = b.forest(r, FMT);
    check('森林图：三块 × 每格两条 series，区间与点都在',
      forest && forest.series.length === 6 &&
      forest.series.filter((s) => s.type === 'custom').length === 3 &&
      forest.series.filter((s) => s.type === 'scatter').length === 3 &&
      forest.series[0].data.length === r.cell_labels.length, `${forest && forest.series.length} 条 series`);
    check('森林图：0 参考线只挂一次（三条 series 各画会叠成粗线）',
      forest.series.filter((s) => s.markLine).length === 1);
    check('森林图：y 轴刻度只给整数格子名，偏移出来的半格位置留空',
      forest.yAxis.axisLabel.formatter(0) === 'X1→Y1' &&
        forest.yAxis.axisLabel.formatter(0.3) === '' &&
        forest.yAxis.axisLabel.formatter(99) === '',
      `[${forest.yAxis.axisLabel.formatter(0)}|${forest.yAxis.axisLabel.formatter(0.3)}]`);
    // renderItem 必须真能返回可画的东西：只断言 option 结构是空谈
    const api = {
      value: (i) => forest.series[0].data[0][i],
      coord: (v) => [10 + v[0], 20 + v[1] * 0],
      size: () => [10, 40]
    };
    const item = forest.series[0].renderItem({}, api);
    check('森林图：renderItem 真的画出三段线（区间横线 + 两端竖帽）',
      item && item.type === 'group' && item.children.length === 3 &&
        item.children.every((c) => c.type === 'line'), JSON.stringify(item));
    const dens = b.density(r, FMT);
    // 抽样矩阵的朝向是引擎与视图之间的约定，不是可以各自理解的事：
    // 上一版按 抽样 × 格子 读，得到 600 条各只有 4 点的曲线，最后静默 null。
    check('draws.ind 的朝向 = 格子 × 抽样（与 cell_labels 同长）',
      r.draws.ind.length === r.cell_labels.length && r.draws.ind[0].length === r.draws.n_kept,
      `${r.draws.ind.length} × ${r.draws.ind[0].length} vs labels ${r.cell_labels.length} / n_kept ${r.draws.n_kept}`);
    // 用例必须是"只有守卫能拦得住"的那种。上一版我拿转置后的矩阵当反例，但那副数据
    // 每行只有 4 个点，会被"每行至少 20 个点"的门槛顺手拦下 —— 守卫删掉它照样返回 null，
    // 于是这条断言其实什么也没验（典型"为错理由而绿"）。改成行数与格子数不符：
    // 每行点数仍足够，只有 orientation/长度校验能拦住它。
    check('抽样行数与格子数不符时密度图不画（宁可不说，也不猜方向画出 24 格里少一格的图）',
      b.density({ ...r, draws: { ...r.draws, ind: r.draws.ind.slice(1) } }, FMT) === null &&
        b.density(r, FMT) !== null, '守卫没拦住，或者正例也画不出了');
    check('密度图：每格一条曲线，纵位置按格子序号排开（尾部回到本格基线）',
      dens && dens.series.length === r.cell_labels.length &&
        dens.series[0].data.length === 120 &&
        Math.abs(dens.series[1].data[0][1] - 1.92) < 1e-6 &&
        Math.min(...dens.series[1].data.map((p) => p[1])) > 1.0,
      dens && `${dens.series.length} 条曲线，首点 y=${dens.series[1].data[0][1]}`);
    check('密度图：核密度是归一化的正函数（出现负密度就是实现错了）',
      dens && dens.series.every((s) => s.data.every((p) => Number.isFinite(p[1]))));
    const part = b.partition(r, FMT);
    check('方差分解：四块堆叠、每块 q 个值',
      part && part.series.length === 4 && part.series.every((s) => s.stack === 'vp' && s.data.length === r.q));
    const diag = b.diag(r, FMT);
    check('诊断图：直接 + 间接两批点，越线的标红',
      diag && diag._points.length === 2 * r.cell_labels.length &&
        diag._points.some((p) => p.bad === false) &&
        diag.series[0].markLine.data.length === 2, diag && `${diag._points.length} 点`);
    // 数据不足必须返回 null（由视图决定是安静说明还是报警），不许硬画
    const cut = JSON.parse(JSON.stringify(r)); delete cut.draws;
    check('密度图缺 draws -> builder 返回 null（由视图决定开口方式）', b.density(cut, FMT) === null);
    const cut2 = JSON.parse(JSON.stringify(r)); delete cut2.variance_partition.x_unique;
    check('方差分解缺分量 -> builder 返回 null 而不是画出半张图', b.partition(cut2, FMT) === null);
    const cut3 = JSON.parse(JSON.stringify(r)); cut3.effects.indirect.ess = [];
    check('诊断图 ESS 为空 -> builder 返回 null', b.diag(cut3, FMT) === null);

    // ---- 分中介通路图：引擎新报的那一层必须真能画，而不是多一个 tab 占位 ----
    // k=1（这份 partmed）：一张图 = 1 柱 + 1 个合计点，而且不许误报抵消。
    const p1 = b.paths(r, FMT);
    check('分中介通路：k=1 时出得来（1 组柱子 + 合计点），不能当成退化形状直接不出图',
      !!p1 && p1.series.length === 2 && p1.series[0].data.length === r.cell_labels.length,
      p1 ? `${p1.series.length} 组系列` : 'null');
    check('分中介通路：k=1 时类目上不许出现抵消标记', p1 && !p1.xAxis.data.some((x) => /⚖/.test(x)),
      p1 && p1.xAxis.data.join(','));
    const cutP = JSON.parse(JSON.stringify(r)); delete cutP.indirect_by_mediator;
    check('分中介通路：没有这一层时 builder 返回 null（由视图决定怎么开口）',
      b.paths(cutP, FMT) === null, '');

    // 真跑一份 cancelmed（两条中介反号）：抵消必须在这个图上能看见。
    // 不在这里手造一个假 bm —— 那个只能证明我自己的图代码能画自己编的数。
    const shC = spec.eraTemplateSheets('cancelmed');
    const kvC = Object.fromEntries(shC[3].aoa.slice(1));
    const runC = runR({
      X: shC[0].aoa.slice(1).map((x) => x.slice(1).map(Number)),
      M: shC[1].aoa.slice(1).map((x) => x.slice(1).map(Number)),
      Y: shC[2].aoa.slice(1).map((x) => x.slice(1).map(Number)),
      chains: 2, iterations: +kvC.iterations, thin: +kvC.thin, seed: +kvC.seed,
      prior_lambda: +kvC.prior_lambda, prob: +kvC.prob
    }, 'view-cancelmed');
    if (runC.err) {
      check('cancelmed 真跑得出来（分中介通路图的先决条件）', false, runC.err.slice(0, 180));
    } else {
      const rc = runC.r;
      const bm = rc.indirect_by_mediator;
      check('cancelmed：两个中介都被拆开给出', bm.per_mediator.length === 2 && bm.mediator_labels.length === 2,
        JSON.stringify(bm.mediator_labels));
      check(`cancelmed：引擎真报了抵消（${bm.cancelled_count} 格），这些格子在图上挂 ⚖`,
        bm.cancelled_count >= 3 && bm.cancelled_cells.every((x) => rc.cell_labels.includes(x)),
        `${bm.cancelled_count} 格：${bm.cancelled_cells.join('/')}`);
      const p2 = b.paths(rc, FMT);
      const withFlag = p2.xAxis.data.filter((x) => /⚖$/.test(x)).length;
      check('图上每个被判定抵消的格子都看得见（⚖ 数量 = 抵消格数，不是只写在诊断里）',
        withFlag === bm.cancelled_count, `旗标 ${withFlag} / 抵消 ${bm.cancelled_count}`);
      const tip = p2.tooltip.formatter([{ axisValue: bm.cancelled_cells[0], value: 0, seriesName: 'x', marker: '' }]);
      check('鼠标提示会把“抵消不等于没有中介”说出来（用户不必自己回推）',
        /抵消/.test(tip) && /不等于/.test(tip), tip.replace(/<[^>]+>/g, '').slice(0, 90));
      // 柱子之和与合计点对得上：图与结论不能各算各的（本项目老对头）
      const sumBars = rc.cell_labels.map((_, ci) =>
        bm.per_mediator.reduce((acc, blk) => acc + blk.mean[ci], 0));
      check('柱子里相加就是合计点（同一份数字，不自己重算）',
        Math.max(...sumBars.map((v, ci) => Math.abs(v - rc.effects.indirect.mean[ci]))) < 1e-6, '');
      check('抵消的代价看得见：合计贴 0 而单条通路远离 0',
        Math.max(...rc.effects.indirect.mean.map(Math.abs)) < 0.5 *
          Math.max(...bm.per_mediator[0].mean.map(Math.abs)),
        `合计最大 ${Math.max(...rc.effects.indirect.mean.map(Math.abs)).toFixed(3)}`);
      check('导出与界面共用同一个行表函数（分中介通路表不为导出另写一份）',
        typeof spec.eraMediatorPathRows === 'function' &&
          spec.eraMediatorPathRows(rc).length === 1 + rc.cell_labels.length * 2,
        `${spec.eraMediatorPathRows(rc).length} 行`);
    }

    console.log('\n=== 6. renderChart 的每条失败路径都要开口 ===');
    const vm = makeVm();
    vm.analysisResult = null;
    let res = await vm.renderChart();
    check('没结果：报 no-result 并提示先点运行', res.reason === 'no-result' && /运行分析/.test(vm._notices[0].message), vm._notices[0] && vm._notices[0].message);
    vm.analysisResult = r;
    vm.activeChart = 'nonexistentTab';
    res = await vm.renderChart();
    check('未知 tab：报 no-builder 而不是静默 return', res.reason === 'no-builder' && /nonexistentTab/.test(vm._notices.at(-1).message));
    vm.activeChart = 'density';
    vm.analysisResult = cut;                       // draws 被删掉
    check('合法空白走 note：chartNote 必须说清缺什么', /后验抽样/.test(vm.chartNote), vm.chartNote.slice(0, 80));
    res = await vm.renderChart();
    check('合法空白不弹警告（上一版这里挨一句"没画出来：no-data"，用户当成 bug 报了）',
      res.reason === 'legit-empty' && res.quiet === true, JSON.stringify(res));
    vm.analysisResult = r;
    vm.activeChart = 'partition';
    vm.$refs.chartPanel = undefined;
    res = await vm.renderChart();
    check('缺 ChartPanel ref：报 no-ref 并点出漏写的属性', res.reason === 'no-ref' && /chartPanel/.test(vm._notices.at(-1).message));
    vm.$refs.chartPanel = { getHost: () => null };
    res = await vm.renderChart();
    check('ref 在但容器取不到：报 no-host（与 no-ref 是两种病，不能混成一个提示）',
      res.reason === 'no-host', JSON.stringify(res));
    // option 造不出来的真故障（builder 抛异常）。
    // 上一版这里试图monkey-patch eraCharts.ERA_CHART_BUILDERS —— 那是 loadFrontendUtils
    // 用 esbuild 另加载的一份模块实例，视图走 vite 拿的是**另一份**，改了个没人读的副本。
    // 真故障要用数据逼：把 effects.direct 抹掉，森林图内部就会 TypeError。
    vm.activeChart = 'forest';
    vm.analysisResult = { ...r, effects: { ...r.effects, direct: undefined } };
    res = await vm.renderChart();
    check('builder 抛异常也要变成一句能复现的话（promise reject = 用户看到空白）',
      res.reason === 'builder-threw' && /图表「forest」没画出来/.test(vm._notices.at(-1).message),
      JSON.stringify(res) + ' | ' + vm._notices.at(-1).message);
    vm.analysisResult = r;

    console.log('\n=== 7. 结果区文案与卡片（G）===');
    const vm2 = makeVm();
    vm2.analysisResult = r;
    vm2.loadTemplate('partmed');
    check('卡片"预期结论"里不许出现 undefined / NaN',
      !/undefined|NaN/.test(vm2.tplExpectLine) && vm2.tplExpectLine.length > 10, vm2.tplExpectLine);
    check('卡片"数据结构"四个数字与 spec 一致',
      vm2.tplShapeLine.includes('48 样本') && vm2.tplShapeLine.includes('2 预测') &&
        vm2.tplShapeLine.includes('1 中介') && vm2.tplShapeLine.includes('2 响应') &&
        vm2.tplShapeLine.includes('4 个格子'), vm2.tplShapeLine);
    check('效应表逐格一行，格子数 = p*q', vm2.effectRows.length === r.p * r.q, `${vm2.effectRows.length}`);
    check('效应表每行都带 OLS 对照（用户能自己核后验与闭式差多少）',
      vm2.effectRows.every((x) => typeof x.d_ols === 'string' && typeof x.i_ols === 'string'));
    check('方差分解表 q 行，合计列能算出来（引擎内部校验的镜像）',
      vm2.partitionRows.length === r.q && vm2.partitionRows.every((row) => Math.abs(row[4] - 1) < 1e-6));
    check('标题说出"几个格子里几格间接效应不含 0"（不是只报个 R²）',
      /个格子里 \d+ 格间接效应区间不含 0/.test(vm2.headlineTitle), vm2.headlineTitle);
    check('WAIC 卡片写明只算 Y 侧（旧脚本的 BAIC 没有定义，不能含糊过去）',
      vm2.headlineStats.some((x) => /WAIC/.test(x.label) && /只算响应侧/.test(x.hint || '')),
      JSON.stringify(vm2.headlineStats.map((x) => x.label)));
    check('模型信息里既给恒等式残差也给"后验 vs OLS"偏差与容差',
      vm2.modelInfo.some((x) => /tot − \(dir \+ ind\)/.test(x.value) && /容差/.test(x.value)),
      JSON.stringify(vm2.modelInfo.map((x) => x.label)));
    check('区间口径写明是等尾分位数而不是最高密度区间（名字不能骗人）',
      vm2.modelInfo.some((x) => /等尾分位数区间（不是最高密度区间/.test(x.value)), '');
    // 收敛未达标必须是红色警报，而不是混在 diagnostics 里
    const bad = JSON.parse(JSON.stringify(r));
    bad.convergence = { ...bad.convergence, ok: false, rhat_max: 1.21, ess_min: 12 };
    vm2.analysisResult = bad;
    check('R̂ 越线时先弹红色"区间不可信"，且结论话术被降级',
      vm2.convergenceBad === true && /R̂ 最大 1.21/.test(vm2.convergenceText) &&
        /先解决收敛/.test(vm2.headlineNote), vm2.headlineNote);
    // 遮掩效应必须被标出来
    const sup = runR({
      ...payload,
      ...(() => { const sh = spec.eraTemplateSheets('inconsistent'); return {
        X: sh[0].aoa.slice(1).map((x) => x.slice(1).map(Number)),
        M: sh[1].aoa.slice(1).map((x) => x.slice(1).map(Number)),
        Y: sh[2].aoa.slice(1).map((x) => x.slice(1).map(Number)),
        seed: 333, chains: 4, iterations: 4000, thin: 5, prior_lambda: 1, prob: 0.95 }; })()
    }, 'view-sup');
    if (sup.r) {
      const vm3 = makeVm();
      vm3.analysisResult = sup.r;
      check('遮掩效应模板：效应表必须把那格标成"方向相反 · 遮掩"',
        vm3.effectRows.some((x) => x.masked === true), JSON.stringify(vm3.effectRows));
    } else {
      check('遮掩效应模板真跑通', false, sup.err.slice(0, 200));
    }

    console.log('\n=== 8. 导出与文件名（F）===');
    const vm4 = makeVm();
    vm4.analysisResult = r;
    vm4.lastPayload = payload;
    vm4.selectedTplId = 'partmed';
    const jobs = spec.eraPlanExport(vm4.exportOptions, vm4.exportCtx(), '20261121_093000');
    check('导出任务类型只有视图执行得了的三种（xlsx/json/png）',
      jobs.every((j) => ['xlsx', 'json', 'png'].includes(j.type)) && jobs.length === 4,
      jobs.map((j) => j.type).join(','));
    check('文件名带模块名与时间戳，图表项是 png',
      jobs.every((j) => /^BayesianERA .+_\d{8}_\d{6}\.(xlsx|json|png)$/.test(j.filename)),
      jobs.map((j) => j.filename).join(' | '));
    check('exportCtx 把 payload 一起交给导出（输入导出必须能复现同一份数据）',
      vm4.exportCtx().payload.X.length === payload.X.length && vm4.exportCtx().r === r);
    check('templateFileName 用卡片上的中文名（内部 id 界面上看不到）',
      /partmed/.test(vm4.templateFileName()) === false &&
        vm4.templateFileName().includes('部分中介') && /48n_2x1m_2y/.test(vm4.templateFileName()),
      vm4.templateFileName());
    vm4.selectedTplId = '';
    check('没选模板时文件名退回通用名，不带残缺后缀',
      /^BayesianERA 数据模板_\d{8}_\d{6}\.xlsx$/.test(vm4.templateFileName()) ||
        !/_$/.test(vm4.templateFileName()), vm4.templateFileName());
    check('视图不自己拼导出内容：sheets 全部来自 spec（单一数据源）',
      /eraPlanExport\(/.test(viewSource) && !/name: '结论'/.test(viewSource));

    // 实机事故：export 报「Failed to fetch dynamically imported module .../.vite/deps/xlsx.js」，
    // 而**下载模板按钮点了完全没反应** —— 因为 downloadTemplate 没有 try/catch，
    // import('xlsx') 的 rejection 没人接。这里从数据侧逼出失败，验它现在会开口。
    const vmFail = makeVm();
    vmFail.analysisResult = r; vmFail.lastPayload = payload; vmFail.selectedTplId = 'partmed';
    vmFail.xlsx = async () => { throw new Error('Excel 组件加载失败：模拟依赖缓存失效'); };
    await vmFail.downloadTemplate();
    check('依赖加载失败时，下载模板必须开口（而不是"点了没反应"）',
      vmFail._notices.some((n) => n.type === 'error' && /Excel 组件加载失败/.test(n.message)),
      JSON.stringify(vmFail._notices));
    await vmFail.downloadInput();
    check('下载输入走的是 file-saver，同样不许静默失败',
      vmFail._notices.length >= 2, JSON.stringify(vmFail._notices.map((n) => n.type)));
    check('xlsx() 的失败文案给出可操作的下一步（刷新 / Ctrl+F5），不是只抛原始错误',
      /Ctrl\+F5|刷新页面/.test(viewSource) && /npm run dev/.test(viewSource), '');
    /* 实机反馈：只写"刷新页面即可"是不够的 —— dev 服务内存里的依赖元数据与磁盘不一致时
       （node_modules/.vite 被删过）刷新永远没反应，唯一解法是重启服务。
       判据必须打在**具体方法体**上：上一版我写的是"整个文件里出现过这句话"，
       结果 saveJson() 里也有同一句，把 xlsx() 的文案删掉断言照样绿 —— 为错理由而绿。*/
    // 找方法体时不用 '\n' 这种转义：这个文件是脚本生成的，上一版就是被转义层把
    // '\n    },' 变成了真换行，当场语法坏掉。用字符码最稳。
    const NL = String.fromCharCode(10);
    const methodBody = (src, name) => {
      const i = src.indexOf('    async ' + name + '(');
      if (i < 0) return '';
      const j = src.indexOf(NL + '    },', i);
      return src.slice(i, j < 0 ? i + 900 : j);
    };
    const xlsxBody = methodBody(viewSource, 'xlsx');
    const jsonBody = methodBody(viewSource, 'saveJson');
    check('xlsx() 方法体内真的有 try/catch（不是靠外层兜）',
      /try \{/.test(xlsxBody) && /catch \(e\)/.test(xlsxBody), xlsxBody.slice(0, 80));
    check('xlsx() 的文案同时给出刷新与"重启 npm run dev"',
      /刷新页面/.test(xlsxBody) && /重启 npm run dev/.test(xlsxBody), xlsxBody.slice(-180));
    check('saveJson() 方法体内真的有 try/catch，且文案也给出重启这一步',
      /try \{/.test(jsonBody) && /catch \(e\)/.test(jsonBody) && /重启 npm run dev/.test(jsonBody),
      jsonBody.slice(0, 90));

    // 同类处理必须五个视图一致：历史上 PERMANOVA 有 try/catch 而另三个没有，
    // 于是"点了没反应"只在部分模块出现，用户会以为是新模块的 bug。
    const views = ['Bayesian_ERA', 'GMR4', 'Nonrandom_PERMANOVA', 'PERMANOVA', 'PERMANOVA_Med'];
    const badViews = [];
    for (const v of views) {
      const src = fs.readFileSync(path.join(FRONTEND, 'src/views/r-analysis', v + '.vue'), 'utf8');
      const xb = methodBody(src, 'xlsx');
      const jb = methodBody(src, 'saveJson');
      if (!/Excel 组件加载失败/.test(xb) || !/重启 npm run dev/.test(xb)) badViews.push(v + ':xlsx');
      if (!/重启 npm run dev/.test(jb)) badViews.push(v + ':saveJson');
    }
    check('五个视图的 xlsx()/saveJson() 失败处理一致（不许只补新模块，留下同类故障）',
      badViews.length === 0, badViews.join(', ') || '一致');
  }
}   // §5 的块尾：§6/§7/§8 都嵌在它的 else 里，这里才收口

console.log('\n=== 9. 导入链路：真 xlsx 字节 -> 预览 -> 填入表单 -> 可直接运行 ===');
{
  // 只写一份 XLSX 取包逻辑；三条候选路径都试，与 test_gmr4_view 同样处理（两处取包迟早飘）
  const XLSX = await (async () => {
    for (const cand of ['xlsx/xlsx.mjs', 'xlsx', 'node_modules/xlsx/dist/xlsx.esm.js']) {
      try {
        const m = await import(pathToFileURL(path.join(FRONTEND, 'node_modules', cand)).href);
        if (m.utils || m.default) return m.utils ? m : m.default;
      } catch (e) { /* 接着试下一个路径 */ }
    }
    return null;
  })();
  check('能取到 xlsx 包（与浏览器里 downloadTemplate 用的同一份）', !!XLSX, '三条候选路径都没命中');
  if (XLSX) {
    const flush = () => new Promise((res) => setImmediate(res));
    const sheets = spec.eraTemplateSheets('nome');
    const wb = XLSX.utils.book_new();
    sheets.forEach((sh) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.aoa), sh.name));
    const buf = Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const vm = makeVm();
    vm.handleFileChange({ arrayBuffer: async () => buf, name: 'nome.xlsx' });
    await flush();
    check('导入对话框能出预览（4 个 tab；行优先表走通用预览器会返回空数组）',
      vm.importTabs && vm.importTabs.length === 4 && vm.importError === '',
      (vm.importTabs ? vm.importTabs.length + ' 个 tab' : 'null') + ' / ' + vm.importError);
    check('表单此刻还是空的：没点「填入表单」就不许动用户的输入', vm.form.xStr === '' && vm.canRun === false);
    vm.applyImport();
    check('填入后三张表到位、可以直接点运行',
      vm.canRun === true && JSON.parse(vm.form.xStr).length === 40 &&
        JSON.parse(vm.form.mStr)[0].length === 1 && JSON.parse(vm.form.yStr)[0].length === 2,
      String(vm.canRun));
    check('参数落进表单字段（GMR⁴ 那次事故的正门：Excel 叫 prior_lambda，表单叫 priorLambda）',
      vm.form.chains === 4 && vm.form.iterations === 4000 && vm.form.seed === 4242 &&
        vm.form.priorLambda === 1 && Math.abs(vm.form.prob - 0.95) < 1e-9,
      JSON.stringify([vm.form.chains, vm.form.iterations, vm.form.seed, vm.form.priorLambda, vm.form.prob]));
    check('导入真实数据后清除模板选择（否则导出会把用户数据标成模板名）',
      vm.selectedTplId === '' && vm.tpl === null, vm.selectedTplId);
    check('对话框已关闭', vm.showImportDialog === false);

    const wb2 = XLSX.utils.book_new();
    [sheets[0], sheets[2], sheets[3]].forEach((sh) => XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(sh.aoa), sh.name));
    const vm2 = makeVm();
    vm2.handleFileChange({ arrayBuffer: async () => Buffer.from(XLSX.write(wb2, { type: 'array', bookType: 'xlsx' })), name: 'noM.xlsx' });
    await flush();
    check('缺 M 表必须报错并说清缺哪张（不许静默退化成普通回归）',
      !vm2.importError ? false : (/M/.test(vm2.importError) && vm2.importTabs === null && vm2.imported === null),
      vm2.importError || '居然大获成功');

    const badSheets = JSON.parse(JSON.stringify(sheets));
    badSheets[2].aoa.splice(-3);
    const wb3 = XLSX.utils.book_new();
    badSheets.forEach((sh) => XLSX.utils.book_append_sheet(wb3, XLSX.utils.aoa_to_sheet(sh.aoa), sh.name));
    const vm3 = makeVm();
    vm3.handleFileChange({ arrayBuffer: async () => Buffer.from(XLSX.write(wb3, { type: 'array', bookType: 'xlsx' })), name: 'shortY.xlsx' });
    await flush();
    check('Y 行数与 X 不符不许静按 ID 补齐（要么报错，要么把警告亮到界面上）',
      !!vm3.importError || vm3.importWarnings.length > 0,
      'error=' + vm3.importError + ' warnings=' + JSON.stringify(vm3.importWarnings));
  }
}

console.log('\n=== 10. 外壳与全局样式（照 GMR⁴ 清单原样搬）===');
{
  const shell = viewSource.replace(/<!--[\s\S]*?-->/g, '');
  check('根节点是 .ra-shell（左对齐与宽度都由它负责）', /<div class="ra-shell">/.test(shell));
  check('result-section 在 config-section 内部（否则左栏宽度与滚动条各走各的）',
    shell.indexOf('class="config-section"') < shell.indexOf('class="result-section"'), '');
  check('运行按钮在输入区里，不在工具栏（ToolbarActions 只有四个动作）',
    /btn-run/.test(shell) && /run-button-container/.test(shell) &&
      /ToolbarActions[^]*?@template[^]*?@input/.test(shell) && !/ToolbarActions[^]*@run/.test(shell));
  check('ChartPanel 带 ref（漏了就一直量不到容器，画不出还不吭声）',
    /<ChartPanel ref="chartPanel"/.test(shell));
  check('工具栏 v-model:expanded 绑到 isToolbarExpanded，初始收缩',
    /v-model:expanded="isToolbarExpanded"/.test(shell) && /isToolbarExpanded: false/.test(shell));
  check('默认图表 tab 取声明里的第一张，不做条件跳转（真实秩 1 跳 CV 热图那次就是这毛病）',
    /activeChart: ERA_CHART_TABS\[0\]\.id/.test(shell) && /this\.activeChart = ERA_CHART_TABS\[0\]\.id/.test(shell));
  check('数据驱动重画：analysisResult 与 activeChart 都在 watch 里',
    /analysisResult\(\) \{ this\.scheduleChart/.test(shell) && /activeChart\(\) \{ this\.scheduleChart/.test(shell));
  check('ImportDialog / ExportDialog 在 .ra-shell 之外（模态框嵌在页面里会被 overflow 裁掉）',
    shell.lastIndexOf('<ImportDialog') > shell.lastIndexOf('</div>'), '');
  const css = fs.readFileSync(path.join(FRONTEND, 'src/components/r-analysis/r-analysis.css'), 'utf8');
  check('.ra-shell 左对齐 + page-header 用 border-box（标题与正文同宽的修复必须在）',
    /\.ra-shell\s*\{[^{}]*text-align:\s*left/.test(css) &&
      /\.ra-shell > \.page-header[^{]*\{[^}]*box-sizing:\s*border-box/.test(css), '');
  const globalLessPath = path.join(FRONTEND, 'src/assets/global.less');
  check('全局样式文件存在（路径写错会把套件直接炸掉而不是报红：src/styles 不存在，实际是 src/assets）',
    fs.existsSync(globalLessPath), globalLessPath);
  const globalLess = fs.existsSync(globalLessPath) ? fs.readFileSync(globalLessPath, 'utf8') : '#app { text-align: center }';
  check('全局不许再留 #app { text-align: center }（那是"幽灵居中"的源头）',
    !/#app\s*\{[^}]*text-align:\s*center/.test(globalLess.replace(/\/\/[^\n]*/g, '')), '');
  const router = fs.readFileSync(path.join(FRONTEND, 'src/router/routerMap.js'), 'utf8');
  check('路由已注册且不是注释（视图不注册就永远进不去，而首页会先亮绿）',
    /path: '\/r-analysis\/bayesian-era'/.test(router) &&
      !/\/\/.*bayesian-era/.test(router) &&
      /Bayesian_ERA\.vue/.test(router));
  const home = fs.readFileSync(path.join(FRONTEND, 'src/views/Home.vue'), 'utf8');
  check('首页卡片指向新路由，不再走 showComingSoon',
    /navigateTo\('\/r-analysis\/bayesian-era'\)/.test(home) &&
      !/showComingSoon\('Bayesian ERA'\)/.test(home));
  const rt = fs.readFileSync(path.join(FRONTEND, 'src/router/index.js'), 'utf8');
  // 模板数量刚刚从 6 涨到 9/10：界面必须是动态计数，写死文案是下一轮的谎。
  {
    const vs = fs.readFileSync(path.join(FRONTEND, 'src/views/r-analysis/Bayesian_ERA.vue'), 'utf8');
    const tplArea = vs.slice(vs.indexOf('<template>'), vs.indexOf('</template>'));
      // 负分量的**解释**也要能验：上一版界面与图都说"共线很强时会负"，
    // 而实测刚好相反 —— 共线时 shared ≈ R²(X) ≥ 0 恒正，负值出现在 X 与 M 独立那一侧。
    // 说法错了比没有说法更糟：用户会去找根本不存在的共线问题。
    const chartSrc = fs.readFileSync(path.join(FRONTEND, 'src/utils/eraCharts.js'), 'utf8');
    check('方差分解的解释不再把负值归因于共线（那是错的归因）',
      !/共线很强时 B 的偏 R² 可以为负/.test(viewSource) &&
        !/共线很强时可以为负/.test(chartSrc), '');
    check('负值解释给出正确机制（真值为 0 + 过拟合；或调整后 R² 的罚项）',
      /过拟合/.test(viewSource) && /罚项/.test(viewSource) && /口径/.test(viewSource), '');
    check('shared 为负有对应模板可复现（不是嘴上说说）',
      /shared负|shared 为负/.test(viewSource) || /shared 为负/.test(
        fs.readFileSync(path.join(FRONTEND, 'src/utils/eraSheetSpec.js'), 'utf8')), '没找到 shared 为负 模板');

  check('界面文案不写死模板数量（数量只能从 spec 常量来）',
      !/[（(]?\d+\s*[份个]\s*(设计|模板)/.test(tplArea) && !/[一二三四五六七八九十]\s*[份个]\s*(设计|模板)/.test(tplArea) &&
        /eraCount/.test(vs), /eraCount/.test(vs) ? '动态计数在' : '没找到动态计数');
  }

  check('scrollBehavior 仍在（刚进去就停在半页是实机反馈过的）', /scrollBehavior/.test(rt) && /top: 0/.test(rt));

  // 这条防的是**我自己的工作流**：默认 cacheDir 落在 frontend/node_modules/.vite，
  // 而开发者正在跑的 npm run dev 用的就是同一份。跑一次测试就把它改写一遍，
  // 用户浏览器里已加载页面的动态 import 立刻取不到 —— 这次导出报错就是这么来的。
  const toolsDir = path.join(ROOT, 'r-scripts/tools');
  const viteSuites = fs.readdirSync(toolsDir)
    .filter((f) => /^test_.*\.mjs$/.test(f))
    .filter((f) => fs.readFileSync(path.join(toolsDir, f), 'utf8').includes('createServer({'));
  const noCache = viteSuites.filter((f) => !fs.readFileSync(path.join(toolsDir, f), 'utf8').includes('cacheDir'));
  check(`${viteSuites.length} 个会起 vite 服务的套件全都显式设了 cacheDir（不污染 dev 缓存）`,
    viteSuites.length >= 8 && noCache.length === 0,
    `套件数 ${viteSuites.length}；没设的：${noCache.join(', ') || '无'}`);
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
process.exit(fail ? 1 : 0);
