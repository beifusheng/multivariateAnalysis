#!/usr/bin/env node
/**
 * Nonrandom_PERMANOVA.vue 的视图逻辑测试
 * ---------------------------------------------------------------
 * npm run build 只能证明「模板能编译」，证明不了：
 *   - canRun 该拦的时候有没有拦住（用户点半截数据会看到什么）
 *   - buildPayload 送出去的字段 R 认不认
 *   - 真结果喂进来后，「假阳性被纠正」的提示会不会出现
 * 这里用 Vite 的 SSR 管线把 .vue 加载进来，直接跑它的 computed/methods，
 * analysisResult 用的是**真跑 R** 得到的 JSON，不是手搓的 mock。
 *
 *   node r-scripts/tools/test_nr_view.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.join(ROOT, 'frontend');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable/bin/Rscript.exe');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nrview-'));

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (detail ? ` —— ${detail}` : '')); console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
};

const { nonrandomTemplates: nrt } = await loadFrontendUtils(['nonrandomTemplates']);

// ---- 真跑 R 拿两份结果：受限置换纠正假阳性的、纯自由置换的 ----
const runR = (id) => {
  const built = nrt.buildNonrandomTemplateData(nrt.NR_TEMPLATE_MAP[id].spec);
  const f = path.join(TMP, `${id}.json`);
  fs.writeFileSync(f, JSON.stringify(built.payload));
  execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/nonrandom_permanova.R'), f, f + '.out', f + '.err'],
    { stdio: 'pipe', timeout: 180000 });
  return { built, json: JSON.parse(fs.readFileSync(f + '.out', 'utf8')) };
};
console.log('准备真实 R 结果（confoundedBlock / freeOnly）...');
const conf = runR('confoundedBlock');
const free = runR('freeOnly');

// vite 装在 frontend 下，本脚本在 r-scripts/tools 里 —— 裸 'vite' 解析不到，按绝对路径加载
const { createServer } = await import(pathToFileURL(
  path.join(FRONTEND, 'node_modules/vite/dist/node/index.js')).href);

// ---- 用 Vite 把 .vue 加载进来（别名 @ 与 element-plus 都按项目配置解析）----
const server = await createServer({
  root: FRONTEND,
  configFile: path.join(FRONTEND, 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error'
});

let comp;
try {
  const mod = await server.ssrLoadModule('/src/views/r-analysis/Nonrandom_PERMANOVA.vue');
  comp = mod.default;
  check('视图 SFC 能被加载', !!comp && typeof comp.computed === 'object');
} catch (e) {
  check('视图 SFC 能被加载', false, e.message);
  await server.close();
  process.exit(1);
}

/** 造一个能跑 computed/methods 的最小 vm（Options API 的 this 就是这个形状） */
const makeVm = (overrides = {}) => {
  const vm = { ...comp.data(), $refs: {}, $nextTick: (f) => f && f(), ...overrides };
  for (const [k, fn] of Object.entries(comp.computed)) {
    Object.defineProperty(vm, k, { get: () => fn.call(vm), configurable: true });
  }
  for (const [k, fn] of Object.entries(comp.methods)) vm[k] = fn.bind(vm);
  // 测试替身必须最后装：测试里没有 document，把提示口径换成收集，
  // 否则上面那行会把视图里真正的 notify 盖回来，ElMessage 一调就炸
  vm.notices = [];
  vm.notify = (type, msg) => { vm.notices.push([type, typeof msg === 'string' ? msg : (msg && msg.message) || '']); };
  return vm;
};

console.log('\n=== 输入校验 ===');
{
  const vm = makeVm();
  check('空表单不能运行', vm.canRun === false);
  check('空表单提示指向物种矩阵', /物种矩阵/.test(vm.runHint), vm.runHint);

  const p = conf.built.payload;
  const filled = makeVm();
  filled.form.communityStr = JSON.stringify(p.communityData);
  filled.form.sampleStr = JSON.stringify(p.sampleData);
  filled.form.scheme = 'stratified';
  filled.form.strata = 'strata';
  filled.form.formula = 'group';
  check('填好两类数据即可运行', filled.canRun === true, filled.runHint);
  // 校验状态已合并为单一来源 computed.checks（原先另有 this.v，程序填表时显示会滞后）
  check('checks 与 canRun 结论一致', Object.values(filled.checks).every((x) => x.ok) === true);
  check('样本表列被识别', filled.checks.sample.columns.includes('group') && filled.checks.sample.columns.includes('strata'));

  const badFormula = makeVm();
  badFormula.form.communityStr = filled.form.communityStr;
  badFormula.form.sampleStr = filled.form.sampleStr;
  badFormula.form.scheme = 'stratified';
  badFormula.form.strata = 'strata';
  badFormula.form.formula = 'group + 不存在的列';
  check('公式引用不存在的列 -> 拦截', badFormula.canRun === false);
  check('提示里点名是哪个列', /不存在的列/.test(badFormula.runHint), badFormula.runHint);

  const noStrata = makeVm();
  noStrata.form.communityStr = filled.form.communityStr;
  noStrata.form.sampleStr = filled.form.sampleStr;
  noStrata.form.scheme = 'stratified';
  noStrata.form.strata = '';
  check('stratified 未选分层变量 -> 拦截', noStrata.canRun === false && /分层变量/.test(noStrata.runHint), noStrata.runHint);

  const sp = nrt.buildNonrandomTemplateData(nrt.NR_TEMPLATE_MAP.spatialField.spec);
  const spatialNoCoords = makeVm();
  spatialNoCoords.form.communityStr = JSON.stringify(sp.payload.communityData);
  spatialNoCoords.form.sampleStr = JSON.stringify(sp.payload.sampleData);
  spatialNoCoords.form.scheme = 'spatial';
  spatialNoCoords.form.strata = 'strata';
  check('spatial 缺坐标 -> 拦截', spatialNoCoords.canRun === false, spatialNoCoords.runHint);
  check('spatial 缺坐标提示可执行（不是 JSON 报错）', /需要每个样本/.test(spatialNoCoords.runHint), spatialNoCoords.runHint);
  spatialNoCoords.form.coordinatesStr = JSON.stringify(sp.payload.coordinates);
  check('补上坐标 -> 放行', spatialNoCoords.canRun === true, spatialNoCoords.runHint);

  // 坐标列数不对（3 列）也要拦住
  spatialNoCoords.form.coordinatesStr = JSON.stringify(sp.payload.coordinates.map((c) => [...c, 0]));
  check('坐标不是 2 列 -> 拦截', spatialNoCoords.canRun === false && /2 列/.test(spatialNoCoords.runHint), spatialNoCoords.runHint);

  // 样本表行数与物种矩阵不一致
  const mismatch = makeVm();
  mismatch.form.communityStr = JSON.stringify(p.communityData);
  mismatch.form.sampleStr = JSON.stringify(p.sampleData.slice(0, 5));
  mismatch.form.scheme = 'stratified';
  mismatch.form.strata = 'strata';
  check('样本表行数不符 -> 拦截', mismatch.canRun === false && /样本数不一致/.test(mismatch.runHint), mismatch.runHint);
}

console.log('\n=== buildPayload 与 R 的契约 ===');
{
  const p = conf.built.payload;
  const vm = makeVm();
  vm.selectedNrId = 'confoundedBlock';
  vm.form.communityStr = JSON.stringify(p.communityData);
  vm.form.sampleStr = JSON.stringify(p.sampleData);
  vm.form.scheme = 'stratified';
  vm.form.strata = 'strata';
  vm.form.formula = 'group';
  vm.form.distance = 'bray';
  vm.form.permutations = 999;
  vm.form.seed = 12345;
  const out = vm.buildPayload();
  check('communityData 是行数组且尺寸一致', Array.isArray(out.communityData) && out.communityData.length === p.communityData.length && out.communityData[0].length === p.communityData[0].length);
  check('sampleData 是行对象数组', Array.isArray(out.sampleData) && typeof out.sampleData[0] === 'object' && !Array.isArray(out.sampleData[0]));
  check('formula/scheme/strata 透传', out.formula === 'group' && out.scheme === 'stratified' && out.strata === 'strata');
  check('permutations/seed 透传', out.permutations === 999 && out.seed === 12345);
  check('非 spatial 时不带 coordinates', out.coordinates === undefined);
  check('选中模板时带 note（导出可追溯）', typeof out.note === 'string' && out.note.includes('confounded') === false ? true : !!out.note);
  // 把视图组好的 payload 真喂给 R，跑通才算契约成立
  const f = path.join(TMP, 'fromview.json');
  fs.writeFileSync(f, JSON.stringify(out));
  try {
    execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/nonrandom_permanova.R'), f, f + '.out', f + '.err'], { stdio: 'pipe', timeout: 180000 });
    const j = JSON.parse(fs.readFileSync(f + '.out', 'utf8'));
    check('视图 payload 直接跑 R 成功', j.success === true);
    check('R 结果与模板结果一致（同一份数据同一个 p）',
      j.observed.p_constrained === conf.json.observed.p_constrained,
      `${j.observed.p_constrained} vs ${conf.json.observed.p_constrained}`);
  } catch (e) {
    const err = fs.existsSync(f + '.err') ? fs.readFileSync(f + '.err', 'utf8') : e.message;
    check('视图 payload 直接跑 R 成功', false, err.slice(0, 160));
  }
}

console.log('\n=== 结果渲染逻辑（真 R 输出）===');
{
  const vm = makeVm({ analysisResult: conf.json });
  check('主 p 取受限置换', vm.primaryP === conf.json.observed.p_constrained);
  check('识别为假阳性被纠正', vm.falsePositiveSignal === true,
    `p_free=${vm.result.p_free}, p_con=${vm.result.p_constrained}`);
  check('结论稳健提示不出现', vm.robustSignal === false);
  check('非自由置换', vm.isFreeOnly === false);
  check('主标题按不显著着色', vm.constrainedSig === false);
  check('逐术语表长度正确', vm.result.table.length === conf.json.anova_table.length);
  const stats = vm.headlineStats;
  check('对比卡 4 项', stats.length === 4);
  check('对比卡写明"是（假阳性被纠正）"', stats[3].value.includes('假阳性'), stats[3].value);
  check('F 已格式化', /^\d+\.\d{4}$/.test(stats[0].value), stats[0].value);
  const model = vm.modelInfo.map((x) => x.value).join('|');
  check('模型信息含距离与校正方式', /Bray|bray/i.test(model) && /否/.test(model), model.slice(0, 120));
  const perm = vm.permutationInfo.map((x) => x.value).join('|');
  check('置换信息含区组数与种子', /3/.test(perm) && perm.includes(String(conf.json.permutation.seed)), perm.slice(0, 140));
  check('图表数据可用', !!vm.chartData && vm.chartData.null.values.length > 100);

  const vm2 = makeVm({ analysisResult: free.json });
  check('freeOnly: 主 p 取自由置换', vm2.isFreeOnly === true && vm2.primaryP === free.json.observed.p_free);
  check('freeOnly: 不误报假阳性', vm2.falsePositiveSignal === false && vm2.robustSignal === false);
  check('freeOnly: 结论稳健标签不出现', vm2.robustSignal === false);

  const vm3 = makeVm({ analysisResult: runR('balancedBlock').json });
  check('balancedBlock: 判为结论稳健', vm3.robustSignal === true && vm3.falsePositiveSignal === false,
    `p_free=${vm3.result.p_free}, p_con=${vm3.result.p_constrained}`);
}

console.log('\n=== 无结果时的空态 ===');
{
  const vm = makeVm();
  check('无结果时 result 不炸', vm.result.F === undefined && vm.result.table.length === 0);
  check('无结果时 chartData 为 null', vm.chartData === null);
  check('无结果时不显示结论翻转提示', vm.falsePositiveSignal === false && vm.robustSignal === false);
  check('模板列表 6 组 / 26 条', vm.nrGroups.length === 6 && Object.keys(nrt.NR_TEMPLATE_MAP).length === 26);
  const names = vm.nrGroups.flatMap((g) => g.items.map((i) => i.id));
  check('分组里的 id 与 MAP 一致', names.length === vm.nrCount && new Set(names).size === names.length);
}

console.log('\n=== 导入 Excel（下载模板 -> 原样上传 -> 填入表单）===');
{
  const XLSX = await import(pathToFileURL(path.join(FRONTEND, 'node_modules/xlsx/xlsx.mjs')).href);
  const sheetIo = await import(pathToFileURL(path.join(FRONTEND, 'src/utils/sheetIo.js')).href);
  const toFile = (sheets, name = 'data.xlsx') => {
    const wb = XLSX.utils.book_new();
    for (const [n, aoa] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
    return new File([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], name);
  };

  // 1) 官方模板原样上传
  const vm = makeVm();
  vm.openImport();
  await vm.handleFileChange(toFile(sheetIo.buildTemplateSheets().filter(([n]) => n !== '填写说明')));
  const tabOf = (name) => (vm.importTabs || []).find((x) => x.name === name);
  check('模板导入无错误', vm.importError === '', vm.importError);
  check('预览第一个 tab 写明 6 样本 × 8 物种', /6 样本 × 8 物种/.test(tabOf('community')?.label || ''),
    JSON.stringify((vm.importTabs || []).map((x) => x.label)));
  check('物种预览行带物种列', Object.keys(tabOf('community').rows[0]).includes('Bacteroides'));
  check('样本预览列包含 group/strata', tabOf('sample').cols.join(',') === '样本,group,strata', tabOf('sample').cols.join(','));
  check('坐标 tab 存在', !!tabOf('coordinate') && tabOf('coordinate').rows.length === 6);
  check('导入阶段不动表单（先看再填）', vm.form.communityStr === '');

  vm.form.formula = 'group';
  vm.form.scheme = 'stratified';
  vm.form.strata = 'strata';
  vm.applyImport();
  const comm = JSON.parse(vm.form.communityStr);
  const samp = JSON.parse(vm.form.sampleStr);
  check('填入后物种矩阵是 6×8 数值', comm.length === 6 && comm[0].length === 8 && comm[0][0] === 42);
  check('填入后样本信息是行对象数组', samp.length === 6 && samp[0].group === 'Case' && samp[5].group === 'Control');
  check('坐标也一并填入', JSON.parse(vm.form.coordinatesStr).length === 6);
  check('导入后能运行', vm.canRun === true, vm.runHint);
  check('导入成功的提示里写了形状', vm.notices.some(([t, m]) => t === 'success' && /6 样本 × 8 物种/.test(m)),
    JSON.stringify(vm.notices));
  check('导入真实数据后模板选择被清掉', vm.selectedTemplate === null && vm.selectedNrId === '');

  // 2) 缺表 / 错表
  const vm2 = makeVm();
  await vm2.handleFileChange(toFile([['物种矩阵', [['样本', 'sp1'], ['S1', 1], ['S2', 2]]]]));
  check('只有物种矩阵 -> 提示缺样本信息表', /样本信息/.test(vm2.importError), vm2.importError);
  const vm3 = makeVm();
  await vm3.handleFileChange(toFile([['样本信息', [['样本', 'group'], ['S1', 'A'], ['S2', 'B']]]]));
  check('只有样本信息 -> 提示缺物种矩阵表', /物种矩阵/.test(vm3.importError), vm3.importError);

  // 3) 两表对不上：必须按 ID 对齐，不能按行号默默填
  const vm4 = makeVm();
  await vm4.handleFileChange(toFile([
    ['物种矩阵', [['样本', 'sp1'], ['S1', 1], ['S2', 2], ['S9', 3]]],
    ['样本信息', [['样本', 'group'], ['S1', 'A'], ['S2', 'B']]]
  ]));
  check('物种矩阵多出的样本 -> 拒绝并指名', /S9/.test(vm4.importError), vm4.importError);

  const vm5 = makeVm();
  await vm5.handleFileChange(toFile([
    ['物种矩阵', [['样本', 'sp1'], ['B', 1], ['A', 2]]],
    ['样本信息', [['样本', 'group'], ['A', '甲'], ['B', '乙']]]
  ]));
  vm5.form.formula = 'group';
  vm5.applyImport();
  const s5 = JSON.parse(vm5.form.sampleStr);
  check('样本顺序不一致时按 ID 重排（而不是按行号）', s5[0].group === '乙' && s5[1].group === '甲',
    s5.map((r) => r.group).join(','));

  // 4) 该提醒的隐患
  const vm6 = makeVm();
  await vm6.handleFileChange(toFile([
    ['物种矩阵', [['样本', 'sp1', 'sp2'], ['S1', 0, 0], ['S2', 1, 2], ['S3', 3, 4]]],
    ['样本信息', [['样本', 'group', 'pH'], ['S1', 'A', 6.5], ['S2', 'B', 7.1], ['S3', 'A', 6.8]]]
  ]));
  check('全 0 样本会被提醒', vm6.importWarnings.some((w) => /全为 0/.test(w)), vm6.importWarnings.join(' | '));
  check('数值型分组列会被提醒分箱', vm6.importWarnings.some((w) => /pH/.test(w) && /分箱/.test(w)), vm6.importWarnings.join(' | '));

  const vm7 = makeVm();
  vm7.form.scheme = 'spatial';
  await vm7.handleFileChange(toFile([
    ['物种矩阵', [['样本', 'sp1'], ['S1', 1], ['S2', 2]]],
    ['样本信息', [['样本', 'group'], ['S1', 'A'], ['S2', 'B']]]
  ]));
  check('选了空间方案但文件里没坐标 -> 提醒而不是静默', vm7.importWarnings.some((w) => /没有坐标表/.test(w)),
    vm7.importWarnings.join(' | '));

  // 5) 坐标表自己也要按 ID 对齐
  const vm8 = makeVm();
  await vm8.handleFileChange(toFile([
    ['物种矩阵', [['样本', 'sp1'], ['S1', 1], ['S2', 2]]],
    ['样本信息', [['样本', 'group'], ['S1', 'A'], ['S2', 'B']]],
    ['坐标', [['样本', 'x', 'y'], ['S2', 9, 9], ['S1', 0, 0]]]
  ]));
  vm8.applyImport();
  const co = JSON.parse(vm8.form.coordinatesStr);
  check('坐标按物种矩阵顺序重排（S1 在前）', co[0][0] === 0 && co[1][0] === 9, JSON.stringify(co));

  // 6) 坏文件不能把界面弄挂
  const vm9 = makeVm();
  await vm9.handleFileChange(new File([new Blob(['不是 xlsx'])], 'bad.xlsx'));
  check('坏文件 -> 有错误文案且无预览', !!vm9.importError && vm9.importTabs === null, vm9.importError);

  // 7) 导出任务表由 spec 算出，视图只执行（内容断言在 test_nr_spec.mjs）
  const ex = makeVm();
  ex.analysisResult = conf.json;
  ex.form.communityStr = JSON.stringify(conf.built.payload.communityData);
  ex.form.sampleStr = JSON.stringify(conf.built.payload.sampleData);
  const ctxEx = ex.exportCtx('结论对比');
  check('exportCtx 把真实结果递给 spec', ctxEx.analysisResult === conf.json && ctxEx.cd === conf.json.chart_data);
  check('没选模板时数据说明写“用户输入数据”', ctxEx.templateLabel === '用户输入数据', ctxEx.templateLabel);
  check('verdict 来自 falsePositiveSignal/robustSignal（不自己重算）',
    typeof ctxEx.verdict === 'string' && ['', '是（自由置换假阳性）', '否（结论稳健）'].includes(ctxEx.verdict),
    ctxEx.verdict);
  const sel = makeVm();
  sel.selectedNrId = 'confoundedBlock';
  sel.analysisResult = conf.json;
  check('选了模板后数据说明会标出模板名', /合成演示数据/.test(sel.exportCtx('图表').templateLabel),
    sel.exportCtx('图表').templateLabel);
}

await server.close();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) {
  console.log('\n失败项:');
  fails.forEach((f) => console.log('  - ' + f));
}
process.exit(fail ? 1 : 0);
