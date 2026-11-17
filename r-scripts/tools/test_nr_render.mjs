#!/usr/bin/env node
/**
 * Nonrandom_PERMANOVA.vue 的 SSR 渲染冒烟测试
 * ---------------------------------------------------------------
 * npm run build 只编译模板，不执行它。下面这些只有真渲染才会暴露：
 *   - 子组件/图标没注册（Vue 只在运行时 warn，界面表现为「按钮在、图标空」）
 *   - 计算属性抛异常（结果区直接白屏）
 *   - v-for 遍历 undefined
 * 做法：Vite SSR 管线加载 .vue，把真跑 R 得到的 analysisResult 塞进 data，
 * renderToString 之后对 HTML 里的关键文案做断言。
 *
 *   node r-scripts/tools/test_nr_render.mjs
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nrrender-'));

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (detail ? ` —— ${detail}` : '')); console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
};

const { nonrandomTemplates: nrt } = await loadFrontendUtils(['nonrandomTemplates']);
const built = nrt.buildNonrandomTemplateData(nrt.NR_TEMPLATE_MAP.confoundedBlock.spec);
const f = path.join(TMP, 'x.json');
fs.writeFileSync(f, JSON.stringify(built.payload));
execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/nonrandom_permanova.R'), f, f + '.out', f + '.err'], { stdio: 'pipe', timeout: 180000 });
const result = JSON.parse(fs.readFileSync(f + '.out', 'utf8'));

const { createServer } = await import(pathToFileURL(path.join(FRONTEND, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({
  root: FRONTEND,
  configFile: path.join(FRONTEND, 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error'
});

// 依赖统一走 Vite 的 SSR 管线拿，不能用 createRequire：
// @vue/server-renderer 的 CJS 入口会 require('vue') 拿到 CJS 版 vue，
// 而组件用的是 Vite 解出的 ESM 版 —— 两份 Vue 实例会让 renderToString 直接报错。
const depsFile = path.join(FRONTEND, '.nr-ssr-deps.js');
fs.writeFileSync(depsFile, [
  "export { createSSRApp } from 'vue';",
  "export { renderToString } from '@vue/server-renderer';",
  "export { default as ElementPlus } from 'element-plus';"
].join('\n') + '\n');
const deps = await server.ssrLoadModule('/.nr-ssr-deps.js');
const vue = { createSSRApp: deps.createSSRApp };
const { renderToString } = deps;
const ElementPlus = deps.ElementPlus;


// 渲染期间的 warn/error 一律算失败：图标没注册这类问题就是这样悄悄出现的
const warnings = [];
const origWarn = console.warn;
const origErr = console.error;
const capture = (...a) => warnings.push(a.map(String).join(' '));

const views = await server.ssrLoadModule('/src/views/r-analysis/Nonrandom_PERMANOVA.vue');
const Comp = views.default;

/** 用给定状态渲染整页；dataOverride 深合并到组件 data() 结果上 */
const render = async (tag, dataOverride) => {
  warnings.length = 0;
  const Wrapped = {
    ...Comp,
    data() {
      const d = Comp.data.call(this);
      return { ...d, ...dataOverride(d) };
    }
  };
  const app = vue.createSSRApp(Wrapped);
  app.use(ElementPlus);
  app.config.warnHandler = (msg, instance, trace) => {
    // 带上是哪个组件，否则「Invalid prop: value」根本查不到源头
    const name = instance?.type?.name || instance?.$?.type?.name || instance?.subTree?.type?.name || '?';
    const where = (trace || '').split('\n').slice(1, 3).join(' < ').trim();
    capture(`[warn] ${msg} @${name} ${where}`);
  };
  app.config.errorHandler = (e) => capture('[error] ' + (e && e.message));
  app.mixin({ created() { } });
  // 视图里有 $router.push（返回按钮）：SSR 下没有 router，给个替身
  app.config.globalProperties.$router = { push: () => { } };
  app.config.globalProperties.$refs = {};
  console.warn = capture; console.error = capture;
  let html = '';
  let threw = null;
  try {
    html = await renderToString(app);
  } catch (e) {
    threw = e;
  } finally {
    console.warn = origWarn; console.error = origErr;
  }
  if (threw) check(`${tag} 渲染未抛异常`, false, threw.message);
  else check(`${tag} 渲染未抛异常`, true);
  const noisy = warnings.filter((w) => /Failed to resolve component|Invalid prop|Missing required prop/.test(w));
  check(`${tag} 无「组件未注册 / prop 非法」告警`, noisy.length === 0, noisy.slice(0, 3).join(' | '));
  return html;
};

console.log('=== 空态 ===');
{
  const html = await render('空态', () => ({}));
  check('标题渲染', html.includes('Non-random PERMANOVA（受限置换）'));
  check('返回按钮渲染', html.includes('返回首页'));
  check('工具栏渲染', html.includes('下载数据') && html.includes('导出结果'));
  check('数据模板区渲染 26 个按钮', (html.match(/btn-template/g) || []).length >= 26,
    String((html.match(/btn-template/g) || []).length));
  check('模板分组标题渲染', html.includes('教学：置换方案为什么会改变结论') && html.includes('水体与海洋'));
  check('未运行时无结果区', !html.includes('分析结果'));
  check('运行按钮存在且禁用', /运行分析/.test(html) && /is-disabled/.test(html));
}

console.log('\n=== 载入模板后 ===');
{
  const p = built.payload;
  const html = await render('模板态', (d) => ({
    selectedNrId: 'confoundedBlock',
    nrSummary: built.design,
    form: {
      ...d.form,
      communityStr: JSON.stringify(p.communityData),
      sampleStr: JSON.stringify(p.sampleData),
      scheme: 'stratified',
      strata: 'strata',
      formula: 'group',
      distance: 'bray',
      permutations: 999
    }
  }));
  check('显示当前设计模板', html.includes('当前设计模板'));
  check('显示预期结论（供与实跑对照）', html.includes('自由置换 显著，受限置换 不显著'),);
  check('结构说明含区组与混淆度', /个区组/.test(html) && /混淆度/.test(html));
  check('输入卡校验状态变为有效', html.includes('✓') && /30 物种/.test(html), );
}

console.log('\n=== 带真实 R 结果 ===');
{
  const p = built.payload;
  const html = await render('结果态', (d) => ({
    analysisResult: result,
    form: {
      ...d.form,
      communityStr: JSON.stringify(p.communityData),
      sampleStr: JSON.stringify(p.sampleData),
      scheme: 'stratified',
      strata: 'strata',
      formula: 'group'
    }
  }));
  check('结果区渲染', html.includes('分析结果'));
  check('主 p 值用受限置换', html.includes(result.observed.p_constrained.toFixed(4)), String(result.observed.p_constrained));
  check('结论标为不显著', html.includes('组间差异不显著'));
  check('假阳性告警出现', html.includes('自由置换显著、受限置换不显著'));
  check('告警里带上两个 p', new RegExp(`p\\(自由\\)=${String(result.observed.p_free).slice(0, 5)}`).test(html));
  check('置换方案对比卡出现', html.includes('置换方案对比') && html.includes('假阳性被纠正'));
  check('逐术语表出现 group 行', html.includes('>group<'));
  check('置换执行情况出现', html.includes('置换执行情况') && html.includes('可用区组'));
  check('模型信息含公式与距离', html.includes('group') && /Bray-Curtis/.test(html));
  check('四个图表 tab 都在', ['零分布对比', '结论对比', 'PCoA 排序', '解释量分解'].every((t) => html.includes(t)));
  check('解释文案来自 R（不是前端写死）', html.includes(result.interpretation.slice(0, 12)), result.interpretation.slice(0, 40));
}

await server.close();
fs.rmSync(depsFile, { force: true });
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) {
  console.log('\n失败项:');
  fails.forEach((x) => console.log('  - ' + x));
}
process.exit(fail ? 1 : 0);
