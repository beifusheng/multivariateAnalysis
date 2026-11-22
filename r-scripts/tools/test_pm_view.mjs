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
  // cacheDir 必须显式指定：默认落在 root 的 node_modules/.vite，而那**正是开发者
  // 正在跑的 dev 服务所用的一份依赖缓存**。跑一次测试就把它改写一遍，浏览器里
  // 已加载的页面再去动态 import('xlsx') 就会「Failed to fetch dynamically imported
  // module」—— 实机现象是导出模板点了没反应 / 导出结果报这个 fetch 错误。
  // 放 node_modules 里：既隔离，又天然不进版本控制。
  cacheDir: path.join(FRONTEND, 'node_modules', '.vite-test-cache'),
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

// 视图源码：模板里有没有概览卡片这类东西，只能在源码层面查（SSR 渲染不出 el-collapse 的细节）
const pmViewSource = fs.readFileSync(path.join(FRONTEND, 'src/views/r-analysis/PERMANOVA.vue'), 'utf8');

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

// ------------------------------------------------ 5b. 下载模板本身必须能导入并跑出结果
console.log('\n=== 5b. 「下载模板 → 导入 → 真跑 R」 ===');
{
  // 用户会下载模板、原封不动上传、然后点运行。旧模板 5 样本跑得出来但 p=0.53，
  // 第一次接触这个功能的人看到的是"看不出差异"，而那是示例的问题、不是方法的问题。
  const pmSpec = await import(pathToFileURL(path.join(FRONTEND, 'src/utils/permanovaSheetSpec.js')).href);
  const tpl = pmSpec.pmTemplateSheets();
  const dataSheets = tpl.filter(([n]) => n !== '填写说明');

  const vm = makeVm();
  vm.openImport();
  await driveImport(vm, dataSheets);
  check('模板被自己的导入器接受', !vm.importError, vm.importError);
  check('填入后对话框关掉', vm.showImportDialog === false, String(vm.showImportDialog));
  const ids = JSON.parse(vm.permanovaParams.distanceMatrixStr || '[]');
  check('模板至少 8 个样本（5 个时自由度太少，示例不好看结果）', ids.length >= 8, String(ids.length));
  check('距离矩阵对称、对角为 0',
    ids.every((r, i) => r[i] === 0) && ids.every((r, i) => ids.every((c, j) => Math.abs(r[j] - c[i]) < 1e-9)),
    JSON.stringify(ids[0]));
  check('模板公式引用的是本模板的列名', /^[^~]+~\s*Group/.test(vm.permanovaParams.formula || ''), vm.permanovaParams.formula);
  // sampleDataStr 是列字典（{样本:[…], Group:[…]}），不是行数组：这里按它自己的形状断言
  const sd = JSON.parse(vm.permanovaParams.sampleDataStr);
  check('样本表里分组是文本而不是 0/1',
    Array.isArray(sd.Group) && sd.Group.every((v) => typeof v === 'string' && v.length > 1),
    JSON.stringify(sd.Group));
  check('分组列与样本列同长（列字典一旦错位 R 那边静默错）',
    sd.Group.length === sd['样本'].length && sd.Age.length === sd['样本'].length,
    `${sd.Group.length}/${sd['样本'].length}`);
  // 数值协变量在 PERMANOVA 里合法，不该套用 Non-random 那句"请分箱"
  const hint = (vm.importWarnings || []).join(' ');
  check('数值协变量的提醒说清了后果（不是「本模块只接受因子」）',
    hint === '' || (!/只接受因子/.test(hint) && /连续协变量/.test(hint)), hint.slice(0, 160));

  if (typeof vm.buildRunParams === 'function') {
    const p = vm.buildRunParams();
    const f = path.join(TMP, 'tpl.json'), e = f + '.err';
    fs.writeFileSync(f, JSON.stringify(p));
    let out = null, rerr = '';
    try {
      execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/permanova.R'), f, f + '.out', e],
        { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
      out = JSON.parse(fs.readFileSync(f + '.out', 'utf8'));
    } catch (ex) {
      rerr = String(ex.stdout || '') + String(ex.stderr || '');
    }
    const model = out && (out.permanova_result || []).find((r) => r._row === 'Model');
    check('模板真跑 R 成功', !!out && !out.error,
      rerr.split('\n').filter((l) => /Error|错误/.test(l))[0] || (out && out.error) || '');
    check('模板跑出的 p 显著（示例要能演示"查出差异"长什么样）',
      !!model && Number(model.p_value) < 0.05, JSON.stringify(model));
    check('模板的 PCoA 也渲出来了', !!out && Array.isArray(out.pcoa?.samples) && out.pcoa.samples.length >= 8,
      JSON.stringify(out && out.pcoa && out.pcoa.samples && out.pcoa.samples.length));
  }

  // 文件名：三个模块必须同一格式（<slug> 数据模板_<stamp>.xlsx）
  check('下载模板的文件名走统一格式',
    typeof vm.templateFileName === 'function' && /^PERMANOVA 数据模板_[0-9-]{19}\.xlsx$/.test(String(vm.templateFileName())),
    typeof vm.templateFileName === 'function' ? vm.templateFileName() : '没有 templateFileName');
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
  const tbText = (tpl.match(/<ToolbarActions[^>]*>/s) || [''])[0];
  check('工具栏四个动作都接上了方法',
    ['template', 'import', 'export', 'input'].every((ev) => tpl.includes(`@${ev}="`)),
    tb.map(([k, v]) => `${k}=${v}`).join(' '));
  // 少了 can-run / has-result 不会报错，只会让“下载输入/导出结果”永远灰着（S2 就踩过）
  // 用文本存在判定，不用上面那个只认标识符的 pairs 正则：“!!analysisResult”这种开头不是字母
  for (const p of ['can-run', 'has-result']) {
    check(`ToolbarActions 传了 :${p}`, tbText.includes(`:${p}="`), tbText.replace(/\s+/g, ' ').slice(0, 120));
  }
  for (const m of ['downloadTemplate', 'openImport', 'openExport', 'downloadInput']) {
    check(`${m} 在 methods 里`, typeof makeVm()[m] === 'function', m);
  }
  check('旧版按位置猜表的那段已不存在', !/SheetNames\[0\]/.test(src));
  check('生产路径不再刷 console（导入那一段）', !/\[Import\]/.test(src));
}

console.log('\n=== 7. 编码语义：整数分组被当趋势拟合时必须开口（引擎 + 视图两头）===');
{
  // 9 样本 3 组，组内 0.1 / 组间 0.5。同一份数据两种写法：
  //   formula="Group"          -> adonis2 把 1/2/3 当连续量，检验的是"随编号上升的趋势"
  //   formula="as.factor(...)" -> 才是"三组互相比较"
  // 实测 F 差 11 倍（6.47 vs 73.0）而 p 都显著 —— 用户读到"显著"，读不到"答的是另一个问题"。
  const D9 = [];
  for (let a = 0; a < 9; a++) {
    const row = [];
    for (let b = 0; b < 9; b++) row.push(a === b ? 0 : (Math.floor(a / 3) === Math.floor(b / 3) ? 0.1 : 0.5));
    D9.push(row);
  }
  const codes = ['1', '1', '1', '2', '2', '2', '3', '3', '3'];
  const base = {
    distanceMatrix: D9,
    permutations: 199,
    sampleData: { Sample: Array.from({ length: 9 }, (_, i) => 'S' + (i + 1)), Group: codes }
  };
  const runPm = (payload, tag) => {
    const f = path.join(TMP, tag + '.json'), o = f + '.out', e = f + '.err';
    fs.writeFileSync(f, JSON.stringify(payload));
    execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/permanova.R'), f, o, e], { stdio: 'pipe', timeout: 300000 });
    return JSON.parse(fs.readFileSync(o, 'utf8'));
  };
  const pmErr = (payload, tag) => {
    const f = path.join(TMP, tag + '.json'), e = f + '.err';
    fs.writeFileSync(f, JSON.stringify(payload));
    let code = 0;
    try {
      execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/permanova.R'), f, f + '.out', e], { stdio: 'pipe', timeout: 300000 });
    } catch (err) { code = err.status; }
    return { code, msg: fs.existsSync(e) ? fs.readFileSync(e, 'utf8') : '' };
  };

  const trend = runPm({ ...base, formula: 'Group' }, 'trend');
  const factored = runPm({ ...base, formula: 'as.factor(Group)' }, 'factored');

  check('整数编码 + 直接进公式 -> diagnostics 非空', (trend.diagnostics || []).length >= 1,
    JSON.stringify(trend.diagnostics));
  check('提醒讲清了后果与出路（趋势 vs 组间、怎么写才对）',
    /趋势|斜率/.test(trend.diagnostics[0]) && /as\.factor\(Group\)/.test(trend.diagnostics[0]),
    String(trend.diagnostics[0]).slice(0, 140));
  check('写成 as.factor(Group) 就不再报（用户已经说明了意图）',
    (factored.diagnostics || []).length === 0, JSON.stringify(factored.diagnostics));
  check('两种写法的 F 确实不同（不是测试在虚构差异）',
    Math.abs(factored.F / trend.F - 1) > 1, 'trend F=' + trend.F + ' factor F=' + factored.F);
  check('PCoA 分组跟随公式项，不再退回样本 ID 着色',
    trend.pcoa.samples[0].group_variable === 'Group' &&
      [...new Set(trend.pcoa.samples.map((x) => x.group))].sort().join(',') === '1,2,3',
    JSON.stringify(trend.pcoa.samples.slice(0, 2)));

  // 两层编码在数学上是同一个分割，报出来就是噪音（这条是防我自己过度报警）
  const D4 = [[0, 0.08, 0.4, 0.45], [0.08, 0, 0.42, 0.38], [0.4, 0.42, 0, 0.09], [0.45, 0.38, 0.09, 0]];
  const two = runPm({
    distanceMatrix: D4, permutations: 99,
    sampleData: { Sample: ['S1', 'S2', 'S3', 'S4'], Group: ['1', '2', '1', '2'] }, formula: 'Group'
  }, 'two');
  const twoTxt = runPm({
    distanceMatrix: D4, permutations: 99,
    sampleData: { Sample: ['S1', 'S2', 'S3', 'S4'], Group: ['Case', 'Control', 'Case', 'Control'] }, formula: 'Group'
  }, 'twotxt');
  check('两层数字编码不报警（F/p 与文本编码逐字相同）',
    (two.diagnostics || []).length === 0 && two.F === twoTxt.F && two.p_value === twoTxt.p_value,
    JSON.stringify({ two: [two.F, two.p_value], txt: [twoTxt.F, twoTxt.p_value] }));

  // 两条报错分支必须在真 R 里跑过（本项目老规矩：没执行过的报错信息等于没有）
  const mixed = pmErr({
    ...base, formula: 'Group',
    sampleData: { ...base.sampleData, Group: ['Case', '1', 'Case', '3', '3', '3', '1', '2', '3'] }
  }, 'mixed');
  check('数值与文本混在一列 -> 明确报错而不是静默变 NA 列',
    mixed.code !== 0 && /既有数值又有文本/.test(mixed.msg) && !/非数值参数/.test(mixed.msg),
    mixed.msg.slice(0, 140));
  const short = pmErr({ ...base, formula: 'Group', sampleData: { Sample: ['S1', 'S2'], Group: ['1', '2'] } }, 'short');
  check('样本数不匹配 -> 说清两边各多少个',
    short.code !== 0 && /距离矩阵有 9 个样本，但样本数据有 2 行/.test(short.msg), short.msg.slice(0, 140));

  // 视图侧：引擎说了但界面不显示，等于没说
  const vm = makeVm();
  vm.analysisResult = trend;
  check('视图 diagnostics 计算属性拿到提醒', vm.diagnostics.length >= 1, JSON.stringify(vm.diagnostics));
  check('视图把 permanova_result 变成表格行', vm.resultTerms.length >= 1 && vm.resultTerms[0].Df !== undefined,
    JSON.stringify(vm.resultTerms));
  const vmOld = makeVm();
  vmOld.analysisResult = { F: 1.2, p_value: 0.04, permanova_result: [{ Df: 1, R2: 0.3 }] };
  check('旧结果没有 diagnostics 字段时返回空数组而不是报错', vmOld.diagnostics.length === 0);
  const vmStr = makeVm();
  vmStr.analysisResult = { diagnostics: ['', null, '  ', '真提醒'] };
  check('空串/null 不算一条提醒', vmStr.diagnostics.join('|') === '真提醒', JSON.stringify(vmStr.diagnostics));
  check('结果区不再是裸 JSON：概览卡片与逐术语表格在模板里',
    /result-summary/.test(pmViewSource) && /rs-table/.test(pmViewSource) &&
      /原始输出（JSON，调试用）/.test(pmViewSource), '');

  // --------- 实机报回来的那一组数字（Df=8 / R²=1 / F=p=N/A）就是下面两条 ----------
  const idFit = pmErr({ ...base, formula: 'Sample' }, 'idfit');
  check('样本 ID 列进公式 -> 明确拒绝并说清为什么（不再给 R²=1 的空模型）',
    idFit.code !== 0 && /是样本 ID 列（第一列），不能当解释变量/.test(idFit.msg) && !/非数值参数/.test(idFit.msg),
    idFit.msg.slice(0, 130));
  const ghost = pmErr({ ...base, formula: 'Treatment' }, 'ghost');
  check('公式引用了不存在的列 -> 说清"公式写列名"并列出可用列与取值',
    ghost.code !== 0 && /不是样本表里的列名/.test(ghost.msg) && /公式要写\*\*列名\*\*/.test(ghost.msg) &&
      /可用列：Group（取值：/.test(ghost.msg) && !/找不到对象/.test(ghost.msg) && !/doTryCatch/.test(ghost.msg),
    ghost.msg.slice(0, 150));

  const idTrend = runPm({ ...base, formula: 'Sample' === 'x' ? 'Group' : 'Group' }, 'trend2');
  check('提醒只说公式真用到的列（ID 被拒时不该扯 Group）',
    (idTrend.diagnostics || []).some((d) => /Group/.test(d)), JSON.stringify(idTrend.diagnostics));
  const unused = runPm({
    distanceMatrix: D9, permutations: 199,
    sampleData: { Sample: Array.from({ length: 9 }, (_, i) => 'S' + (i + 1)), Group: codes, pH: [7.1, 7.2, 7.0, 7.3, 7.1, 7.2, 6.9, 7.0, 7.1] },
    formula: 'pH'
  }, 'unused');
  check('整数编码列没进公式时不该报（上一版扫全部列，骂错了对象）',
    (unused.diagnostics || []).every((d) => !/Group/.test(d)), JSON.stringify(unused.diagnostics));

  check('视图按引擎的 _row 给行起名，不再显示"项 1/项 2"',
    vm.resultTerms.map((t) => t.term).join(',') === '模型（公式项）,残差,总计',
    vm.resultTerms.map((t) => t.term).join(','));
  // 实机反馈的形状：上面绿框 0.0070，下面一句“你检验的不是组间差异”——颜色先替用户下了结论
  check('引擎带提醒时头部不再是绿色"显著"，而是 caveat', vm.headlineState === 'caveat', vm.headlineState);
  check('caveat 时标题明说"显著性先别信"', /显著性先别信/.test(vm.headlineCaption), vm.headlineCaption);
  {
    const vmClean = makeVm();
    vmClean.analysisResult = factored;   // as.factor(Group)：同一数据、无提醒
    check('无提醒时仍按显著性上色（不是一律变橙）',
      vmClean.headlineState === 'sig' && /置换/.test(vmClean.headlineCaption) && !/别信/.test(vmClean.headlineCaption),
      vmClean.headlineState + ' | ' + vmClean.headlineCaption);
    const vmNsig = makeVm();
    vmNsig.analysisResult = { p_value: 0.61, diagnostics: [], permutations: 999 };
    check('不显著且无提醒 -> nsig', vmNsig.headlineState === 'nsig', vmNsig.headlineState);
  }
  check('caveat 样式在本视图 scoped 里（不靠共享 CSS 搬运）',
    /\.rs-headline\.caveat/.test(pmViewSource), '');

  check('视图能列出可写进公式的列（首列 ID 排除在外）',
    (() => { const v = makeVm(); v.permanovaParams.sampleData = base.sampleData; return v.sampleColumns.join(',') === 'Group'; })(),
    JSON.stringify(vm.sampleColumns));
  check("'Treatment' 这种凭空补列名的旧逻辑已删除",
    !/formula \|\| 'Treatment'/.test(pmViewSource), '');
}


console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
await server.close();
process.exit(fails.length ? 1 : 0);
