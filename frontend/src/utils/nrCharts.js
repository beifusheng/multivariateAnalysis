/**
 * Non-random PERMANOVA 图表配置生成（纯函数，便于 node 侧单测）
 * 输入 = r-scripts/nonrandom_permanova.R 的 chart_data，输出 = ECharts option
 *
 * 设计原则（与 medCharts.js 一致）：
 *   1. 图上每个数值都必须来自 R 的真实计算，不允许写死占位数据；
 *   2. NaN/Inf 一律转成 null，避免 ECharts 把它们画成「看不见的点」（沉默失败）；
 *   3. 本模块的核心信息是「同一个 F，在两种零分布下的位置不同」，
 *      所以第一张图必须把两条零分布叠在一起画，而不是各画一张。
 */

/** 等宽分箱；返回中心点与计数（计数用整数，tooltip 里可还原真实频数） */
export function histogram(values, bins = 30) {
  const v = (values || []).map(Number).filter((x) => Number.isFinite(x));
  if (!v.length) return { centers: [], counts: [], min: 0, max: 0, n: 0 };
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || Math.abs(max) || 1;
  const width = span / bins;
  const counts = new Array(bins).fill(0);
  for (const x of v) {
    const k = Math.min(bins - 1, Math.floor((x - min) / width));
    counts[k] += 1;
  }
  const centers = counts.map((_, i) => Number((min + width * (i + 0.5)).toFixed(6)));
  return { centers, counts, min, max, n: v.length };
}

/**
 * ① 零分布对比：自由置换 vs 受限置换，叠加观测 F 竖线
 * 这是本功能的主图：两条分布错开多少，p 值为什么会翻盘，一眼就能看出来。
 */
export function buildNullCompareChart(cd, { fmt, fmtP }) {
  const observed = Number(cd?.null?.observed) || 0;
  const free = histogram(cd?.null_free?.values, 32);
  const con = histogram(cd?.null?.values, 32);
  const bins = 32;
  // 两条分布必须共用同一套横轴刻度，否则「谁更靠左」会被读成画图错觉
  const lo = Math.min(free.min, con.min, observed);
  const hi = Math.max(free.max, con.max, observed);
  const span = hi - lo || 1;
  const axis = Array.from({ length: bins }, (_, i) => Number((lo + (span * (i + 0.5)) / bins).toFixed(4)));
  const bucket = (h) => {
    if (!h.counts.length) return new Array(bins).fill(0);
    const out = new Array(bins).fill(0);
    h.centers.forEach((c, i) => {
      const k = Math.max(0, Math.min(bins - 1, Math.floor(((c - lo) / span) * bins)));
      out[k] += h.counts[i];
    });
    return out;
  };
  const freeCnt = bucket(free);
  const conCnt = bucket(con);
  const hasFree = !!cd?.null_free;

  const series = [];
  if (hasFree) {
    series.push({
      name: '自由置换零分布',
      type: 'bar',
      data: freeCnt,
      itemStyle: { color: 'rgba(245, 108, 108, 0.55)', borderColor: '#f56c6c', borderWidth: 1 },
      barGap: '-100%'
    });
  }
  series.push({
    name: `受限置换零分布（${cd?.null?.scheme || 'stratified'}）`,
    type: 'bar',
    data: conCnt,
    itemStyle: { color: 'rgba(64, 158, 255, 0.75)', borderColor: '#409eff', borderWidth: 1 },
    markLine: {
      symbol: 'none',
      lineStyle: { color: '#303133', width: 2.5, type: 'solid' },
      label: { formatter: `观测 F = ${fmt(observed, 3)}`, position: 'insideEndTop', fontSize: 12, fontWeight: 600 },
      data: [{ xAxis: Number(observed.toFixed(4)) }]
    }
  });

  return {
    title: {
      text: '同一个 F，两种零分布',
      subtext: hasFree
        ? `p(自由) = ${fmtP(cd.null_free.p)} ｜ p(受限) = ${fmtP(cd.null.p)} —— 受限零分布把「区组内本来就能造出的组间差异」算进零假设，右尾更厚`
        : `scheme=free：本次只有一种置换方案，p = ${fmtP(cd?.null?.p)}`,
      left: 'center',
      textStyle: { fontSize: 15 },
      subtextStyle: { fontSize: 12 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps) => {
        const arr = Array.isArray(ps) ? ps : [ps];
        const lines = [`F ≈ ${arr[0]?.axisValue}`];
        arr.forEach((p) => lines.push(`${p.marker}${p.seriesName}：${p.data} 次`));
        return lines.join('<br/>');
      }
    },
    legend: { bottom: 4, data: series.map((s) => s.name) },
    grid: { left: 60, right: 30, top: 86, bottom: 56 },
    xAxis: { type: 'category', data: axis, name: '置换 F 统计量', nameLocation: 'middle', nameGap: 28 },
    yAxis: { type: 'value', name: '频次' },
    series
  };
}

/**
 * ② 结论对比：p_free / p_constrained 双条 + 0.05 阈值线
 * 用 -log10(p) 会让「显著/不显著」的边界不直观，这里直接用 p 并画阈值线。
 * 只跑一种置换方案（scheme=free）时 R 也只返一行，图仍能正常渲染。
 */
export function buildPComparisonChart(cd, { fmt, fmtP }) {
  const rows = cd?.comparison || [];
  const nameOf = (r) => (r.scheme === 'free' ? '自由置换（所有排列）' : `受限置换（${r.scheme}）`);
  const cats = rows.map(nameOf);
  const vals = rows.map((r) => (Number.isFinite(Number(r.p)) ? Number(r.p) : null));
  const colors = vals.map((p) => (p === null ? '#909399' : p < 0.05 ? '#67c23a' : '#e6a23c'));
  const observed = rows.length ? Number(rows[0].F) : null;

  return {
    title: {
      text: rows.length > 1 ? '置换方案对结论的影响' : '置换检验结论',
      subtext: rows.length > 1
        ? `观测 F = ${fmt(observed, 3)}（两种方案用的是同一个 F，只有零分布不同）`
        : `观测 F = ${fmt(observed, 3)}（本设计无分层/空间限制，只有一种置换方案）`,
      left: 'center',
      textStyle: { fontSize: 15 },
      subtextStyle: { fontSize: 12 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps) => {
        const arr = Array.isArray(ps) ? ps : [ps];
        return arr
          .map((p) => `${p.marker}${p.name}：p = ${fmtP(p.data)}${p.data < 0.05 ? '（显著）' : '（不显著）'}`)
          .join('<br/>');
      }
    },
    grid: { left: 70, right: 40, top: 80, bottom: 50 },
    xAxis: { type: 'category', data: cats },
    yAxis: { type: 'value', name: 'p 值', min: 0, max: 1 },
    series: [
      {
        type: 'bar',
        barWidth: rows.length > 1 ? 90 : 120,
        data: vals.map((v, i) => ({ value: v, itemStyle: { color: colors[i] } })),
        label: { show: true, position: 'top', formatter: (x) => fmtP(x.data), fontWeight: 600 },
        markLine: {
          symbol: 'none',
          lineStyle: { color: '#f56c6c', type: 'dashed', width: 2 },
          label: { formatter: 'α = 0.05', position: 'end', color: '#f56c6c' },
          data: [{ yAxis: 0.05 }]
        }
      }
    ]
  };
}

const STRATA_SYMBOLS = ['circle', 'rect', 'diamond', 'triangle', 'roundRect', 'pin', 'arrow', 'none'];

/**
 * ③ PCoA 散点：颜色 = 分组，形状 = 区组
 * 形状编码区组是刻意的：受限置换只在区组内交换标签，图上要能看出
 * 「同一区组里既有 A 又有 B」才说明设计平衡。
 */
export function buildPcoaChart(cd, { fmt }) {
  const p = cd?.pcoa || {};
  const xs = p.x || [];
  const ys = p.y || [];
  const groups = p.group || [];
  const strata = p.strata || [];
  const labels = p.labels || [];
  const gvars = p.var_explained || [];

  const glevels = [...new Set(groups.map(String))];
  const slevels = [...new Set(strata.map(String))];
  const hasStrata = slevels.length > 1 || (slevels.length === 1 && slevels[0] !== 'NA');

  const series = glevels.map((g, gi) => ({
    name: g,
    type: 'scatter',
    symbolSize: 11,
    itemStyle: { opacity: 0.85, borderColor: '#fff', borderWidth: 1 },
    data: xs
      .map((x, i) => ({
        value: [x, ys[i]],
        symbol: hasStrata ? STRATA_SYMBOLS[slevels.indexOf(String(strata[i])) % STRATA_SYMBOLS.length] : 'circle',
        label: labels[i],
        strata: String(strata[i])
      }))
      .filter((_, i) => String(groups[i]) === g)
  }));

  return {
    title: {
      text: `PCoA 排序（${cd?.distance || '距离基主坐标'}）`,
      subtext: `颜色=分组，形状=区组；PC1 ${fmt((gvars[0] || 0) * 100, 2)}%` +
        (gvars.length > 1 ? `，PC2 ${fmt((gvars[1] || 0) * 100, 2)}%` : ''),
      left: 'center',
      textStyle: { fontSize: 15 },
      subtextStyle: { fontSize: 12 }
    },
    tooltip: {
      formatter: (pp) =>
        `${pp.data?.label || pp.seriesName}<br/>区组：${pp.data?.strata}<br/>PC1 = ${fmt(pp.value[0], 4)}<br/>PC2 = ${fmt(pp.value[1], 4)}`
    },
    legend: { bottom: 4, data: glevels },
    grid: { left: 66, right: 30, top: 78, bottom: 56 },
    xAxis: { type: 'value', name: `PC1 (${fmt((gvars[0] || 0) * 100, 1)}%)`, nameLocation: 'middle', nameGap: 26, scale: true },
    yAxis: { type: 'value', name: `PC2 (${fmt((gvars[1] || 0) * 100, 1)}%)`, scale: true },
    series
  };
}

/** ④ 逐术语解释量：R² 柱 + F 折线（双轴），多术语公式时用来核对边际检验 */
export function buildVarianceChart(cd, { fmt }) {
  const rows = cd?.variance || [];
  const cats = rows.map((r) => r.term);
  const r2 = rows.map((r) => (Number.isFinite(Number(r.R2)) ? Number(r.R2) : null));
  const fs = rows.map((r) => (Number.isFinite(Number(r.F)) ? Number(r.F) : null));
  return {
    title: {
      text: '逐术语解释量（边际检验）',
      subtext: '多术语时各行为独立边际检验，R² 不可相加；df 标注在柱顶',
      left: 'center',
      textStyle: { fontSize: 15 },
      subtextStyle: { fontSize: 12 }
    },
    tooltip: {
      trigger: 'axis',
      formatter: (ps) => {
        const arr = Array.isArray(ps) ? ps : [ps];
        const i = arr[0]?.dataIndex ?? 0;
        const row = rows[i] || {};
        return [
          `${row.term}`,
          `R² = ${fmt(row.R2, 4)}`,
          `F = ${fmt(row.F, 3)}（df = ${row.df}，水平数 = ${row.n_levels ?? '-'}）`
        ].join('<br/>');
      }
    },
    legend: { bottom: 4 },
    grid: { left: 60, right: 60, top: 78, bottom: 56 },
    xAxis: { type: 'category', data: cats },
    yAxis: [
      { type: 'value', name: 'R²', min: 0 },
      { type: 'value', name: 'F', min: 0, splitLine: { show: false } }
    ],
    series: [
      {
        name: 'R²',
        type: 'bar',
        data: r2,
        barWidth: 46,
        itemStyle: { color: '#409eff' },
        label: { show: true, position: 'top', formatter: (x) => `df ${rows[x.dataIndex]?.df ?? '-'}` }
      },
      { name: 'F', type: 'line', yAxisIndex: 1, data: fs, itemStyle: { color: '#e6a23c' }, symbolSize: 9, lineStyle: { width: 2 } }
    ]
  };
}

export const NR_CHART_BUILDERS = {
  null: buildNullCompareChart,
  pcompare: buildPComparisonChart,
  pcoa: buildPcoaChart,
  variance: buildVarianceChart
};

export const NR_CHART_TABS = [
  { id: 'null', name: '零分布对比' },
  { id: 'pcompare', name: '结论对比' },
  { id: 'pcoa', name: 'PCoA 排序' },
  { id: 'variance', name: '解释量分解' }
];
