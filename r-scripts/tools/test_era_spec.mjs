#!/usr/bin/env node
/**
 * eraSheetSpec.js（Bayesian ERA 的 L3 声明 + 模板 + 导出计划器）回归
 * ---------------------------------------------------------------
 *   node r-scripts/tools/test_era_spec.mjs
 *
 * 这份套件里最重要的不是"形状对不对"，而是第 3 段：**六个模板逐个真跑对账**。
 * 它必须在视图之前就存在。理由有两条现案的：
 *  - GMR⁴ 的 rank1 模板写着"真实秩 1 / R²>0.9"，实跑是 S=2 / 0.881 —— 那个循环写完
 *    第一次跑就抓到，说明"模板声称教什么"这件事此前从来没被验过；
 *  - GMR⁴「导入后参数进不了表单」是两个 bug 叠在一起，其中补丁键名与表单字段名不符
 *    那一半，正是因为没有任何一处知道两边是否一致。
 *
 * 所以本文件有三条别的套件没有的硬断言：
 *  1) eraToFormPatch 发出的键必须 ⊆ ERA_FORM_FIELDS（视图还没写，先把契约钉住）；
 *  2) 模板 expect 的每一个键都必须被对账器**消费**，出现不认识的键当场红
 *     （装饰品判据 = 没有判据）；
 *  3) 后验区间要覆盖的是**标准化尺度**真值（原始尺度比标准化 = 37.5% 那种假事故）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable/bin/Rscript.exe');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'eraspec-'));
const require_ = createRequire(import.meta.url);

// 对账器认识的 expect 键清单。§2 用它拒绝未知键（拼错的判据 = 没有判据），
// §3 用它逐键消费。两处共用一份清单，避免"§2 放行、§3 沉默"。
const JUDGED = ['indirect_excl_zero_min', 'indirect_excl_zero_max', 'direct_excl_zero_min',
  'direct_contains_zero_min', 'sign_inconsistent_min', 'total_contains_zero_min',
  'r2_xm_min', 'convergence_ok', 'must_warn', 'must_refuse', 'shrinkage', 'prob_effect'];

let pass = 0, fail = 0;
const fails = [];
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ` —— ${extra}` : '')); console.log(`  ✗ ${name}\n      ${String(extra).slice(0, 240)}`); }
};

const { eraSheetSpec: spec, sheetIo } = await loadFrontendUtils(['eraSheetSpec', 'sheetIo']);
const XLSX = require_(path.join(ROOT, 'frontend/node_modules/xlsx'));

console.log('\n=== 1. 声明本身（视图的外壳靠这些字段循环）===');
{
  t('四张导入表，X/M/Y 全必填、参数可选',
    spec.ERA_IMPORT_SHEETS.length === 4 &&
      spec.ERA_IMPORT_SHEETS.filter((s) => s.required).map((s) => s.key).join(',') === 'X,M,Y',
    JSON.stringify(spec.ERA_IMPORT_SHEETS.map((s) => [s.key, s.required])));
  // 中介分析没有 M 就退化成普通回归：这条"必填"是业务规则，不是格式偏好
  t('M 表必须 required=true（没有中介就不是中介分析了，不许静默退化）',
    spec.ERA_IMPORT_SHEETS.find((s) => s.key === 'M').required === true, '');
  t('三张数据表都是 matrix kind（sheetIo 只认 sample/coordinate/matrix）',
    spec.ERA_IMPORT_SHEETS.filter((s) => s.key !== 'params').every((s) => s.kind === 'matrix'), '');
  t('每张表都有 aliasHint 与 desc（缺了提示文案就退化成"缺少表"）',
    spec.ERA_IMPORT_SHEETS.every((s) => s.aliasHint && s.desc));
  t('预览 tab 四张、params 是 onlyWhenData',
    spec.ERA_PREVIEW_TABS.length === 4 &&
      spec.ERA_PREVIEW_TABS.filter((x) => x.onlyWhenData).map((x) => x.key).join(',') === 'params', '');
  t('导出项 4 个且都有 label/type/fileTag',
    spec.ERA_EXPORT_OPTIONS.length === 4 && spec.ERA_EXPORT_OPTIONS.every((o) => o.label && o.type && o.fileTag));
  t('默认勾选项都在可选项里', spec.ERA_EXPORT_DEFAULTS.every((k) => spec.ERA_EXPORT_OPTIONS.some((o) => o.key === k)));
  t('纯函数：不碰 DOM、不 import file-saver（否则 Node 里根本测不了）',
    !/^\s*import\s+.*(file-saver|dom)/m.test(fs.readFileSync(path.join(ROOT, 'frontend/src/utils/eraSheetSpec.js'), 'utf8')), '');
  t('随机源不自己抄一份（统一走 utils/rng.js）',
    /from '\.\/rng\.js'/.test(fs.readFileSync(path.join(ROOT, 'frontend/src/utils/eraSheetSpec.js'), 'utf8')) &&
      !/function (lcg|mulberry32)\(/.test(fs.readFileSync(path.join(ROOT, 'frontend/src/utils/eraSheetSpec.js'), 'utf8')),
    '自己实现一份随机源 = 两套可复现性');
}

console.log('\n=== 2. 模板目录与设计事实（不跑 R 也能验的那部分）===');
const ids = Object.keys(spec.ERA_TEMPLATE_MAP);
{
  t('十个模板，顺序与分组写死（加/删模板必须同时动对账器）',
    ids.length === 10 && ids.length === spec.ERA_TEMPLATE_COUNT &&
      ids.join(',') === 'fullmed,partmed,strongprior,prob80,nome,inconsistent,collinear,highdim,nonconv,smallN', ids.join(','));
  // label 上的数字必须与 spec 一致：rank1 曾写"80 样本"而 spec 是 40，用户照文案准备数据就踩空
  const badLabel = ids.filter((id) => {
    const sp = spec.ERA_TEMPLATE_MAP[id].spec;
    const m = /（(\d+) 样本 × (\d+) 预测 × (\d+) 中介 × (\d+) 响应/.exec(spec.ERA_TEMPLATE_MAP[id].label);
    return !m || +m[1] !== sp.n || +m[2] !== sp.p || +m[3] !== sp.k || +m[4] !== sp.q;
  });
  t('label 里的 n/p/k/q 四个数字与 spec 逐个一致', badLabel.length === 0, badLabel.join(','));

  const unknown = [];
  ids.forEach((id) => Object.keys(spec.ERA_TEMPLATE_MAP[id].spec.expect)
    .forEach((kk) => { if (!JUDGED.includes(kk)) unknown.push(`${id}:${kk}`); }));
  t('expect 里没有对账器不认识的键（拼错的判据等于没有判据）', unknown.length === 0, unknown.join(','));

  t('模板是确定性的：两次生成逐字节相同',
    JSON.stringify(spec.eraTemplateSheets('partmed')) === JSON.stringify(spec.eraTemplateSheets('partmed')), '');

  // 维度写错必须报错，而不是"看起来能跑"
  let threw = '';
  try { spec.buildEraDesign({ p: 2, k: 1, q: 2, gamma: [1, 1, 1], beta: [0, 0, 0, 0], omega: [1, 1], n: 10, seed: 1, noiseM: .8, noiseY: .7 }); }
  catch (e) { threw = e.message; }
  t('Γ 长度与 p*k 不符必须报错（上一版就是靠 omega.length 反推维度猜错的）', /Γ 长度/.test(threw), threw || '没报错');

  // 设计事实：完全中介的直接真值必须精确为 0；无中介的间接必须精确为 0
  const fm = spec.eraTemplateTruth('fullmed');
  t('fullmed 的直接效应真值精确为 0（B=0 是设计事实，不是估出来的）',
    fm.direct.every((x) => x.v === 0) && fm.indirect.some((x) => x.v !== 0),
    JSON.stringify(fm.direct.map((x) => x.v)));
  const nm = spec.eraTemplateTruth('nome');
  t('nome 的间接效应真值精确为 0（这张表教的是"没有"也要说出口）',
    nm.indirect.every((x) => x.v === 0) && nm.direct.some((x) => x.v !== 0),
    JSON.stringify(nm.indirect.map((x) => x.v)));
  const ic = spec.eraTemplateTruth('inconsistent');
  t('inconsistent 的直接与间接真值符号相反（遮掩效应的定义）',
    ic.direct.length === 1 && ic.indirect.length === 1 &&
      Math.sign(ic.direct[0].v) !== Math.sign(ic.indirect[0].v) &&
      Math.abs(ic.direct[0].v + ic.indirect[0].v) < Math.abs(ic.direct[0].v) * 0.6,
    JSON.stringify([ic.direct[0].v.toFixed(3), ic.indirect[0].v.toFixed(3)]));
  t('partmed 故意留了一个直接真值为 0 的格子（防止"全部显著"式的自嗨）',
    spec.eraTemplateTruth('partmed').direct.filter((x) => x.v === 0).length === 1,
    JSON.stringify(spec.eraTemplateTruth('partmed').direct.map((x) => +x.v.toFixed(3))));
  // 展平口径必须是"预测快 / 响应慢"，否则真值与后验各排各的队（spike 里踩过）
  const hd = spec.eraTemplateTruth('highdim');
  t('真值展平顺序 = X 快 / Y 慢（第 2 个格子必须是 X2→Y1）',
    hd.indirect[0].j === 0 && hd.indirect[0].c === 0 &&
      hd.indirect[1].j === 1 && hd.indirect[1].c === 0 &&
      hd.indirect[hd.p].j === 0 && hd.indirect[hd.p].c === 1,
    JSON.stringify(hd.indirect.slice(0, 4).map((x) => `X${x.j + 1}Y${x.c + 1}`)));
}

console.log('\n=== 3. 六个模板逐个端到端：真 xlsx → 解析 → 填表 → 真跑 R → 逐键对账 ===');
{
  // 与视图一致地走"真 xlsx 字节"。这里不复用 sheetIo.readWorkbook：
  // 它内部 await import('xlsx')，而 loadFrontendUtils 的临时目录解析不到 frontend/node_modules
  // （视图套件能跑是因为走 vite 的 ssrLoadModule）。所以下面按 readWorkbook 的实现逐行复刻。
  const toFile = (sheets, name) => {
    const wb = XLSX.utils.book_new();
    for (const sh of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.aoa), sh.name);
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const rd = XLSX.read(buf, { type: 'array' });
    const out = {};
    for (const nm of rd.SheetNames) {
      out[nm] = XLSX.utils.sheet_to_json(rd.Sheets[nm], { header: 1, blankrows: false, defval: '' });
    }
    return out;
  };

  for (const id of ids) {
    const tpl = spec.ERA_TEMPLATE_MAP[id];
    const sp = tpl.spec;
    const exp = sp.expect;
    const tag = `[${id}]`;

    const sheets = spec.eraTemplateSheets(id);
    const parsed = toFile(sheets, `${id}.xlsx`);
    const res = sheetIo.mapWorkbook(parsed, spec.ERA_IMPORT_SHEETS, { primary: 'X' });
    t(`${tag} mapWorkbook 通过（三表按样本 ID 对齐）`, res.ok === true, res.error || '');
    if (!res.ok) continue;

    const tabs = spec.eraImportTabs(res.ids, res.fields);
    const wantCols = Array.from({ length: sp.p }, (_, i) => `X${i + 1}`).join(',');
    t(`${tag} 预览出 4 个 tab 且 X 的 cols 含变量名（表头在 columns 键）`,
      tabs.length === 4 && tabs[0].cols[0] === '样本' &&
        tabs[0].cols.slice(1).join(',') === wantCols,
      `${tabs[0].cols.join(',')} vs 期望 ${wantCols}`);
    t(`${tag} 预览行是 {列:值} 对象数组（ImportDialog 用 :prop 取值）`,
      Object.keys(tabs[0].rows[0]).length === sp.p + 1 && Number.isFinite(tabs[0].rows[0].X1),
      JSON.stringify(tabs[0].rows[0]));

    // spec 内部对"发出不存在的键"是直接 throw（生产里fail fast 是对的），
    // 但测试不能因此把整个套件炸掉：接住它，变成一条红。
    let patch = null, patchErr = '';
    try { patch = spec.eraToFormPatch(res.fields); } catch (e) { patchErr = e.message; }
    const stray = patch ? Object.keys(patch).filter((kk) => !spec.ERA_FORM_FIELDS.includes(kk)) : [];
    t(`${tag} eraToFormPatch 的键全在 ERA_FORM_FIELDS 里（视图还不存在，先把契约钉住）`,
      patchErr === '' && stray.length === 0,
      patchErr ? `spec 自己抛了：${patchErr}` : `多出来的键：${stray.join(',')}`);
    if (!patch) continue;
    t(`${tag} 参数进的是表单字段名（priorLambda 而不是 prior_lambda，chains/iterations/thin/seed/prob 齐）`,
      patch.chains === sp.chains && patch.iterations === sp.iterations && patch.thin === sp.thin &&
        patch.seed === sp.seed && patch.prob === sp.prob && patch.priorLambda === sp.priorLambda,
      JSON.stringify([patch.chains, patch.iterations, patch.thin, patch.seed, patch.priorLambda, patch.prob]));
    t(`${tag} 三张数据表都进了表单且形状 = n×p / n×k / n×q`,
      (() => {
        const X = JSON.parse(patch.xStr), M = JSON.parse(patch.mStr), Y = JSON.parse(patch.yStr);
        return X.length === sp.n && X[0].length === sp.p && M.length === sp.n && M[0].length === sp.k &&
          Y.length === sp.n && Y[0].length === sp.q;
      })(), JSON.stringify([JSON.parse(patch.xStr).length, JSON.parse(patch.mStr).length]));

    // 视图将来就是这么组 payload 的：表单字段名 -> 引擎参数名（改名只在这一处发生）
    const payload = {
      X: JSON.parse(patch.xStr), M: JSON.parse(patch.mStr), Y: JSON.parse(patch.yStr),
      chains: patch.chains, iterations: patch.iterations, thin: patch.thin,
      seed: patch.seed, prior_lambda: patch.priorLambda, prob: patch.prob
    };
    const fIn = path.join(TMP, `${id}.json`);
    fs.writeFileSync(fIn, JSON.stringify(payload));
    let code = 0;
    try {
      execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/bayesian_era_mediation.R'), fIn, fIn + '.out', fIn + '.err'],
        { stdio: 'pipe', timeout: 900000 });
    } catch (e) { code = e.status || 1; }
    if (exp.must_refuse) {
      // 这张模板的价值就在于**被拒绝**：不可识别的输入必须当场停下来并说清为什么。
      // 断言方向反过来，所以别的模板不能偷偷也带 must_refuse（§2 会查 expect 键）
      t(`${tag} 真被拒绝（exit≠0）而不是吐出一堆好看的区间`, code !== 0,
        code === 0 ? '居然大获成功，说明秩亏阈值没拦住' : '');
      const err = code !== 0 ? fs.readFileSync(fIn + '.err', 'utf8') : '';
      t(`${tag} 拒绝理由点名「${exp.must_refuse}」`, err.includes(exp.must_refuse), err.slice(0, 150));
      continue;
    }
    t(`${tag} 真跑通（exit=0）`, code === 0, code ? fs.readFileSync(fIn + '.err', 'utf8').slice(0, 200) : '');
    if (code !== 0) continue;
    const r = JSON.parse(fs.readFileSync(fIn + '.out', 'utf8'));

    // 形状先于内容：auto_unbox 会把长度 1 的向量降级成标量，q=1 的模板上
    // r.r2.XM 就成了一个数，后面每一处 .reduce/.filter 都会抛异常把整个套件炸掉。
    // 炸掉只有一条信息、还吃掉后面五个模板 —— 所以这里先验形状，不合格就记红并跳过。
    const ARR_PATHS = ['r2.X', 'r2.M', 'r2.XM', 'cell_labels', 'X_scale', 'M_scale', 'Y_scale',
      'effects.direct.mean', 'effects.direct.hdi_lo', 'effects.direct.hdi_hi', 'effects.direct.rhat',
      'effects.direct.ess', 'effects.direct.ols', 'effects.indirect.mean', 'effects.indirect.hdi_lo',
      'effects.indirect.prob_gt0', 'effects.total.mean', 'variance_partition.x_unique',
      'variance_partition.shared', 'variance_partition.residual', 'convergence.rhat', 'convergence.ess'];
    const dig = (obj, dotted) => dotted.split('.').reduce((o, kk) => (o == null ? o : o[kk]), obj);
    const degraded = ARR_PATHS.filter((pp) => !Array.isArray(dig(r, pp)));
    t(`${tag} 逐响应/逐格字段全是数组（长度 1 也不许降级成标量）`,
      degraded.length === 0, degraded.length ? `降级成了标量：${degraded.join(', ')}` : '');
    if (degraded.length) continue;

    // ---- 逐键消费 expect ----
    const truth = spec.eraTemplateTruth(id);
    const excl0 = (blk) => r.effects[blk].hdi_lo.filter((v, i) => v > 0 || r.effects[blk].hdi_hi[i] < 0).length;
    const incl0 = (blk) => r.effects[blk].hdi_lo.filter((v, i) => v <= 0 && r.effects[blk].hdi_hi[i] >= 0).length;
    const signFlip = () => r.effects.direct.mean.filter((v, i) =>
      Math.sign(v) !== Math.sign(r.effects.indirect.mean[i]) &&
      excl0Cell('direct', i) && excl0Cell('indirect', i)).length;
    function excl0Cell(blk, i) { return r.effects[blk].hdi_lo[i] > 0 || r.effects[blk].hdi_hi[i] < 0; }
    const meanR2 = r.r2.XM.reduce((a, b) => a + b, 0) / r.q;
    const diags = (r.diagnostics || []).map((d) => String(d));

    for (const [kk, vv] of Object.entries(exp)) {
      if (kk === 'indirect_excl_zero_min') {
        t(`${tag} expect 间接效应至少 ${vv} 格 HDI 不含 0（实得 ${excl0('indirect')}）`, excl0('indirect') >= vv, `${excl0('indirect')} vs ${vv}`);
      } else if (kk === 'indirect_excl_zero_max') {
        t(`${tag} expect 间接效应最多 ${vv} 格 HDI 不含 0（这张表要说"没有"）`, excl0('indirect') <= vv, `${excl0('indirect')} vs ${vv}`);
      } else if (kk === 'direct_excl_zero_min') {
        t(`${tag} expect 直接效应至少 ${vv} 格 HDI 不含 0（实得 ${excl0('direct')}）`, excl0('direct') >= vv, `${excl0('direct')} vs ${vv}`);
      } else if (kk === 'direct_contains_zero_min') {
        t(`${tag} expect 直接效应至少 ${vv} 格 HDI 含 0（完全中介的定义）`, incl0('direct') >= vv, `${incl0('direct')} vs ${vv}`);
      } else if (kk === 'sign_inconsistent_min') {
        t(`${tag} expect 至少 ${vv} 格直接/间接符号相反且都不含 0（遮掩效应）`, signFlip() >= vv, `${signFlip()} vs ${vv}`);
      } else if (kk === 'total_contains_zero_min') {
        t(`${tag} expect 总效应至少 ${vv} 格 HDI 含 0（"总效应不显著"必须真发生）`, incl0('total') >= vv, `${incl0('total')} vs ${vv}`);
      } else if (kk === 'r2_xm_min') {
        t(`${tag} expect 整体 R²(X,M) > ${vv}（模板必须真能解释点什么，实得 ${meanR2.toFixed(3)}）`, meanR2 > vv, `${meanR2.toFixed(4)} vs ${vv}`);
      } else if (kk === 'convergence_ok') {
        t(`${tag} expect 收敛达标（R̂max ${r.convergence.rhat_max.toFixed(4)} / ESSmin ${Math.round(r.convergence.ess_min)}）`,
          r.convergence.ok === vv, JSON.stringify(r.convergence).slice(0, 160));
      } else if (kk === 'shrinkage') {
        // 同一轮结果里自比：强先验必须把后验均值往 0 拉（实测 0.0716 vs OLS 0.4395）
        const pm = Math.max(...r.effects.indirect.mean.map((x) => Math.abs(x)));
        const po = Math.max(...r.effects.indirect.ols.map((x) => Math.abs(x)));
        t(`${tag} expect 强先验确实收缩了后验（max|后验| ${pm.toFixed(4)} vs max|OLS| ${po.toFixed(4)}）`,
          pm < po * 0.8, `比值 ${(pm / po).toFixed(3)}`);
      } else if (kk === 'prob_effect') {
        // 光看宽度数值证明不了 prob 生效（换个数也能凑）。这里用结果自带的后验抽样
        // 同时算 80% 与 95% 区间宽度：报告值必须贴着 80% 那一头，而不是 95%。
        const q = (a, pp) => {
          const b = a.slice().sort((x, y) => x - y);
          const i = (b.length - 1) * pp; const lo = Math.floor(i); const hi = Math.ceil(i);
          return b[lo] + (b[hi] - b[lo]) * (i - lo);
        };
        const rows = r.draws.ind;
        const wReport = r.effects.indirect.hdi_hi.map((h, i) => h - r.effects.indirect.hdi_lo[i]);
        const w80 = rows.map((row) => q(row, 0.9) - q(row, 0.1));
        const w95 = rows.map((row) => q(row, 0.975) - q(row, 0.025));
        const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
        t(`${tag} expect prob=0.8 真的生效（报告宽度 ${mean(wReport).toFixed(4)} ≈ 抽样 80% ${mean(w80).toFixed(4)}，且明显窄于 95% ${mean(w95).toFixed(4)}）`,
          Math.abs(mean(wReport) - mean(w80)) / mean(w80) < 0.15 && mean(wReport) < mean(w95) * 0.95,
          `report ${mean(wReport).toFixed(4)} / 80% ${mean(w80).toFixed(4)} / 95% ${mean(w95).toFixed(4)}`);
      } else if (kk === 'must_warn') {
        t(`${tag} expect 诊断里必须出现「${vv}」（小样本不许装作没事）`,
          diags.some((d) => d.includes(vv)), JSON.stringify(diags).slice(0, 200));
      } else {
        t(`${tag} expect 键「${kk}」无人消费（装饰品）`, false, `对账器只认：${JUDGED.join(' / ')}`);
      }
    }

    // ---- 三条与模板无关、但每个模板都必须成立的硬事实 ----
    t(`${tag} 恒等式 tot = dir + ind（引擎自报残差）`, r.identity_check.total_minus_parts < 1e-8,
      String(r.identity_check.total_minus_parts));
    // 覆盖的是**标准化尺度**真值：拿原始尺度比就是 37.5% 那种假事故
    const covInd = truth.indirect.filter((x, i) => r.effects.indirect.hdi_lo[i] <= x.v && x.v <= r.effects.indirect.hdi_hi[i]).length;
    const covDir = truth.direct.filter((x, i) => r.effects.direct.hdi_lo[i] <= x.v && x.v <= r.effects.direct.hdi_hi[i]).length;
    // 阈值 75% 是**算过再定的**：95% 区间在 4 格上"全中"的概率本来就只有约 0.81，
    // 把 100% 写进断言等于抽奖抽奖中了当本事。真正的校准检验在 verify_era_engine.R
    // 用跨重复的经验覆盖率做（95%/92.5%/97.5%），这里只验"设计没有跑偏"。
    // strongprior 这张表的**目的就是偏离真值**（λ=100 把后验拉到 0 附近），
    // 所以对它的判据方向必须反过来：覆盖不上才是对的。实测 0/4。
    // 通用断言碰到"故意要坏"的模板时，改断言比改模板诚实 —— 模板没骗人，是我的尺子太粗。
    if (exp.shrinkage) {
      t(`${tag} 强先验下间接效应区间**覆盖不上**真值（${covInd}/${truth.q * truth.p}，收缩是真的）`,
        covInd / (truth.q * truth.p) <= 0.5, `${covInd}/${truth.q * truth.p}`);
    } else {
      t(`${tag} 间接效应区间覆盖标准化真值 ≥ 75%（${covInd}/${truth.q * truth.p}）`,
        covInd / (truth.q * truth.p) >= 0.75, `${covInd}/${truth.q * truth.p}`);
    }
    t(`${tag} 直接效应区间覆盖标准化真值 ≥ 75%（${covDir}/${truth.q * truth.p}）`,
      covDir / (truth.q * truth.p) >= 0.75, `${covDir}/${truth.q * truth.p}`);
    t(`${tag} 方差分解逐响应四块之和 = 1`,
      Math.abs(r.variance_partition.x_unique.reduce((a, b) => a + b, 0) / r.q +
        r.variance_partition.m_unique.reduce((a, b) => a + b, 0) / r.q +
        r.variance_partition.shared.reduce((a, b) => a + b, 0) / r.q +
        r.variance_partition.residual.reduce((a, b) => a + b, 0) / r.q - 1) < 1e-6,
      JSON.stringify([r.variance_partition.x_unique, r.variance_partition.residual]).slice(0, 160));
    // 高维那张表的格子数必须真的是 p*q —— 视图靠它摆表，少一列就是静默截断
    t(`${tag} 输出格子数 = p*q = ${sp.p * sp.q}`, r.cell_labels.length === sp.p * sp.q, String(r.cell_labels.length));
    // 六张模板里必须留一张 p=k=q=1 的：大模板一切正常，正是这类降级 bug 藏身的地方。
    // （具体的形状断言在段首，形状不合格就不往下比数值了。）
  }
}

console.log('\n=== 4. 导出计划器 ===');
{
  const id = 'partmed';
  const sheets = spec.eraTemplateSheets(id);
  const parsed = (() => {
    const wb = XLSX.utils.book_new();
    for (const sh of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.aoa), sh.name);
    const rd = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const wb2 = XLSX.read(rd, { type: 'array' });
    const out = {};
    for (const nm of wb2.SheetNames) out[nm] = XLSX.utils.sheet_to_json(wb2.Sheets[nm], { header: 1, blankrows: false, defval: '' });
    return out;
  })();
  const fields = sheetIo.mapWorkbook(parsed, spec.ERA_IMPORT_SHEETS, { primary: 'X' }).fields;
  const patch = spec.eraToFormPatch(fields);   // §3 已经逐模板验过键名，这里复用同一条路径
  const payload = {
    X: JSON.parse(patch.xStr), M: JSON.parse(patch.mStr), Y: JSON.parse(patch.yStr),
    chains: patch.chains, iterations: patch.iterations, thin: patch.thin,
    seed: patch.seed, prior_lambda: patch.priorLambda, prob: patch.prob
  };
  const fIn = path.join(TMP, 'exp.json');
  fs.writeFileSync(fIn, JSON.stringify(payload));
  let code = 0;
  try {
    execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/bayesian_era_mediation.R'), fIn, fIn + '.out', fIn + '.err'], { stdio: 'pipe', timeout: 900000 });
  } catch (e) { code = e.status || 1; }
  t('导出用的结果真跑出来了', code === 0, code ? fs.readFileSync(fIn + '.err', 'utf8').slice(0, 200) : '');
  if (code === 0) {
    const r = JSON.parse(fs.readFileSync(fIn + '.out', 'utf8'));
    const ctx = { r, analysisResult: r, payload, templateLabel: '部分中介', diagnostics: r.diagnostics, stamp: '20261120_101500' };
    const jobs = spec.eraPlanExport(['excel', 'json', 'chart', 'input'], ctx, ctx.stamp);
    t('四项都出得来、文件名带模块名与时间戳',
      jobs.length === 4 && jobs.every((j) => /^BayesianERA .+_\d{8}_\d{6}\.(xlsx|json|png)$/.test(j.filename)),
      jobs.map((j) => j.filename).join(' , '));
    const xls = jobs.find((j) => j.type === 'xlsx');
    t('Excel 五张表：结论/效应表/方差分解/收敛诊断/模型信息',
      xls.sheets.map((s) => s.name).join(',') === '结论,效应表,方差分解,收敛诊断,模型信息',
      xls.sheets.map((s) => s.name).join(','));
    const eff = xls.sheets.find((s) => s.name === '效应表').aoa;
    t('效应表把直接/间接/总的区间与 OLS 对照一起带上（用户能自己核）',
      eff[0].includes('间接·下界') && eff[0].includes('OLS 间接') && eff.length === 1 + r.p * r.q,
      JSON.stringify(eff[0]));
    const part = xls.sheets.find((s) => s.name === '方差分解').aoa;
    t('方差分解表有 q 行数据且表头四块齐全',
      part.filter((rw) => /^Y\d/.test(String(rw[0]))).length === r.q &&
        part[0].slice(0, 5).join(',') === '响应,X 独有,X∩M（经中介）,M 独有,残差',
      JSON.stringify(part.slice(0, 3)));
    const png = jobs.filter((j) => j.type === 'png');
    t('图表项只带文件名（视图从当前 echarts 实例取图），类型只有 xlsx/json/png',
      png.length === 1 && Object.keys(png[0]).join(',') === 'type,filename' &&
        jobs.every((j) => ['xlsx', 'json', 'png'].includes(j.type)), JSON.stringify(png[0]));
    const inJob = jobs.find((j) => j.type === 'json' && j.filename.includes('输入'));
    t('输入导出能把 X/M/Y/参数原样带回来（可复现）',
      inJob.data.X.length === payload.X.length && inJob.data.M[0].length === payload.M[0].length &&
        inJob.data.prior_lambda === payload.prior_lambda && inJob.data.seed === payload.seed, '');
    t('未知 key 不出空任务', spec.eraPlanExport(['nope'], ctx, ctx.stamp).length === 0);
  }
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
process.exit(fail ? 1 : 0);
