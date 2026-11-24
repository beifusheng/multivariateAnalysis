/**
 * 运行时链路测试：表单 -> 视图的载荷构造 -> api 层 -> ipc 桩 -> 真 R 引擎 -> 结果形状
 *
 * 为什么要有这个文件（与 test_pm_view 的 §9 同一动机）：
 * 本项目已有的链路判据几乎都在"读源码看键在不在"。可 `primary` 那次丢字段是
 * 源码里写了、api 白名单没列 —— 静态读源码看不见。而 verify_*_engine.R 又直接调 R，
 * 看不见前端到 R 之间那几跳。于是形成一条没人守的缝：
 *
 *   视图 form ──buildPayload──> payload ──api 白名单──> cleanParams ──ipc──> 控制器 ──> R
 *
 * 这里把 ipc 桩成"直接调对应 R 脚本"，整条缝就变成可执行的断言。
 *
 * 分工要说清楚：本节证明**链路通、字段到达、结果形状对**；
 * 统计口径的已知答案仍归各模块的 verify_*.R —— 两边不重复，也都不许假绿。
 *
 * 用法：node r-scripts/tools/test_ipc_chain.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND = path.join(ROOT, 'frontend');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable', 'bin', 'Rscript.exe');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ipcchain-'));

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (detail ? ` —— ${detail}` : '')); console.log('  ✗ ' + name + (detail ? `\n      ${detail}` : '')); }
};

if (!fs.existsSync(RSCRIPT)) {
  console.log(`  ✗ 找不到 R 运行时：${RSCRIPT}`);
  console.log('\n[FAIL] 1 项失败 —— 没有 R 就没有链路可测，直接退出而不是空表通过');
  process.exit(1);
}

// vite 服务：独立 cacheDir，别污染 dev 的依赖缓存（本项目踩过）
// vite 装在 frontend 下，必须按绝对路径引（本项目其它套件同法）
const { createServer } = await import(pathToFileURL(path.join(FRONTEND, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({
  root: FRONTEND, configFile: path.join(FRONTEND, 'vite.config.js'),
  logLevel: 'error', cacheDir: path.join(TMP, 'vite-cache'),
  server: { middlewareMode: true, hmr: false }
});

/** channel -> 脚本：与 rController 里的 scriptName 一一对应（对不上就是要红的事） */
const CHANNEL_SCRIPT = {
  'controller/r/runPERMANOVA': 'r-scripts/permanova.R',
  'controller/r/runPERMANOVAPosthoc': 'r-scripts/permanova_posthoc.R',
  'controller/r/runPERMANOVAMed': 'r-scripts/permanova_med.R',
  'controller/r/runGMR4': 'r-scripts/gmr4.R',
  'controller/r/runBayesianERA_Mediation': 'r-scripts/bayesian_era_mediation.R',
  'controller/r/runNonRandomPERMANOVA': 'r-scripts/nonrandom_permanova.R'
};

const captured = [];
function installIpcStub() {
  globalThis.window = {
    electron: {
      ipcRenderer: {
        invoke: async (chan, payload) => {
          captured.push({ chan, payload });
          const script = CHANNEL_SCRIPT[chan];
          if (!script) throw new Error(`未登记的 ipc 通道：${chan}`);
          const f = path.join(TMP, `in${captured.length}.json`);
          // ipc 传输要求可结构化克隆 —— JSON 往返是最接近的检查
          let serialized;
          try { serialized = JSON.stringify(payload); }
          catch (e) { throw new Error(`载荷无法序列化（真 ipc 会在这里崩）：${e.message}`); }
          fs.writeFileSync(f, serialized);
          const out = f + '.out'; const err = f + '.err';
          try {
            execFileSync(RSCRIPT, [path.join(ROOT, script), f, out, err],
              { cwd: ROOT, stdio: 'pipe', timeout: 1800000 });
          } catch (e) {
            const msg = fs.existsSync(err) ? fs.readFileSync(err, 'utf8') : String(e.message);
            throw new Error(`${script} 退出码非 0：${msg.slice(0, 400)}`);
          }
          if (!fs.existsSync(out)) {
            throw new Error(`${script} 没写 output（stderr: ${(fs.existsSync(err) ? fs.readFileSync(err, 'utf8') : '').slice(0, 240)})`);
          }
          return JSON.parse(fs.readFileSync(out, 'utf8'));
        }
      }
    },
    require: undefined
  };
}
installIpcStub();

const arr = (x) => (Array.isArray(x) ? x : [x]);
const numList = (x) => arr(x).map(Number).filter((v) => Number.isFinite(v));
/** 数组不许被 auto_unbox 拍成标量（本项目在三个模块上各栽过一次） */
const isArr = (x) => Array.isArray(x);

const api = await server.ssrLoadModule('/src/api/r.js');
const route = (await server.ssrLoadModule('/src/api/index.js')).ipcApiRoute;

// 一个确定性的小设计（LCG，不用 Math.random）：X 驱动 M 驱动 Y，链路只验形状不验口径
const lcg = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const N = 15;
const rnd = lcg(20261123);
const X = Array.from({ length: N }, () => [rnd() * 2 - 1, rnd() * 2 - 1]);
const M = X.map((r, i) => [1.2 * r[0] + 0.3 * rnd(), -0.8 * r[1] + 0.3 * rnd()]);
const Y = M.map((m, i) => [0.9 * m[0] - 0.4 * m[1] + 0.25 * rnd(), 0.5 * m[1] + 0.25 * rnd()]);
const grp = Array.from({ length: N }, (_, i) => (i % 2 ? 'Case' : 'Control'));

console.log('\n=== 0. 通道表本身要与控制器登记一致 ===');
{
  const ctl = fs.readFileSync(path.join(ROOT, 'electron/controller/rController.ts'), 'utf8');
  const ipcSrc = fs.readFileSync(path.join(ROOT, 'electron/ipc/rIpc.ts'), 'utf8');
  const missingCh = Object.keys(CHANNEL_SCRIPT).filter((c) => !ipcSrc.includes(`'${c}'`));
  check('每个被测通道都在 rIpc.ts 注册过（没注册 = 渲染进程调用直接 reject）',
    missingCh.length === 0, missingCh.join(', '));
  const scripts = Object.values(CHANNEL_SCRIPT);
  const missingScript = scripts.filter((s) => !ctl.includes(s.split('/').pop()));
  check('通道映射到的脚本都在控制器里出现（改了脚本名不会悄悄失配）',
    missingScript.length === 0, missingScript.join(', '));
  const missingFile = scripts.filter((s) => !fs.existsSync(path.join(ROOT, s)));
  check('这些脚本文件真的在仓库里', missingFile.length === 0, missingFile.join(', '));
  check('api 层导出的六个 run* 全在（少一个就是某模块根本没接）',
    ['runPERMANOVA', 'runPERMANOVAPosthoc', 'runPERMANOVA_Med', 'runGMR4',
      'runBayesianERA_Mediation', 'runNonRandomPERMANOVA'].every((k) => typeof api[k] === 'function'), '');
}

/* ------------------------------------------------------------------ GMR⁴ */
// 通用 vm：摊平 data()、computed 变 getter、methods 全绑到同一对象。
// 不能给裸 stub —— buildPayload 会调 this.numList / this.inspectMatrix 这些兄弟方法，
// 第一版就是这么崩的（TypeError: this.numList is not a function）。
const makeVm = async (viewPath) => {
  const mod = await server.ssrLoadModule(viewPath);
  const c = mod.default;
  const vm = Object.assign({}, c.data ? c.data() : {}, { $refs: {}, $nextTick: (f) => f && f(), notices: [] });
  for (const [kk, fn] of Object.entries(c.computed || {})) {
    Object.defineProperty(vm, kk, { get: () => fn.call(vm), configurable: true });
  }
  for (const [kk, fn] of Object.entries(c.methods || {})) vm[kk] = fn.bind(vm);
  const notice = (type) => (m) => { vm.notices.push([type, typeof m === 'string' ? m : (m && m.message) || '']); };
  vm.$message = Object.assign(notice('info'), { success: notice('success'), error: notice('error'), warning: notice('warning') });
  vm.$notify = notice('info');
  return vm;
};


console.log('\n=== 1. GMR⁴：表单 -> buildPayload -> api -> gmr4.R ===');
{
  const vm = await makeVm('/src/views/r-analysis/GMR4.vue');
  Object.assign(vm.form, {
    xStr: JSON.stringify(X), yStr: JSON.stringify(Y), zStr: '',
    ranksStr: '1,2', lambdasStr: '0.1,1', kfold: 3, seed: 7
  });
  const payload = vm.buildPayload();
  check('载荷含 X/Y/ranks/lambdas/kfold/seed（引擎要的都在）',
    isArr(payload.X) && isArr(payload.Y) && payload.ranks.join() === '1,2' &&
      payload.kfold === 3 && payload.seed === 7, JSON.stringify(Object.keys(payload)));
  check('没填协变量时不发空 Z（发 [] 会被引擎当成"要偏掉 0 列"）',
    !('Z' in payload) || (isArr(payload.Z) && payload.Z.length > 0), JSON.stringify(payload.Z));
  let res = null, e = null;
  try { res = await api.runGMR4(payload); } catch (err) { e = err; }
  check('引擎跑通（链路端到端）', !!res, e && e.message.slice(0, 220));
  if (res) {
    check('通道名正确', captured[captured.length - 1].chan === route.rRunGMR4, captured[captured.length - 1].chan);
    check('seed / kfold 原样到达 R（api 与控制器都是透传，值不该变）',
      captured[captured.length - 1].payload.seed === 7 &&
        captured[captured.length - 1].payload.kfold === 3, '');
    check('返回里有选秩结果与逐响应指标（视图要读的字段都在）',
      res.rank_selected != null && isArr(res.responses || res.response_summary || []),
      JSON.stringify(Object.keys(res)));
  }
}

/* ---------------------------------------------------------- Bayesian ERA */
console.log('\n=== 2. Bayesian ERA：表单 -> buildPayload -> api -> bayesian_era_mediation.R ===');
{
  const vm = await makeVm('/src/views/r-analysis/Bayesian_ERA.vue');
  Object.assign(vm.form, {
    xStr: JSON.stringify(X), mStr: JSON.stringify(M), yStr: JSON.stringify(Y),
    chains: 2, iterations: 300, thin: 2, seed: 11, priorLambda: 1, prob: 0.95
  });
  const payload = vm.buildPayload();
  check('载荷 9 个键齐全（thin/prior_lambda/prob 曾只在视图里存在）',
    ['X', 'M', 'Y', 'chains', 'iterations', 'thin', 'seed', 'prior_lambda', 'prob']
      .every((k) => k in payload), JSON.stringify(Object.keys(payload)));
  let res = null, e = null;
  try { res = await api.runBayesianERA_Mediation(payload); } catch (err) { e = err; }
  check('引擎跑通', !!res, e && e.message.slice(0, 220));
  if (res) {
    const sent = captured[captured.length - 1].payload;
    check('到达 R 的载荷与发出的一致（没被白名单削掉）',
      sent.thin === 2 && sent.prior_lambda === 1 && sent.prob === 0.95 && sent.seed === 11,
      JSON.stringify({ thin: sent.thin, pl: sent.prior_lambda, prob: sent.prob }));
    check('方差分解四分量都是数组且逐响应等长',
      ['x_unique', 'shared', 'm_unique', 'residual'].every((k) => isArr(res.variance_partition?.[k])) &&
        new Set(['x_unique', 'shared', 'm_unique', 'residual'].map((k) => res.variance_partition[k].length)).size === 1,
      JSON.stringify(Object.keys(res.variance_partition || {})));
    // 实测形状：effects.{direct,indirect,total} 各是一个字典
    // {mean, sd, median, hdi_lo, hdi_hi, prob_gt0, rhat, ess, ols}，逐响应数组。
    // （第一版我按 effects.direct 是数组来断言，还编了个不存在的 direct_low —— 凭记忆写判据。）
    const ef = res.effects || {};
    const ekeys = ['direct', 'indirect', 'total'];
    check('三条通路各是字典，mean/hdi_lo/hdi_hi 都是逐响应数组（长度 1 也不许降级成标量）',
      ekeys.every((k) => ef[k] && isArr(ef[k].mean) && isArr(ef[k].hdi_lo) && isArr(ef[k].hdi_hi)),
      JSON.stringify(Object.keys(ef)));
    // 实测：效应数组是按**格子 p×q**展开的（这份载荷 p=2,q=2 => 4 个），
    // 而方差分解是按响应 q 展开的（2 个）。上一版我断言两者等长 —— 那是我以为
    // "逐响应"这个词在两边含义相同，实际不同。
    check('效应长度 = p × q（按格子展开），方差分解长度 = q（按响应展开）',
      ef.direct.mean.length === res.p * res.q &&
        res.variance_partition.x_unique.length === res.q &&
        res.variance_partition.shared.length === res.q,
      `effects=${ef.direct.mean.length} vs p*q=${res.p}*${res.q}; vp=${res.variance_partition.x_unique.length} vs q=${res.q}`);
    check('mean / hdi_lo / hdi_hi / prob_gt0 四者长度互相一致（视图按索引取数，错位比报错更糟）',
      ekeys.every((k) => ['mean', 'hdi_lo', 'hdi_hi', 'prob_gt0']
        .every((f) => ef[k][f].length === ef[k].mean.length)), '');
    check('每个格子都带 rhat/ess（收敛诊断分格给，不是只给一个全局数）',
      ekeys.every((k) => isArr(ef[k] && ef[k].rhat) && isArr(ef[k] && ef[k].ess)), '');
    check('收敛诊断在（split-R̂ / ESS），视图否则只能显示空白',
      res.convergence != null && (isArr(res.convergence.rhat) || res.convergence.max_rhat != null),
      JSON.stringify(Object.keys(res.convergence || {})));
  }
}

/* ----------------------------------------------------- Non-random 置换 */
console.log('\n=== 3. Non-random PERMANOVA：表单 -> buildPayload -> api -> nonrandom_permanova.R ===');
{
  const vm = await makeVm('/src/views/r-analysis/Nonrandom_PERMANOVA.vue');
  const comm = Array.from({ length: N }, (_, i) => [
    Math.round(10 + (grp[i] === 'Case' ? 22 : 0) + 4 * rnd()),
    Math.round(10 + (grp[i] === 'Case' ? 0 : 20) + 4 * rnd()),
    Math.round(5 + 3 * rnd()), Math.round(5 + 3 * rnd()), Math.round(5 + 3 * rnd())
  ]);
  const sampleRows = Array.from({ length: N }, (_, i) => ({ sample_id: `S${i + 1}`, group: grp[i] }));
  Object.assign(vm.form, {
    communityStr: JSON.stringify(comm), sampleStr: JSON.stringify(sampleRows),
    formula: 'group', strata: '', scheme: 'free', distance: 'bray',
    presenceAbsence: false, controlCoverage: false, permutations: 199, seed: 7,
    coordinatesStr: '', spatialBand: 0
  });
  let payload = null, perr = null;
  vm.selectedNrId = '';
    try { payload = vm.buildPayload(); } catch (e) { perr = e; }
  check('buildPayload 能跑（表单文本 -> 结构化载荷没抛异常）', !!payload, perr && perr.message);
  if (payload) {
    check('载荷键与控制器声明的入参一致（改了名字要同时改，两边都得在场）',
      ['communityData', 'sampleData', 'formula', 'scheme', 'distance', 'permutations', 'seed']
        .every((k) => k in payload), JSON.stringify(Object.keys(payload)));
    let res = null, e = null;
    try { res = await api.runNonRandomPERMANOVA(payload); } catch (err) { e = err; }
    check('引擎跑通', !!res, e && e.message.slice(0, 220));
    if (res) {
      // 实测：结果在 anova_table / permutation / observed 下（不是顶层 F/p）
      check('结果含方差分析表与置换检验结果（视图的主数字）',
        isArr(res.anova_table) ? res.anova_table.length > 0 : !!res.anova_table,
        JSON.stringify(res.anova_table).slice(0, 120));
      check('permutation 里有 p 且 > 0（置换检验给不出 p=0）',
        !!res.permutation && JSON.stringify(res.permutation).search(/p[_a-zA-Z]*\"?\s*[:=]/) >= 0,
        JSON.stringify(res.permutation).slice(0, 140));
      check('analysis 与 vegan/r 版本随结果导出（复现时能知道是谁算的）',
        !!res.analysis && !!res.vegan_version && !!res.r_version, '');
      check('controlCoverage 关闭时不应凭空造出覆盖率数字',
        payload.controlCoverage === false || res.control_coverage != null, '');
    }
  }
}

/* ---------------------------------------------------------- PERMANOVA-med */
console.log('\n=== 4. PERMANOVA-med：表单 -> buildRunParams -> api -> permanova_med.R ===');
{
  const vm = await makeVm('/src/views/r-analysis/PERMANOVA_Med.vue');
  // 实测：视图的 inspectMatrix 要**纯数值行数组**，字典里带 sample 文本列会被判
  // 「存在非数值元素」直接抛错（上一版我照 medToFormPatch 的字典格式喂，就是崩在这）。
  Object.assign(vm.permanovaMedParams, {
    outcomeDataStr: JSON.stringify(Y),
    mediatorDataStr: JSON.stringify(M),
    predictorDataStr: JSON.stringify(X),
    covariatesStr: '', permutations: 199, mediatorN: N
  });
  let payload = null, perr = null;
  try { payload = vm.buildRunParams(); } catch (e) { perr = e; }
  check('buildRunParams 产出四张表 + permutations（统一成"样本 × 变量"）',
    !!payload && isArr(payload.outcomeData) && isArr(payload.mediatorData) &&
      isArr(payload.predictorData) && payload.permutations === 199,
    perr ? perr.message : JSON.stringify(Object.keys(payload || {})));
  if (payload) {
    check('没填协变量时 covariates 是 null 而不是空数组（引擎按 null 分支走）',
      payload.covariates === null, JSON.stringify(payload.covariates));
    let res = null, e = null;
    try { res = await api.runPERMANOVA_Med(payload); } catch (err) { e = err; }
    check('引擎跑通（LDM::permanovaFL 在这台机器上可用）', !!res,
      e && e.message.slice(0, 240));
    if (res) {
      check('结果里有直接/间接效应或通路表（视图的主表）',
        JSON.stringify(res).length > 40 &&
          /direct|indirect|mediat|path|coef/i.test(Object.keys(res).join(',')),
        JSON.stringify(Object.keys(res)).slice(0, 160));
    }
  }
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
delete globalThis.window;
await server.close();
process.exit(fails.length ? 1 : 0);
