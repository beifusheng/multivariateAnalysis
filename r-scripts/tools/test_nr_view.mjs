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

await server.close();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) {
  console.log('\n失败项:');
  fails.forEach((f) => console.log('  - ' + f));
}
process.exit(fail ? 1 : 0);
