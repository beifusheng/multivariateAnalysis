#!/usr/bin/env node
/**
 * PERMANOVA_Med.vue 视图逻辑回归（S3 的安全网）
 * ---------------------------------------------------------------
 * 中介分析里最贵的错误不是报错，是 Y 与 M 的行序悄悄不一致：模型照跑、图照画、
 * 系数全废。所以这份 harness 的核心就一条：导入以后四个 Str 的样本键序必须一致。
 * 标 [新] 的是 (B) 语义，重构前应当红。
 *   node r-scripts/tools/test_med_view.mjs
 */
import fs from 'fs';
import os from 'node:os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND = path.join(ROOT, 'frontend');
const VIEW = path.join(FRONTEND, 'src/views/r-analysis/PERMANOVA_Med.vue');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'medview-'));

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (detail ? ` —— ${detail}` : '')); console.log('  ✗ ' + name + (detail ? `\n      ${detail}` : '')); }
};

const Y = [['样本 ID', 'Y1', 'Y2'], ['S1', 1.2, 3.4], ['S2', 2.3, 4.5], ['S3', 1.8, 3.9], ['S4', 2.7, 4.1]];
const M = [['样本 ID', 'M1', 'M2'], ['S1', 0.5, 1.2], ['S2', 0.7, 1.5], ['S3', 0.6, 1.3], ['S4', 0.9, 1.1]];
const X = [['样本 ID', 'X1'], ['S1', 1], ['S2', 0], ['S3', 1], ['S4', 0]];
const Z = [['样本 ID', 'Age'], ['S1', 25], ['S2', 30], ['S3', 28], ['S4', 33]];
const M_SHUF = [['样本 ID', 'M1', 'M2'], ['S4', 0.9, 1.1], ['S2', 0.7, 1.5], ['S1', 0.5, 1.2], ['S3', 0.6, 1.3]];

const src = fs.readFileSync(VIEW, 'utf8');
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(f) { f.arrayBuffer().then((b) => { this.result = b; this.onload && this.onload({ target: this }); }, () => {}); }
    readAsText(f) { f.text().then((t) => { this.result = t; this.onload && this.onload({ target: this }); }, () => {}); }
  };
}
const tick = () => new Promise((r) => setTimeout(r, 80));

const { createServer } = await import(pathToFileURL(path.join(FRONTEND, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({ root: FRONTEND, configFile: path.join(FRONTEND, 'vite.config.js'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let comp;
try {
  comp = (await server.ssrLoadModule('/src/views/r-analysis/PERMANOVA_Med.vue')).default;
  check('视图 SFC 能被加载', !!comp && typeof comp.methods === 'object');
} catch (e) {
  check('视图 SFC 能被加载', false, e.message); await server.close(); process.exit(1);
}
const makeVm = () => {
  const vm = { ...comp.data(), $refs: {}, $nextTick: (f) => f && f() };
  for (const [k, fn] of Object.entries(comp.computed)) Object.defineProperty(vm, k, { get: () => fn.call(vm), configurable: true });
  for (const [k, fn] of Object.entries(comp.methods)) vm[k] = fn.bind(vm);
  const m = (type) => (o) => vm.notices.push([type, typeof o === 'string' ? o : (o && o.message) || '']);
  vm.notices = [];
  vm.$message = Object.assign(m('info'), { success: m('success'), error: m('error'), warning: m('warning') });
  return vm;
};
const fileFor = async (sheets) => {
  const XLSX = await import(pathToFileURL(path.join(FRONTEND, 'node_modules/xlsx/xlsx.js')).href);
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new File([out instanceof ArrayBuffer ? new Uint8Array(out) : out], 't.xlsx');
};
const driveImport = async (vm, sheets) => {
  const file = await fileFor(sheets);
  const oldStyle = /\.raw|file\.raw/.test(String(comp.methods.handleFileChange));
  await vm.handleFileChange(oldStyle ? { raw: file } : file);
  await tick();
  const applier = vm.applyImport || vm.confirmImport;
  // Med 直接调 ElMessage（要 DOM）。这里测的是状态，不是提示怎么弹：
  // 表单字段在弹提示之前就写好了，所以吞掉这个异常不影响断言。
  try { if (applier) applier.call(vm); } catch (e) { if (!/document/.test(String(e.message))) throw e; }
  return oldStyle ? '旧写法' : '外壳写法';
};
const keysOf = (str) => Object.keys(str ? JSON.parse(str) : {});

console.log('\n=== 1. 死代码与重复定义 ===');
for (const n of ['fillTemplateData', 'validateMediatorData', 'validatePredictorData', 'validateCovariates']) {
  const c = (src.match(new RegExp(`^    ${n}\\(`, 'gm')) || []).length;
  check(`${n} 只定义一处`, c === 1, `${c} 处`);
}

console.log('\n=== 2. 导入：四张表必须按样本 ID 对齐 ===');
{
  const vm = makeVm();
  const how = await driveImport(vm, [['Outcome', Y], ['Mediator', M], ['Predictor', X], ['Covariates', Z]]);
  console.log(`      （入口：${how}）`);
  const p = vm.permanovaMedParams;
  check('四张表都进了表单', ['outcomeDataStr', 'mediatorDataStr', 'predictorDataStr', 'covariatesStr'].every((k) => (p[k] || '').length > 10));
  check('校验状态全绿', p.outcomeDataValid && p.mediatorDataValid && p.predictorDataValid && p.covariatesValid,
    `${p.outcomeDataError} | ${p.mediatorDataError} | ${p.predictorDataError} | ${p.covariatesError}`);
  check('每个样本一行（不是把向量拆成多行）', keysOf(p.outcomeDataStr).length === 4 && keysOf(p.mediatorDataStr).length === 4,
    `${keysOf(p.outcomeDataStr).length}/${keysOf(p.mediatorDataStr).length}`);

  // (B) 的核心：中介表在 Excel 里排过序
  const vm2 = makeVm();
  await driveImport(vm2, [['Outcome', Y], ['Mediator', M_SHUF], ['Predictor', X], ['Covariates', Z]]);
  const y2 = keysOf(vm2.permanovaMedParams.outcomeDataStr);
  const m2 = keysOf(vm2.permanovaMedParams.mediatorDataStr);
  check('[新] M 表被打乱顺序 -> 键序仍与 Y 一致', y2.join(',') === m2.join(','), `Y=${y2.join(',')} M=${m2.join(',')}`);
  const mv = vm2.permanovaMedParams.mediatorDataStr ? JSON.parse(vm2.permanovaMedParams.mediatorDataStr) : {};
  check('[新] 打乱后 S1 的中介值仍是 0.5（配对没错）', String(mv.S1 && mv.S1[0]) === '0.5', JSON.stringify(mv.S1));

  const vm3 = makeVm();
  await driveImport(vm3, [['Outcome', Y], ['Mediator', [['样本 ID', 'M1'], ['S1', 0.5], ['S2', 0.7], ['S3', 0.6]]], ['Predictor', X]]);
  check('[新] M 少一个样本 -> 拒绝并指名 S4', /S4/.test(vm3.importError || ''), vm3.importError || '(没报错)');

  const vm4 = makeVm();
  await driveImport(vm4, [['Mediator', M], ['Predictor', X]]);
  check('[新] 缺结局 Y 表 -> 指名缺哪张（旧版是 sheet_to_json(undefined) 的无关错）',
    /结局|Outcome|Y/.test(vm4.importError || ''), vm4.importError || '(没报错)');

  const vm5 = makeVm();
  await driveImport(vm5, [['结局Y', Y], ['中介M', M], ['暴露X', X]]);
  check('[新] 中文表名能认（旧版只认 Outcome/Mediator/Predictor 原名）', vm5.permanovaMedParams.mediatorDataValid === true, vm5.importError);

  const vm6 = makeVm();
  await driveImport(vm6, [['Outcome', Y], ['Mediator', M], ['Predictor', X], ['Covariates', Z]]);
  check('[新] 预览按表分 tab', Array.isArray(vm6.importTabs) && vm6.importTabs.length >= 3,
    JSON.stringify((vm6.importTabs || []).map((x) => x.name)));
}

console.log('\n=== 2b. medWarnings（纯函数层）===');
{
  const { medSheetSpec: ms } = await loadFrontendUtils(['medSheetSpec']);
  const noZ = ms.medWarnings({ outcome: { columns: ['Y1'], rows: [[1], [2]] }, outcome_aligned: [[1], [2]], mediator: { columns: ['M1'], rows: [[1], [2]] }, mediator_aligned: [[1], [2]], predictor: {} }, ['S1', 'S2']);
  check('没协变量表 -> 明说模型不带协变量（不是静默）', noZ.some((w) => /协变量/.test(w)), noZ.join(' | '));
  const textY = ms.medWarnings({ outcome: { columns: ['Y1'], rows: [['a'], ['b']] }, outcome_aligned: [['a'], ['b']], mediator: { columns: ['M1', 'M2'], rows: [[1, 2], [3, 4]] }, mediator_aligned: [[1, 2], [3, 4]], predictor: {} }, ['S1', 'S2']);
  check('Y 里混进文本 -> 提前报错方向（而不是等 R 骂）', textY.some((w) => /Y1/.test(w) && /数值/.test(w)), textY.join(' | '));
}

console.log('\n=== 3. 导出任务表 ===');
{
  const vm = makeVm();
  check('[新] exportJobs 存在', typeof vm.exportJobs === 'function');
  if (typeof vm.exportJobs === 'function') {
    vm.analysisResult = { covariate_tests: [{ term: 'X1', label: 'X', F_statistic: 3.2, R2: 0.4, p_value: 0.031 }] };
    const jobs = vm.exportJobs(['json', 'globalEffect', 'mediatorEffects', 'chartPNG', 'input']);
    check('[新] 勾 5 项出 5 个任务', jobs.length === 5, jobs.length);
    check('[新] 文件名前缀与旧版逐字一致',
      jobs.map((j) => j.filename.split('_')[0]).join('|') === 'PERMANOVA-med 结果|分组置换检验|路径分解|分析图表|PERMANOVA-med 输入',
      jobs.map((j) => j.filename).join(' , '));
    const cov = jobs[1].sheets[0];
    check('[新] 分组检验表名不变', cov.name === 'Covariate_Tests', cov.name);
    check('[新] p 值是真数（不是空串）', Number(cov.aoa[1][4]) === 0.031, JSON.stringify(cov.aoa[1]));
    check('[新] 没结果时写明原因而不是出空表', String(jobs[2].sheets[0].aoa[1][0]).includes('无路径分解'), JSON.stringify(jobs[2].sheets[0].aoa[1]));
    check('[新] 未知 key 不出空文件', vm.exportJobs(['nope']).length === 0);
  }
}

console.log('\n=== 4. 外壳 props 契约 ===');
{
  const tpl = src.slice(0, src.indexOf('<script>'));
  const state = new Set([...Object.keys(makeVm()), ...Object.keys(comp.computed)]);
  const bound = (tag) => {
    const m = tpl.match(new RegExp(`<${tag}[^>]*>`, 's'));
    return m ? [...m[0].matchAll(/:([a-z-]+)="([A-Za-z0-9_]+)/g)].map((x) => [x[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()), x[2]]) : null;
  };
  for (const [tag, props] of [['ImportDialog', ['sheets', 'tabs', 'error', 'warnings']], ['ExportDialog', ['options', 'selected', 'error']]]) {
    const b = bound(tag);
    check(`${tag} 在模板里`, !!b);
    if (b) for (const p of props) {
      const pair = b.find(([k]) => k === p);
      check(`${tag} :${p} 绑到真实状态`, !!pair && state.has(pair[1]), b.map(([k, v]) => `${k}=${v}`).join(' '));
    }
  }
  check('工具栏四个动作都接上方法', ['template', 'import', 'export', 'input'].every((ev) => tpl.includes(`@${ev}="`)));
  for (const m of ['downloadTemplate', 'openImport', 'openExport', 'downloadInput']) check(`${m} 存在`, typeof makeVm()[m] === 'function', m);
  check('不再用 Sheets[\'Outcome\'] 精确取表', !/Sheets\['Outcome'\]/.test(src));
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
fs.writeFileSync(path.join(TMP, 'noop'), '');
await server.close();
process.exit(fails.length ? 1 : 0);
