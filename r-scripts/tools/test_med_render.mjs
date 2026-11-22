#!/usr/bin/env node
/**
 * PERMANOVA_Med.vue 的 SSR 渲染冒烟（S3 后半的验收）
 * ---------------------------------------------------------------
 * npm run build 只编译模板、不执行它。外壳迁移最容易出的四类问题只有真渲染才会暴露：
 *   - 外壳 props 绑了不存在的方法/字段（静默渲染成空白，静态断言查不到）
 *   - 组件没注册（图标位置空着）
 *   - 计算属性在空态抛异常（整页白屏）
 *   - v-for 遍历 undefined
 * 对话框走 <teleport to="body">，renderToString 只会留 <!---->，所以用替身接管
 * ElDialog/ElUpload，而且必须 app.component() 全局注册（外壳现在是子组件）。
 *
 *   node r-scripts/tools/test_med_render.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND = path.join(ROOT, 'frontend');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable', 'bin', process.platform === 'win32' ? 'Rscript.exe' : 'Rscript');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'medrender-'));

let pass = 0, fail = 0;
const fails = [];
const warnings = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (detail ? ` —— ${String(detail).slice(0, 200)}` : '')); console.log('  ✗ ' + name + (detail ? `\n      ${String(detail).slice(0, 260)}` : '')); }
};

// 真实 R 结果（图表与结论卡都吃这个，不用假数据）
const { medTemplates: mt } = await loadFrontendUtils(['medTemplates']);
const d = mt.buildMedTemplateData(mt.MED_TEMPLATE_MAP.inflammationMed.spec);
const inp = path.join(TMP, 'x.in.json');
const outp = inp + '.out.json';
fs.writeFileSync(inp, JSON.stringify({
  mediatorData: d.mediatorData, predictorData: d.predictorData, outcomeData: d.outcomeData,
  ...(d.covariates ? { covariates: d.covariates } : {}), permutations: 100, seed: 12345
}));
execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/permanova_med.R'), inp, outp, inp + '.err'], { cwd: ROOT, stdio: 'ignore', timeout: 300000 });
const result = JSON.parse(fs.readFileSync(outp, 'utf8'));
check('真跑 R 拿到结果', result.success === true, result.error || '');

const { createServer } = await import(pathToFileURL(path.join(FRONTEND, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({ root: FRONTEND, configFile: path.join(FRONTEND, 'vite.config.js'),
  // cacheDir 必须显式指定，默认值 node_modules/.vite 与开发者正在跑的 dev 服务是同一份缓存；
  // 跑测试会把它改写掉，浏览器里旧页面再动态 import('xlsx') 就 fetch 失败（导出报错的根因）。
  cacheDir: path.join(FRONTEND, 'node_modules', '.vite-test-cache'),
  server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
// 依赖统一走 Vite 的 SSR 管线：CJS 版 vue 与 ESM 版是两份实例，混用会直接报错
const depsFile = path.join(FRONTEND, '.med-ssr-deps.js');
fs.writeFileSync(depsFile, [
  "export { createSSRApp, h } from 'vue';",
  "export { renderToString } from '@vue/server-renderer';",
  "export { default as ElementPlus } from 'element-plus';"
].join('\n') + '\n');
const deps = await server.ssrLoadModule('/.med-ssr-deps.js');
const { createSSRApp, renderToString, ElementPlus, h } = deps;

const DialogStub = {
  name: 'ElDialog', props: { title: String, modelValue: Boolean, width: String },
  setup(props, { slots }) {
    // 必须尊重 modelValue：否则"没打开的对话框"也会渲染，空态断言会被污染
    return () => (props.modelValue
      ? h('div', { class: 'dialog-stub' }, [
        h('h4', props.title || ''),
        slots.default ? slots.default() : null,
        slots.footer ? slots.footer() : null
      ])
      : null);
  }
};
const UploadStub = {
  name: 'ElUpload', props: { drag: Boolean, accept: String },
  setup(_p, { slots }) { return () => h('div', { class: 'upload-stub' }, [slots.default ? slots.default() : null]); }
};
// el-table 在 SSR 里只吐一个空壳（表头 tr 是空的、单元格根本不渲染），
// 于是“:data 绑错字段”这种错在真实组件下永远测不到。这里替身把行内容写进 HTML，
// 把外壳与数据之间的接线变成可断言的。
const TableStub = {
  name: 'ElTable', props: { data: { type: Array, default: null }, border: Boolean, maxHeight: [String, Number] },
  setup(props, { slots }) {
    const rows = (props.data || []).map((r) => Object.values(r || {}).join('|')).join(';');
    return () => h('div', { class: 'table-stub' }, [
      h('span', { class: 'table-rows' }, `rows[${props.data ? props.data.length : 'null'}]:${rows}`),
      slots.default ? slots.default() : null
    ]);
  }
};
const ColumnStub = {
  name: 'ElTableColumn', props: { prop: String, label: String, width: [String, Number], minWidth: [String, Number] },
  setup(props) { return () => h('span', { class: 'col-stub' }, `[${props.prop || ''}|${props.label || ''}]`); }
};

const views = await server.ssrLoadModule('/src/views/r-analysis/PERMANOVA_Med.vue');
const Comp = views.default;

const render = async (tag, dataOverride) => {
  warnings.length = 0;
  const Wrapped = {
    ...Comp,
    data() {
      const base = Comp.data.call(this);
      return { ...base, ...(dataOverride ? dataOverride(base) : {}) };
    }
  };
  const app = createSSRApp(Wrapped);
  app.use(ElementPlus);
  app.component('ElDialog', DialogStub);
  app.component('ElUpload', UploadStub);
  app.component('ElTable', TableStub);
  app.component('ElTableColumn', ColumnStub);
  app.config.globalProperties.$router = { push: () => { } };
  const notices = [];
  app.config.globalProperties.$message = Object.assign((o) => notices.push(o), { success: (o) => notices.push(o), error: (o) => notices.push(o), warning: (o) => notices.push(o), info: (o) => notices.push(o) });
  app.config.warnHandler = (msg, instance, trace) => {
    const name = instance?.type?.name || '?';
    warnings.push(`[warn] ${msg} @${name} ${(trace || '').split('\n').slice(1, 3).join(' < ')}`);
  };
  app.config.errorHandler = (e) => warnings.push('[error] ' + (e && e.message));
  const origWarn = console.warn, origErr = console.error;
  console.warn = (...a) => warnings.push(a.map(String).join(' '));
  console.error = (...a) => warnings.push('[error] ' + a.map(String).join(' '));
  let html = '', threw = null;
  try { html = await renderToString(app); } catch (e) { threw = e; } finally { console.warn = origWarn; console.error = origErr; }
  if (process.env.MED_DUMP) fs.writeFileSync(path.join(os.tmpdir(), `med-render-${tag}.html`), html);
  if (threw) check(`${tag}：渲染未抛异常`, false, threw.message);
  else check(`${tag}：渲染未抛异常`, true);
  const noisy = warnings.filter((w) => /Failed to resolve component|Invalid prop|Missing required prop/.test(w));
  check(`${tag}：无「组件未注册 / prop 非法」告警`, noisy.length === 0, noisy.slice(0, 3).join(' | '));
  const errs = warnings.filter((w) => /\[error\]/.test(w) || /ReferenceError|TypeError/.test(w));
  check(`${tag}：无被吞掉的渲染错误`, errs.length === 0, errs.slice(0, 2).join(' | '));
  return html;
};

const strip = (html) => html.replace(/\s+/g, ' ').replace(/data-v-[0-9a-f]+/g, '');

console.log('\n=== 1. 空态 ===');
{
  const html = await render('空态', null);
  check('标题渲染', html.includes('PERMANOVA-med 中介分析'));
  check('工具栏四个动作都在（含新加的下载输入）',
    ['下载模板', '导入数据', '导出结果', '下载输入'].every((x) => html.includes(x)),
    ['下载模板', '导入数据', '导出结果', '下载输入'].filter((x) => !html.includes(x)).join(','));
  const s = strip(html);
  const iWrap = s.indexOf('toolbar-content'), iShell = s.indexOf('<div class="toolbar-actions"');
  check('外壳被 .toolbar-content 包住（收起时才藏得住）',
    iWrap >= 0 && iShell > iWrap && iShell - iWrap < 90, `wrap=${iWrap} shell=${iShell} [${s.slice(iWrap, iWrap + 90)}]`);
  check('数据模板按钮 25 个', (html.match(/btn-template/g) || []).length >= 25,
    String((html.match(/btn-template/g) || []).length));
  check('空态不显示结果区', !html.includes('📊 分析结果'));
  check('空态运行按钮禁用', /运行分析/.test(html) && /is-disabled/.test(html));
  check('对话框没打开时不渲染内容（替身尊重 modelValue）', !html.includes('dialog-stub'));
}

console.log('\n=== 2. 导入对话框（带预览 tabs）===');
{
  const tabs = [
    { name: 'outcome', label: '结局 Y（4 样本 × 2 变量）', cols: ['样本 ID', 'Y1', 'Y2'], rows: [{ '样本 ID': 'S1', Y1: 1.2, Y2: 3.4 }] },
    { name: 'mediator', label: '中介 M（4 样本 × 2 变量）', cols: ['样本 ID', 'M1', 'M2'], rows: [{ '样本 ID': 'S1', M1: 0.5, M2: 1.2 }] },
    { name: 'predictor', label: '暴露 X（4 样本 × 1 变量）', cols: ['样本 ID', 'X1'], rows: [{ '样本 ID': 'S1', X1: 1 }] },
    { name: 'covariates', label: '协变量 Z（4 样本 × 1 变量）', cols: ['样本 ID', 'Age'], rows: [{ '样本 ID': 'S1', Age: 25 }] }
  ];
  const html = await render('导入态', () => ({
    showImportDialog: true, importTabs: tabs,
    importWarnings: ['没有协变量 Z 表：模型将不带协变量']
  }));
  check('四张表各占一个预览 tab',
    ['结局 Y（4 样本 × 2 变量）', '中介 M（4 样本 × 2 变量）', '暴露 X（4 样本 × 1 变量）', '协变量 Z（4 样本 × 1 变量）']
      .every((x) => html.includes(x)),
    ['结局 Y', '中介 M', '暴露 X', '协变量 Z'].filter((x) => !html.includes(x)).join(','));
  // el-table 的单元格在 SSR 里根本不渲染（表头 tr 是空的），这里只能测到“表格结构在”；
  // 预览数据本身归 test_med_view 的 importTabs 断言管，不在这里演能测到的样
  check('预览区渲出表格', /table-stub/.test(html));
  // 上面变异验过：:data="t.rows" 改成 t.row 时这两条会红
  check('预览表格里真带着数据行（不只是一个空壳）', html.includes('S1|1.2|3.4'),
    (html.match(/rows\[[^)<]{0,80}/) || ['(没渲出 rows)'])[0]);
  check('预览表格的列头接上了 cols', html.includes('[Y1|Y1]') && html.includes('[样本 ID|样本 ID]'),
    (html.match(/\[[^\]]{0,12}\|[^\]]{0,12}\]/g) || []).slice(0, 6).join(' '));
  check('警告条渲染（不是静默）', html.includes('模型将不带协变量'));
  check('「填入表单」按钮在', html.includes('填入表单'));
  const errHtml = await render('导入报错态', () => ({ showImportDialog: true, importError: '没找到「结局 Y」表（可叫 结局Y）' }));
  check('错误条渲染出缺哪张表', errHtml.includes('没找到「结局 Y」表'));
  check('没有 tabs 时「填入表单」禁用', /填入表单/.test(errHtml) && /is-disabled/.test(errHtml));
}

console.log('\n=== 3. 有结果（真 R 输出）===');
{
  const base = (b) => ({
    permanovaMedParams: {
      ...b.permanovaMedParams,
      outcomeDataStr: JSON.stringify(d.outcomeData),
      mediatorDataStr: JSON.stringify(d.mediatorData),
      predictorDataStr: JSON.stringify(d.predictorData),
      covariatesStr: d.covariates ? JSON.stringify(d.covariates) : '',
      outcomeDataValid: true, mediatorDataValid: true, predictorDataValid: true, covariatesValid: true,
      mediatorN: d.n
    },
    analysisResult: result
  });
  const html = await render('结果态', base);
  check('结果区渲染', html.includes('📊 分析结果'));
  check('中介结论按真实 p 值给方向',
    html.includes(result.significant_mediation ? '✓ 中介效应显著' : '× 中介效应不显著'));
  check('置换次数用的是真实完成数', html.includes(String(result.n_perm_completed ?? result.n_perm_used ?? '')));
  check('图表 tab 全部渲染', (html.match(/el-tabs__item/g) || []).length >= 3,
    String((html.match(/el-tabs__item/g) || []).length));
  const exp = await render('导出态', (b) => ({ ...base(b), showExportDialog: true }));
  check('导出五项齐全',
    ['完整结果 (JSON)', '分组置换检验 (Excel)', '路径分解 (Excel)', '当前图表 (PNG)', '当前输入 (JSON)'].every((x) => exp.includes(x)),
    ['完整结果', '分组置换检验', '路径分解', '当前图表', '当前输入'].filter((x) => !exp.includes(x)).join(','));
  check('导出按钮可点（有勾选项）', /导出<\/button>/.test(exp.replace(/>\s+</g, '><')) || exp.includes('el-button--warning'));
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
fs.unlinkSync(depsFile);
await server.close();
process.exit(fails.length ? 1 : 0);
