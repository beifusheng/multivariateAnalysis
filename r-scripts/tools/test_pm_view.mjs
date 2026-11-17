#!/usr/bin/env node
/**
 * PERMANOVA.vue 视图逻辑回归（S2 的安全网）
 * ---------------------------------------------------------------
 * 这个模块是在用的，动手之前先把"现在到底是什么行为"钉住：
 *   1. 校验器（注意：源码里 validateDistanceMatrix/validateSampleData 各有两份定义，
 *      对象字面量后者覆盖前者，所以生效的是后面那份）
 *   2. 导入以后表单里躺着的形状（R 认的是列字典 + 第一列样本 ID）
 *   3. 送给 R 的参数（抽成 buildRunParams 之后才能断言）
 *   4. 导出任务表（勾几项出几个文件、叫什么名）
 *   5. 拿导入得到的参数真跑一次 R（端到端，契约错不了）
 * 标 [新] 的断言是 (B) 的语义，重构前就该红；其余应当现在绿。
 *
 *   node r-scripts/tools/test_pm_view.mjs
 */
import fs from 'fs';
import os from 'node:os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND = path.join(ROOT, 'frontend');
const VIEW = path.join(FRONTEND, 'src/views/r-analysis/PERMANOVA.vue');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable/bin/Rscript.exe');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pmview-'));

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (detail ? ` —— ${detail}` : '')); console.log('  ✗ ' + name + (detail ? `\n      ${detail}` : '')); }
};

const { sheetIo } = await loadFrontendUtils(['sheetIo']);

const DIST = [
  ['样本', 'S1', 'S2', 'S3', 'S4'],
  ['S1', 0, 0.35, 0.42, 0.28],
  ['S2', 0.35, 0, 0.38, 0.45],
  ['S3', 0.42, 0.38, 0, 0.52],
  ['S4', 0.28, 0.45, 0.52, 0]
];
const SAMPLES = [['样本', 'Group', 'Age'], ['S1', 'Control', 25], ['S2', 'Control', 28], ['S3', 'Treatment', 30], ['S4', 'Treatment', 27]];
const FORMULA = [['模型公式'], ['Y ~ Group + Age']];

const src = fs.readFileSync(VIEW, 'utf8');

// Node 里没有浏览器 FileReader，而旧版 handleFileChange 靠它读字节。
// 重构后走 file.arrayBuffer()，这个 polyfill 就可以删；现在先给它，
// 才能量到“改动前到底是什么行为”（不装死，也不拿新假设去测旧代码）。
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(file) {
      file.arrayBuffer().then(
        (buf) => { this.result = buf; if (this.onload) this.onload({ target: this }); },
        (e) => { if (this.onerror) this.onerror(e); }
      );
    }
    readAsText(file) {
      file.text().then(
        (txt) => { this.result = txt; if (this.onload) this.onload({ target: this }); },
        (e) => { if (this.onerror) this.onerror(e); }
      );
    }
  };
}
const tick = () => new Promise((r) => setTimeout(r, 60));
const { createServer } = await import(pathToFileURL(path.join(FRONTEND, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({
  root: FRONTEND, configFile: path.join(FRONTEND, 'vite.config.js'),
  server: { middlewareMode: true }, appType: 'custom', logLevel: 'error'
});
let comp;
try {
  comp = (await server.ssrLoadModule('/src/views/r-analysis/PERMANOVA.vue')).default;
  check('视图 SFC 能被加载', !!comp && typeof comp.methods === 'object');
} catch (e) {
  check('视图 SFC 能被加载', false, e.message);
  await server.close(); process.exit(1);
}

const makeVm = () => {
  const vm = { ...comp.data(), $refs: {}, $nextTick: (f) => f && f() };
  for (const [k, fn] of Object.entries(comp.computed)) Object.defineProperty(vm, k, { get: () => fn.call(vm), configurable: true });
  for (const [k, fn] of Object.entries(comp.methods)) vm[k] = fn.bind(vm);
  vm.notices = [];
  const push = (type) => (m) => vm.notices.push([type, typeof m === 'string' ? m : (m && m.message) || '']);
  vm.$message = Object.assign(push('info'), { success: push('success'), error: push('error'), warning: push('warning') });
  return vm;
};

/** 造一个 xlsx File（外壳与旧版都吃 File，旧版取 .raw） */
const fileFor = async (sheets) => {
  const XLSX = await import(pathToFileURL(path.join(FRONTEND, 'node_modules/xlsx/xlsx.js')).href);
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const buf = out instanceof ArrayBuffer ? new Uint8Array(out) : out;
  return new File([buf], 'test.xlsx');
};

/** 兼容两代入口：旧版读 file.raw，外壳版直接收 File */
const driveImport = async (vm, sheets) => {
  const file = await fileFor(sheets);
  const oldStyle = /\.raw/.test(String(comp.methods.handleFileChange));
  await vm.handleFileChange(oldStyle ? { raw: file } : file);
  await tick();  // 旧版是 FileReader 异步回调，不等一下什么也没发生
  const applier = vm.applyImport || vm.confirmImport;
  if (applier) applier.call(vm);
  return oldStyle ? '旧写法' : '外壳写法';
};

// ---------------------------------------------------------------- 1. 校验器
console.log('\n=== 1. 校验器 ===');
const dup = (name) => (src.match(new RegExp(`^    ${name}\\(\\)`, 'gm')) || []).length;
check('validateDistanceMatrix 只有一处定义（现在有两处，后者悄悄覆盖前者）', dup('validateDistanceMatrix') === 1, `${dup('validateDistanceMatrix')} 处`);
check('validateSampleData 只有一处定义', dup('validateSampleData') === 1, `${dup('validateSampleData')} 处`);
{
  const vm = makeVm();
  vm.permanovaParams.distanceMatrixStr = '';
  vm.validateDistanceMatrix();
  check('空矩阵 -> 不合法且不打扰（无报错文案）', vm.permanovaParams.matrixValid === false && vm.permanovaParams.matrixError === '');

  vm.permanovaParams.distanceMatrixStr = JSON.stringify([[0, 0.3, 0.4], [0.35, 0]]);
  vm.validateDistanceMatrix();
  check('非方阵 -> 拦截', vm.permanovaParams.matrixValid === false && /方阵/.test(vm.permanovaParams.matrixError), vm.permanovaParams.matrixError);

  vm.permanovaParams.distanceMatrixStr = JSON.stringify(DIST.slice(1).map((r) => r.slice(1)));
  vm.validateDistanceMatrix();
  check('4×4 合法，尺寸记下来', vm.permanovaParams.matrixValid === true && vm.permanovaParams.matrixSize === 4, vm.permanovaParams.matrixError);

  vm.permanovaParams.sampleDataStr = JSON.stringify({ 样本: ['S1', 'S2', 'S3'], Group: ['a', 'b', 'c'] });
  vm.validateSampleData();
  check('样本数与矩阵不匹配 -> 拦截并说明两个数',
    vm.permanovaParams.sampleDataValid === false && /3/.test(vm.permanovaParams.sampleDataError) && /4/.test(vm.permanovaParams.sampleDataError),
    vm.permanovaParams.sampleDataError);

  vm.permanovaParams.sampleDataStr = JSON.stringify({ 样本: ['S1', 'S2', 'S3', 'S4'], Group: ['a', 'b', 'c', 'd'] });
  vm.validateSampleData();
  check('长度一致 -> 合法', vm.permanovaParams.sampleDataValid === true, vm.permanovaParams.sampleDataError);

  vm.permanovaParams.sampleDataStr = JSON.stringify({ 样本: ['S1', 'S2'], Group: ['a', 'b', 'c'] });
  vm.validateSampleData();
  check('各列长度不一致 -> 拦截', vm.permanovaParams.sampleDataValid === false && /长度/.test(vm.permanovaParams.sampleDataError), vm.permanovaParams.sampleDataError);
}

// ---------------------------------------------------------------- 2. 导入
console.log('\n=== 2. 导入后表单里的形状 ===');
{
  const vm = makeVm();
  const how = await driveImport(vm, [['距离矩阵', DIST], ['样本数据', SAMPLES], ['模型公式', FORMULA]]);
  console.log(`      （入口：${how}）`);
  check('距离矩阵进表单是纯数值 4×4',
    Array.isArray(vm.permanovaParams.distanceMatrix) && vm.permanovaParams.distanceMatrix.length === 4 &&
    !isNaN(vm.permanovaParams.distanceMatrix[0][1]), JSON.stringify(vm.permanovaParams.distanceMatrix && vm.permanovaParams.distanceMatrix[0]));
  const dict = vm.permanovaParams.sampleData || {};
  check('sampleData 是列字典且第一列是样本 ID', Object.keys(dict)[0] === '样本', Object.keys(dict).join(','));
  check('公式从表里读出来了', vm.permanovaParams.formula === 'Y ~ Group + Age', vm.permanovaParams.formula);
  check('导入后校验状态是合法的', vm.permanovaParams.matrixValid === true && vm.permanovaParams.sampleDataValid === true,
    `${vm.permanovaParams.matrixError} | ${vm.permanovaParams.sampleDataError}`);

  // (B) 的核心用例：Excel 里把样本数据排过序
  const vm2 = makeVm();
  await driveImport(vm2, [
    ['距离矩阵', DIST],
    ['样本数据', [['样本', 'Group', 'Age'], ['S4', 'Treatment', 27], ['S2', 'Control', 28], ['S1', 'Control', 25], ['S3', 'Treatment', 30]]],
    ['模型公式', FORMULA]
  ]);
  const d2 = vm2.permanovaParams.sampleData || {};
  check('[新] 样本数据被打乱顺序 -> 仍按距离矩阵样本顺序重排',
    (d2['样本'] || []).join(',') === 'S1,S2,S3,S4', (d2['样本'] || []).join(','));
  check('[新] Age 跟着样本走（错一位相关就废了）', (d2.Age || []).join(',') === '25,28,30,27', (d2.Age || []).join(','));

  const vm3 = makeVm();
  await driveImport(vm3, [['样本数据', SAMPLES], ['距离矩阵', DIST.slice(0, 4)]]);
  check('[新] 距离矩阵不方阵（截断）-> 明确拒绝而不是静默少一个样本',
    !!vm3.importError && /方阵/.test(vm3.importError), vm3.importError || '(没报错)');

  const vm4 = makeVm();
  await driveImport(vm4, [['样本数据', SAMPLES]]);
  check('[新] 只给样本数据 -> 指名缺距离矩阵（旧版把第一张表当矩阵）',
    /距离矩阵/.test(vm4.importError || ''), vm4.importError || '(没报错)');

  const vm5 = makeVm();
  await driveImport(vm5, [['距离矩阵', DIST], ['样本数据', SAMPLES], ['模型公式', [['模型公式'], ['Group + Age']]]]);
  check('[新] 公式缺因变量 -> 拒绝并给写法', /Y ~|因变量/.test(vm5.importError || ''), vm5.importError || '(没报错)');
  check('[新] 解析失败时，填入表单不会把真正的错没盖成“先选一个文件”',
    !/先选一个文件/.test(vm3.importError || ''), vm3.importError);

  const vm6 = makeVm();
  await driveImport(vm6, [['Distance Matrix', DIST], ['Sample Data', SAMPLES]]);
  check('[新] 英文表名能认（旧版靠"第一张/第二张表"位置猜）', vm6.permanovaParams.matrixValid === true, vm6.importError);

  const vm7 = makeVm();
  await driveImport(vm7, [['填写说明', [['这是说明']]], ['距离矩阵', DIST], ['样本数据', SAMPLES]]);
  check('[新] 预览分表展示而不是一个大杂烩', Array.isArray(vm7.importTabs) && vm7.importTabs.length >= 2,
    JSON.stringify((vm7.importTabs || []).map((x) => x.name)));
  check('[新] 说明表排在最前面时，不能被当成距离矩阵',
    vm7.importError === '' || /距离矩阵|方阵/.test(vm7.importError), vm7.importError || '(没报错)');

  const vm8 = makeVm();
  await driveImport(vm8, [['样本数据', SAMPLES], ['距离矩阵', DIST]]);  // 表名认得，但顺序颠倒
  check('[新] 按表名取表，不按位置（旧版第二张表当样本数据、第一张当矩阵）',
    vm8.permanovaParams.matrixValid === true && (vm8.permanovaParams.distanceMatrix || []).length === 4,
    JSON.stringify(vm8.permanovaParams.distanceMatrix));
}

// ---------------------------------------------------------------- 3. 送给 R 的参数
console.log('\n=== 3. buildRunParams ===');
{
  const vm = makeVm();
  await driveImport(vm, [['距离矩阵', DIST], ['样本数据', SAMPLES], ['模型公式', FORMULA]]);
  const has = typeof vm.buildRunParams === 'function';
  check('[新] 送 R 的参数由一个纯函数组装（原来散在 runPERMANOVA 里）', has);
  if (has) {
    const p = vm.buildRunParams();
    check('[新] 必带 distanceMatrix/permutations', Array.isArray(p.distanceMatrix) && Number.isFinite(p.permutations), Object.keys(p).join(','));
    check('[新] 校验通过时带 sampleData 与 formula（R 要求两者同时给）',
      !!p.sampleData && !!p.formula, JSON.stringify(Object.keys(p)));
    check('[新] 矩阵与 sampleData 行数一致（不一致时宁可不带）',
      p.sampleData['样本'].length === p.distanceMatrix.length, `${p.sampleData['样本'].length} vs ${p.distanceMatrix.length}`);
    const bare = makeVm();
    bare.permanovaParams.distanceMatrixStr = JSON.stringify([[0]]);
    bare.validateDistanceMatrix();
    const pb = bare.buildRunParams();
    check('[新] 没样本数据时不带 sampleData/formula（让 R 只出 PCoA）', !('sampleData' in pb) || !pb.sampleData, Object.keys(pb).join(','));
  }
}

// ---------------------------------------------------------------- 4. 导出
console.log('\n=== 4. 导出任务表 ===');
{
  const vm = makeVm();
  check('[新] exportJobs 存在（把"勾了什么"变成"要写哪些文件"）', typeof vm.exportJobs === 'function');
  if (typeof vm.exportJobs === 'function') {
    vm.analysisResult = { permanova_result: [{ Df: 1, p_value: 0.6 }], pcoa: { samples: [{ sample_id: 'S1', coordinates: { PCoA1: 0.1, PCoA2: 0.2 }, group: 'a', group_variable: 'Group' }] } };
    const jobs = vm.exportJobs(['json', 'permanovaTable', 'pcoaCoords', 'chartPNG', 'input']);
    check('[新] 勾 5 项出 5 个任务', jobs.length === 5, jobs.length);
    check('[新] 文件名前缀与旧版逐字一致',
      jobs.map((j) => j.filename.split('_')[0]).join('|') === 'PERMANOVA 结果|PERMANOVA 表|PCoA 坐标|分析图表|PERMANOVA 输入',
      jobs.map((j) => j.filename).join(' , '));
    check('[新] 未知 key 不出空文件', vm.exportJobs(['nope']).length === 0);
  }
}

// ---------------------------------------------------------------- 5. 端到端真跑
console.log('\n=== 5. 导入得到的参数真跑一次 R ===');
{
  const vm = makeVm();
  await driveImport(vm, [['距离矩阵', DIST], ['样本数据', SAMPLES], ['模型公式', FORMULA]]);
  if (typeof vm.buildRunParams !== 'function') {
    check('[新] 端到端（需要 buildRunParams）', false, '视图还没有 buildRunParams');
  } else {
    const p = vm.buildRunParams();
    const f = path.join(TMP, 'in.json');
    fs.writeFileSync(f, JSON.stringify(p));
    execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/permanova.R'), f, f + '.out', f + '.err'], { stdio: 'pipe', timeout: 300000 });
    const out = JSON.parse(fs.readFileSync(f + '.out', 'utf8'));
    check('[新] 导入→表单→R 全链路出结果，无 error', !!out && !out.error, JSON.stringify(out).slice(0, 200));
    check('[新] 结果里有 PERMANOVA 表与 PCoA', Array.isArray(out.permanova_result) && out.pcoa && out.pcoa.samples.length === 4,
      Object.keys(out || {}).join(','));
    check('[新] p 值是真数', out.permanova_result.some((r) => Number.isFinite(Number(r.p_value))), JSON.stringify(out.permanova_result[0]));
  }
}

// ---------------------------------------------------------------- 6. 外壳 props 契约
console.log('\n=== 6. 外壳 props 契约 ===');
{
  const tpl = src.slice(0, src.indexOf('<script>'));
  // computed 是 defineProperty 上去的、不可枚举，名单要自己拼
  const state = new Set([...Object.keys(makeVm()), ...Object.keys(comp.computed)]);
  const bound = (tag) => {
    const m = tpl.match(new RegExp(`<${tag}[^>]*>`, 's'));
    if (!m) return null;
    return [...m[0].matchAll(/:([a-z-]+)="([A-Za-z0-9_]+)/g)].map((x) => [x[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()), x[2]]);
  };
  for (const [tag, props] of [['ImportDialog', ['sheets', 'tabs', 'error', 'warnings']], ['ExportDialog', ['options', 'selected', 'error']]]) {
    const b = bound(tag);
    check(`${tag} 在模板里`, !!b, '');
    if (!b) continue;
    for (const p of props) {
      const pair = b.find(([k]) => k === p);
      check(`${tag} :${p} 绑到了真实状态`, !!pair && state.has(pair[1]), b.map(([k, v]) => `${k}=${v}`).join(' '));
    }
  }
  const tb = bound('ToolbarActions') || [];
  check('工具栏四个动作都接上了方法',
    ['template', 'import', 'export', 'input'].every((ev) => tpl.includes(`@${ev}="`)),
    tb.map(([k, v]) => `${k}=${v}`).join(' '));
  for (const m of ['downloadTemplate', 'openImport', 'openExport', 'downloadInput']) {
    check(`${m} 在 methods 里`, typeof makeVm()[m] === 'function', m);
  }
  check('旧版按位置猜表的那段已不存在', !/SheetNames\[0\]/.test(src));
  check('生产路径不再刷 console（导入那一段）', !/\[Import\]/.test(src));
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
await server.close();
process.exit(fails.length ? 1 : 0);
