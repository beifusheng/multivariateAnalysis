/**
 * PERMANOVA-med 图表配置生成（纯函数，便于 node 侧单测）
 * 输入 = r-scripts/permanova_med.R 输出的 chart_data，输出 = ECharts option
 * 约定：所有数值都来自 R 的真实计算；任何 NaN/Inf 都会在这里被转成 null，
 *       以免 ECharts 把它们画成"看不见的点"（沉默失败）。
 */

import { makeFormatters } from './format.js';

export { makeFormatters };


/** 最小二乘拟合线 */
export function ols(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (!n) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  if (!sxx) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, xs, ys };
}

/** 图 1：中介路径图 */
export function buildPathChart(cd, { fmt, fmtP }) {
  const p = cd.path;
  const linkLabel = (txt) => ({
    show: true, formatter: txt, color: '#303133', fontSize: 13, fontWeight: 600,
    backgroundColor: '#fff', padding: [3, 6], borderRadius: 4,
  });
  return {
    title: { subtext: cd.note || '', bottom: 6, left: 'center', textStyle: { fontSize: 11, color: '#909399' } },
    tooltip: {
      // 防御式写法：ECharts 一且在某些场景（图列/高亮叠加）传入不带 data 的 params，
      // 直接取 x.data.name 会在 hover 时抛错
      formatter: (x) => {
        const d = x && x.data;
        if (!d) return '';
        if (x.dataType === 'edge') return (d.label && d.label.formatter) || '';
        return String(d.name || '').replace(/\n/g, ' ');
      },
    },
    series: [{
      type: 'graph', layout: 'none', roam: false, edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 10,
      label: { show: true, position: 'inside', color: '#fff', fontWeight: 600, fontSize: 14, lineHeight: 18 },
      lineStyle: { width: 2.4, curveness: 0.08, color: '#606266' },
      data: [
        { name: 'X\n暴露', x: 140, y: 210, symbolSize: 74, itemStyle: { color: '#409eff' } },
        { name: 'M\n中介（群落轴）', x: 470, y: 90, symbolSize: 92, itemStyle: { color: '#67c23a' } },
        { name: 'Y\n结局', x: 800, y: 210, symbolSize: 74, itemStyle: { color: '#e6a23c' } },
      ],
      links: [
        { source: 0, target: 1, label: linkLabel(`a = ${fmt(p.a, 3)}  p=${fmtP(p.a_p)}`) },
        { source: 1, target: 2, label: linkLabel(`b = ${fmt(p.b, 3)}  p=${fmtP(p.b_p)}`) },
        { source: 0, target: 2, curveness: -0.25, label: linkLabel(`直接 c′ = ${fmt(p.c_prime, 3)}  p=${fmtP(p.c_prime_p)}`) },
      ],
    }],
  };
}

/** 图 2：效应量柱状图 */
export function buildEffectBarChart(cd, { fmt }) {
  const p = cd.path;
  const rows = [
    { name: '间接效应 a×b', est: p.indirect, ci: p.indirect_ci },
    { name: '直接效应 c′', est: p.c_prime, ci: p.c_prime_ci },
    { name: '总效应', est: p.total, ci: null },
    { name: 'a：X→M轴', est: p.a, ci: p.a_ci },
    { name: 'b：M轴→Y|X', est: p.b, ci: p.b_ci },
  ];
  return {
    _rows: rows,
    grid: { left: 90, right: 40, top: 50, bottom: 70 },
    tooltip: {
      formatter: (x) => {
        const r = rows[x.dataIndex];
        return `${r.name}<br/>估计：${fmt(r.est, 4)}` +
          (r.ci ? `<br/>95% CI：${fmt(r.ci[0], 4)} ~ ${fmt(r.ci[1], 4)}` : '');
      },
    },
    xAxis: { type: 'category', data: rows.map((r) => r.name), axisLabel: { interval: 0, width: 88, overflow: 'break' } },
    yAxis: { type: 'value', name: '标准化效应' },
    series: [{
      type: 'bar', barWidth: '48%',
      data: rows.map((r) => ({
        value: r.est,
        itemStyle: { color: r.est != null && r.est >= 0.15 ? '#67c23a' : '#409eff' },
      })),
      label: { show: true, position: 'top', formatter: (x) => fmt(x.value, 3) },
    }],
  };
}

/** 图 3：相关系数热图 */
export function buildCorHeatmapChart(cd, { fmt }) {
  const c = cd.correlation;
  const name = (l) => (l === 'M_axis' ? 'M轴' : l);
  const data = [];
  c.matrix.forEach((row, i) => row.forEach((v, j) => data.push([j, i, v])));
  return {
    tooltip: { formatter: (x) => `${name(c.labels[x.value[1]])} × ${name(c.labels[x.value[0]])}<br/>r = ${fmt(x.value[2], 4)}` },
    grid: { left: 90, right: 30, top: 40, bottom: 90 },
    xAxis: { type: 'category', data: c.labels.map(name), splitArea: { show: true } },
    yAxis: { type: 'category', data: c.labels.map(name), splitArea: { show: true } },
    visualMap: { min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 8, inRange: { color: ['#3b6db3', '#f7f7f7', '#c0392b'] } },
    series: [{
      type: 'heatmap', data,
      label: { show: true, formatter: (x) => fmt(x.value[2], 2) },
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
    }],
  };
}

/** 图 4：X / M轴 / Y 两两散点（带拟合线） */
export function buildScatterMatrixChart(cd, { num }) {
  const s = cd.samples;
  const pairs = [
    { x: s.x, y: s.m, xl: 'X（暴露）', yl: 'M轴' },
    { x: s.m, y: s.y, xl: 'M轴', yl: 'Y（结局）' },
    { x: s.x, y: s.y, xl: 'X（暴露）', yl: 'Y（结局）' },
  ];
  const grids = [], xAxes = [], yAxes = [], series = [], titles = [];
  pairs.forEach((pr, i) => {
    const top = 44 + i * 152;
    grids.push({ left: 78, right: 30, top, height: 104 });
    xAxes.push({ gridIndex: i, type: 'value', scale: true, name: pr.xl, nameLocation: 'middle', nameGap: 26, nameTextStyle: { fontSize: 11 }, axisLabel: { show: false } });
    yAxes.push({ gridIndex: i, type: 'value', scale: true, name: pr.yl, nameLocation: 'middle', nameGap: 44, nameTextStyle: { fontSize: 11 }, axisLabel: { show: false } });
    const fit = ols(pr.x, pr.y);
    const lineData = fit ? [
      [num(Math.min(...pr.x)), num(fit.intercept + fit.slope * Math.min(...pr.x))],
      [num(Math.max(...pr.x)), num(fit.intercept + fit.slope * Math.max(...pr.x))],
    ] : [];
    series.push({
      type: 'scatter', xAxisIndex: i, yAxisIndex: i, symbolSize: 8,
      data: pr.x.map((v, k) => [num(v), num(pr.y[k])]),
      itemStyle: { color: '#409eff', opacity: 0.7 },
    });
    series.push({ type: 'line', xAxisIndex: i, yAxisIndex: i, showSymbol: false, data: lineData, lineStyle: { color: '#e6a23c', width: 2 } });
    titles.push({ text: `${pr.xl} vs ${pr.yl}（slope=${fit ? num(fit.slope, 3) : 'NA'}）`, left: 78, top: top - 22, textStyle: { fontSize: 12, color: '#606266' } });
  });
  return { title: titles, tooltip: { trigger: 'item' }, grid: grids, xAxis: xAxes, yAxis: yAxes, series };
}

/** 图 5：森林图（估计值 + 95% CI） */
export function buildForestChart(cd, { fmt, num }) {
  const p = cd.path;
  const rows = [
    { name: 'a  X→M轴', est: p.a, lo: p.a_ci?.[0], hi: p.a_ci?.[1] },
    { name: 'b  M轴→Y|X', est: p.b, lo: p.b_ci?.[0], hi: p.b_ci?.[1] },
    { name: "c' X→Y|M轴", est: p.c_prime, lo: p.c_prime_ci?.[0], hi: p.c_prime_ci?.[1] },
    { name: '间接效应 a×b', est: p.indirect, lo: p.indirect_ci?.[0], hi: p.indirect_ci?.[1] },
  ];
  return {
    _rows: rows,
    grid: { left: 160, right: 50, top: 40, bottom: 50 },
    tooltip: {
      formatter: (x) => {
        const r = rows[x.dataIndex];
        return `${r.name}<br/>估计：${fmt(r.est, 4)}<br/>95% CI：${fmt(r.lo, 4)} ~ ${fmt(r.hi, 4)}`;
      },
    },
    xAxis: { type: 'value', name: '标准化效应' },
    yAxis: { type: 'category', data: rows.map((r) => r.name), axisTick: { show: false } },
    series: [
      {
        type: 'custom', name: '95% CI', z: 1,
        encode: { x: [1, 2], y: 0 },
        data: rows.map((r, i) => [i, num(r.lo), num(r.hi)]),
        renderItem: (params, api) => {
          const yi = api.value(0);
          const lo = api.coord([api.value(1), yi]);
          const hi = api.coord([api.value(2), yi]);
          const h = api.size([0, 1])[1] * 0.22;
          const style = { stroke: '#409eff', lineWidth: 2 };
          return {
            type: 'group',
            children: [
              { type: 'line', shape: { x1: lo[0], y1: lo[1], x2: hi[0], y2: hi[1] }, style },
              { type: 'line', shape: { x1: lo[0], y1: lo[1] - h, x2: lo[0], y2: lo[1] + h }, style },
              { type: 'line', shape: { x1: hi[0], y1: hi[1] - h, x2: hi[0], y2: hi[1] + h }, style },
            ],
          };
        },
      },
      {
        type: 'scatter', name: '估计值', z: 2, symbolSize: 13, itemStyle: { color: '#e6a23c' },
        data: rows.map((r, i) => [i, num(r.est)]),
        markLine: {
          silent: true, symbol: 'none',
          label: { formatter: '无效应线 0' },
          lineStyle: { color: '#909399', type: 'dashed' },
          data: [{ xAxis: 0 }],
        },
      },
    ],
  };
}

/** id -> builder 分发表 */
export const MED_CHART_BUILDERS = {
  path: buildPathChart,
  bar: buildEffectBarChart,
  heatmap: buildCorHeatmapChart,
  scatter: buildScatterMatrixChart,
  forest: buildForestChart,
};
