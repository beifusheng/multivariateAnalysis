#!/usr/bin/env node
/**
 * Non-random PERMANOVA 图表配置单测
 * ---------------------------------------------------------------
 * 数据来源是**真跑 R** 得到的 chart_data（不是手搓的假 option）：
 * 图表代码最常见的 bug 是「字段名对不上」，用手工构造的输入自测等于自欺。
 *
 *   node r-scripts/tools/test_nr_charts.mjs
 *   RSCRIPT=... node r-scripts/tools/test_nr_charts.mjs     # 换 R 版本 A/B
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'r-scripts/nonrandom_permanova.R');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable/bin/Rscript.exe');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nrcharts-'));

const { nonrandomTemplates: nrt, nrCharts: nc, format: fmtMod } =
  await loadFrontendUtils(['nonrandomTemplates', 'nrCharts', 'format']);
const F = fmtMod.makeFormatters();

let pass = 0, fail = 0;
const fails = [];
const t = (name, cond, extra = '') => {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ` —— ${extra}` : '')); }
};
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// ECharts 会把 NaN 画成「不存在的点」，所以图上不允许出现 NaN（null 是允许的断点）
const noNaN = (o, label) => {
  const s = JSON.stringify(o);
  t(label + ' 无 NaN', !/NaN/.test(s), s.slice(0, 120));
};
const deepNumbers = (o) => {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'number') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(o);
  return out;
};

const runR = (spec, tag) => {
  const built = nrt.buildNonrandomTemplateData(spec);
  const inPath = path.join(TMP, `${tag}.json`);
  fs.writeFileSync(inPath, JSON.stringify(built.payload));
  execFileSync(RSCRIPT, [SCRIPT, inPath, inPath + '.out', inPath + '.err'], { stdio: 'pipe', timeout: 180000 });
  const json = JSON.parse(fs.readFileSync(inPath + '.out', 'utf8'));
  return { built, json };
};

// 三个有代表性的设计：假阳性案例（两条零分布分得很开）、双显著案例、纯自由置换案例
const CASES = ['confoundedBlock', 'balancedBlock', 'freeOnly', 'spatialField', 'twinsSite'];
const results = [];
for (const id of CASES) {
  const item = nrt.NR_TEMPLATE_MAP[id];
  if (!item) { t(`${id} 模板存在`, false); continue; }
  try {
    const r = runR(item.spec, id);
    results.push({ id, ...r });
    t(`${id} R 运行成功`, r.json.success === true);
  } catch (e) {
    t(`${id} R 运行成功`, false, String(e.message).slice(0, 80));
  }
}

// ---------------------------------------------------------- histogram 单元检查
{
  const h = nc.histogram([1, 1, 2, 2, 3, 3, 4, 4], 4);
  t('histogram 计数守恒', h.counts.reduce((a, b) => a + b, 0) === 8);
  t('histogram 范围正确', h.min === 1 && h.max === 4);
  t('histogram 空输入不炸', nc.histogram([], 10).counts.length === 0 && nc.histogram(undefined, 10).n === 0);
  const single = nc.histogram([5, 5, 5], 8);
  t('histogram 常量输入（span=0）不产生 NaN', deepNumbers(single).every(Number.isFinite), JSON.stringify(single.centers));
  t('histogram 过滤 NaN', nc.histogram([1, NaN, 2, undefined, 3], 3).n === 3);
}

// ---------------------------------------------------------- 每张图的断言
for (const { id, json, built } of results) {
  const cd = json.chart_data;
  const n = json.model.n_samples;
  const scheme = json.permutation.scheme;
  const isFree = scheme === 'free';

  t(`${id}: chart_data 齐全`, cd && cd.null && cd.pcoa && cd.variance && cd.comparison,
    cd ? Object.keys(cd).join(',') : 'undefined');
  if (!cd || !cd.null) continue;

  // ---- ① 零分布对比 ----
  const o1 = nc.buildNullCompareChart(cd, F);
  noNaN(o1, `${id}/零分布`);
  const s1 = o1.series;
  t(`${id}: 零分布图系列数正确`, s1.length === (isFree ? 1 : 2), `${s1.length} vs ${isFree ? 1 : 2}`);
  const sumBins = (s) => s.data.reduce((a, b) => a + (Number(b) || 0), 0);
  const conS = s1[s1.length - 1];
  t(`${id}: 受限直方图频数 = 实际点数`, sumBins(conS) === cd.null.values.length,
    `${sumBins(conS)} vs ${cd.null.values.length}`);
  if (!isFree) {
    t(`${id}: 自由直方图频数 = 实际点数`, sumBins(s1[0]) === cd.null_free.values.length);
    t(`${id}: 两条分布横轴共用同一刻度`, s1[0].data.length === o1.xAxis.data.length);
    // 只对「分组与区组混淆」的设计断言右尾方向：平衡设计下两条零分布本来就该接近
    if ((built.spec.confound || 0) > 0.5) {
      t(`${id}: 受限零分布右尾更厚（假阳性来源）`,
        Math.max(...cd.null.values) > Math.max(...cd.null_free.values),
        `con max=${Math.max(...cd.null.values).toFixed(2)}, free max=${Math.max(...cd.null_free.values).toFixed(2)}`);
    }
  }
  const ml = conS.markLine?.data?.[0]?.xAxis;
  t(`${id}: 观测 F 竖线位置 = R 给的 F`, Math.abs(ml - cd.null.observed) < 1e-3, `${ml} vs ${cd.null.observed}`);
  t(`${id}: 直方图横轴单调递增`, o1.xAxis.data.every((v, i, a) => i === 0 || v > a[i - 1]));

  // ---- ② 结论对比 ----
  const o2 = nc.buildPComparisonChart(cd, F);
  noNaN(o2, `${id}/结论对比`);
  const vals = o2.series[0].data.map((d) => d.value);
  t(`${id}: p 图行数与实际置换方案数一致`,
    vals.length === (isFree ? 1 : 2), `${vals.length} vs ${isFree ? 1 : 2}`);
  t(`${id}: p 值与 R 输出一致`,
    Math.abs(vals[0] - json.observed.p_free) < 1e-12 &&
    (isFree || Math.abs(vals[1] - json.observed.p_constrained) < 1e-12));
  t(`${id}: 颜色按 α=0.05 着色`,
    o2.series[0].data.every((d, i) => d.itemStyle.color === (d.value < 0.05 ? '#67c23a' : '#e6a23c')));
  t(`${id}: 阈值线画在 0.05`, o2.series[0].markLine.data[0].yAxis === 0.05);
  t(`${id}: p 轴固定 0..1`, o2.yAxis.min === 0 && o2.yAxis.max === 1);

  // ---- ③ PCoA ----
  const o3 = nc.buildPcoaChart(cd, F);
  noNaN(o3, `${id}/PCoA`);
  const pts = o3.series.reduce((s, x) => s + x.data.length, 0);
  t(`${id}: PCoA 点数 = 样本数`, pts === n, `${pts} vs ${n}`);
  t(`${id}: 每个点都有坐标且有限`, o3.series.every((s) => s.data.every((p) => finite(p.value[0]) && finite(p.value[1]))));
  t(`${id}: 系列数 = 分组数`, o3.series.length === new Set(cd.pcoa.group.map(String)).size);
  t(`${id}: 点带样本名与区组`, o3.series.every((s) => s.data.every((p) => p.label && p.strata)));
  if (!isFree) {
    const symbols = new Set(o3.series.flatMap((s) => s.data.map((p) => p.symbol)));
    t(`${id}: 区组用不同形状区分`, symbols.size >= Math.min(2, new Set(cd.pcoa.strata).size), [...symbols].join(','));
  }

  // ---- ④ 解释量 ----
  const o4 = nc.buildVarianceChart(cd, F);
  noNaN(o4, `${id}/解释量`);
  t(`${id}: 术语数与 anova_table 一致`, o4.xAxis.data.length === json.anova_table.length);
  t(`${id}: R² 来自 R`, o4.series[0].data.every((v, i) => v === null || Math.abs(v - json.anova_table[i].R2) < 1e-12));
  t(`${id}: F 来自 R`, o4.series[1].data.every((v, i) => v === null || Math.abs(v - json.anova_table[i].F_model) < 1e-12));
  t(`${id}: R² ∈ [0,1]`, deepNumbers({ a: o4.series[0].data }).filter(Number.isFinite).every((v) => v >= 0 && v <= 1));

  // ---- 标签页与构建器一一对应（视图按 tab 找 builder，缺了就白屏） ----
  for (const tab of nc.NR_CHART_TABS) {
    t(`${id}: tab ${tab.id} 有对应 builder`, typeof nc.NR_CHART_BUILDERS[tab.id] === 'function');
  }
}

// -------------------------------------------------- 旗舰案例的教学效果必须可见
{
  const flagship = results.find((r) => r.id === 'confoundedBlock');
  if (flagship) {
    const cd = flagship.json.chart_data;
    t('旗舰案例：受限零分布明显右移（把假阳性讲清楚）',
      Math.max(...cd.null.values) > 3 * Math.max(...cd.null_free.values),
      `受限最大 F=${Math.max(...cd.null.values).toFixed(2)}，自由最大 F=${Math.max(...cd.null_free.values).toFixed(2)}`);
    const o = nc.buildNullCompareChart(cd, F);
    t('旗舰案例：副标题写明两个 p', /p\(自由\)[\s\S]*p\(受限\)/.test(o.title.subtext), o.title.subtext);
    t('旗舰案例：受限 p 不显著、自由 p 显著',
      cd.null.p >= 0.05 && cd.null_free.p < 0.05);
  }
}

// ------------------------------------- formatter 冒烟：回调必须被真调一次
// 背景：ECharts 的 series.data 写成对象项（{ value, itemStyle }）时，params.data 是整个对象、
// params.value 才是数值。结论对比图当初用的是 params.data，柱顶标签和 tooltip 全部
// 渲染成 N/A；更严重的是 `p.data < 0.05` 恒为 false，tooltip 把 p=0.001 的显著结果
// 写成「（不显著）」。结构断言（series 里有几个值、颜色对不对）永远查不出这类问题，
// 必须把回调函数真调一次。
{
  const bad = [];
  const scan = (opt, where) => {
    const call = (fn, params) => {
      let out;
      try { out = fn(params); } catch (e) { bad.push(`${where} 抛异常：${e.message}`); return; }
      if (typeof out !== 'string' || !out.length) { bad.push(`${where} 返回不是字符串：${String(out)}`); return; }
      const m = out.match(/N\/A|undefined|NaN|\[object Object\]/);
      if (m) bad.push(`${where} 输出含非法值「${m[0]}」：${out.replace(/<br\/>/g, ' | ')}`);
    };
    const axisTrigger = opt?.tooltip?.trigger === 'axis';
    (opt?.series || []).forEach((s, si) => {
      const mk = (i) => {
        const item = (s.data || [])[i] ?? 0;
        const value = item && typeof item === 'object' && 'value' in item ? item.value : item;
        return {
          value, data: item, dataIndex: i, seriesIndex: si, seriesName: s.name || '',
          name: opt?.xAxis?.data?.[i] ?? s.name ?? '', marker: '', axisValue: String(i)
        };
      };
      const n = Math.max(1, Math.min((s.data || []).length, 3));
      for (let i = 0; i < n; i++) {
        const p = mk(i);
        if (typeof opt?.tooltip?.formatter === 'function') {
          call(opt.tooltip.formatter, axisTrigger ? [p] : p);
        }
        if (typeof s?.label?.formatter === 'function') call(s.label.formatter, p);
      }
    });
  };

  for (const { id, json } of results) {
    const cd = json.chart_data;
    scan(nc.buildNullCompareChart(cd, F), `${id} · 零分布对比`);
    scan(nc.buildPComparisonChart(cd, F), `${id} · 结论对比`);
    scan(nc.buildPcoaChart(cd, F), `${id} · PCoA`);
    scan(nc.buildVarianceChart(cd, F), `${id} · 方差分配`);
  }
  t('全部图表的 tooltip / label 回调可用，且不出现 N/A、undefined、[object Object]',
    bad.length === 0, bad.slice(0, 4).join(' ;; '));

  // 语义断言：显著性结论文字必须和 p 值一致（结构对了但说反话也算失败）
  const c0 = results.find((r) => r.json.chart_data.comparison?.length >= 1);
  if (c0) {
    const opt = nc.buildPComparisonChart(c0.json.chart_data, F);
    const rows = c0.json.chart_data.comparison;
    rows.forEach((row, i) => {
      const item = opt.series[0].data[i];
      const tip = opt.tooltip.formatter([{ value: item.value, data: item, name: row.scheme, marker: '' }]);
      const label = opt.series[0].label.formatter({ value: item.value, data: item });
      const sig = Number(row.p) < 0.05;
      t(`结论对比 tooltip 的显著性判定与 p=${Number(row.p).toFixed(4)} 一致`,
        tip.includes(sig ? '（显著）' : '（不显著）') && !tip.includes(sig ? '（不显著）' : '（显著）'), tip);
      t(`结论对比 柱顶标签把 p=${Number(row.p).toFixed(4)} 渲染出来了`, /\d/.test(label) && !/N\/A/.test(label), label);
    });
  }
}

console.log(`\nNon-random PERMANOVA 图表测试：${CASES.join(', ')}`);
console.log(`──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) {
  console.log('\n失败项:');
  fails.forEach((f) => console.log('  - ' + f));
}
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
