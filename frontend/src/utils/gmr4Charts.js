/**
 * GMR4 的图表层（纯函数：结果 -> echarts option）
 * ---------------------------------------------------------------
 * 与 nrCharts / medCharts 同一约定：不碰 DOM、不接 echarts 实例，
 * 于是每张图"画的是什么、坐标对不对"能在 Node 里直接断言。
 *
 * 输入一律是引擎输出的 r（不是 chart_data）：GMR4 的图需要的东西
 * cv / U / V / R2_per_response_partialled 本来就在结果里，
 * 再在 R 侧复制一份 chart_data 只会多一处会漂移的契约。
 */

export const GMR4_CHART_TABS = [
  { id: 'selection', name: '选型依据', tip: 'CV 随秩的变化 + 1-SE 阈值线，解释为什么落在 S=3' },
  { id: 'cvHeat', name: 'CV 热图', tip: '秩 × lambda 的交叉验证误差，选中的格子高亮' },
  { id: 'r2', name: '逐响应 R²', tip: '偏协变量前后对照 —— 降秩最容易悄悄丢掉某个响应' },
  { id: 'biplot', name: '载荷双标图', tip: '前两维上的 X（U）与 Y（V）载荷' }
];

const toRows = (m) => (Array.isArray(m) && Array.isArray(m[0]) ? m : []);

/** 选型依据：每个秩取该秩下的最优 CV，再画 1-SE 水平线 */
function selectionOption(r, F) {
  const ranks = r.rank_grid || [];
  const means = toRows(r.cv && r.cv.mean);
  if (!ranks.length || !means.length) return null;
  const bestPerRank = means.map((row) => Math.min(...row.filter((v) => Number.isFinite(v))));
  const globalMin = r.cv.best ? r.cv.best.value : Math.min(...bestPerRank);
  // 1-SE 容差取"最优格子自己的标准误"，这正是引擎 selection_rule 用的那条线
  const seAtBest = r.cv.best && Number.isFinite(r.cv.se_min)
    ? r.cv.se_min
    : (Array.isArray(r.cv.se) ? Math.min(...toRows(r.cv.se).flat().filter((v) => Number.isFinite(v))) : 0);
  const thr = globalMin + seAtBest;
  return {
    tooltip: { trigger: 'axis', formatter: (ps) => ps.map((p) => `${p.seriesName} S=${p.axisValue} CV=${F.fmt(p.value)}`).join('<br/>') },
    legend: { data: ['该秩最优 CV', 'CV 最小点', '1-SE 阈值'], top: 8 },
    grid: { left: 62, right: 28, top: 46, bottom: 44 },
    xAxis: { type: 'category', data: ranks.map((s) => `S${s}`), name: '候选秩' },
    yAxis: { type: 'value', name: 'CV 误差', scale: true },
    series: [
      {
        name: '该秩最优 CV', type: 'line', symbolSize: 9, data: bestPerRank,
        markPoint: r.rank_selected ? { data: [{ coord: [`S${r.rank_selected}`, bestPerRank[ranks.indexOf(r.rank_selected)]], name: '选中' }] } : undefined
      },
      { name: 'CV 最小点', type: 'scatter', symbolSize: 12, data: [globalMin] },
      { name: '1-SE 阈值', type: 'line', data: ranks.map(() => thr), lineStyle: { type: 'dashed' }, symbol: 'none' }
    ]
  };
}

/** CV 热图：行=秩，列=lambda，选中格加边框 */
function cvHeatOption(r, F) {
  const ranks = r.rank_grid || [];
  const lams = r.lambda_grid || [];
  const means = toRows(r.cv && r.cv.mean);
  if (!ranks.length || !lams.length || !means.length) return null;
  const data = [];
  means.forEach((row, i) => row.forEach((v, j) => { if (Number.isFinite(v)) data.push([j, i, +v.toPrecision(6)]); }));
  const flat = data.map((d) => d[2]);
  const selIdx = [lams.indexOf(r.lambda_selected), ranks.indexOf(r.rank_selected)];
  return {
    tooltip: {
      position: 'top',
      formatter: (rp) => `S=${ranks[rp.data[1]]} × λ=${lams[rp.data[0]]}<br/>CV=${F.fmt(rp.data[2])}`
    },
    grid: { left: 62, right: 74, top: 34, bottom: 58 },
    xAxis: { type: 'category', data: lams.map((l) => String(l)), name: 'lambda' },
    yAxis: { type: 'category', data: ranks.map((s) => `S${s}`), name: '秩' },
    visualMap: {
      min: Math.min(...flat), max: Math.max(...flat), calculable: true,
      orient: 'vertical', right: 6, top: 'center', itemHeight: 120,
      inRange: { color: ['#e8f5e9', '#fff3d6', '#f6b26b', '#e06666'] }
    },
    series: [{
      type: 'heatmap', data,
      markPoint: selIdx[0] >= 0 && selIdx[1] >= 0
        ? { symbol: 'rect', symbolSize: [Math.abs(1), 1], data: [] } : undefined,
      label: { show: false },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.4)' } }
    }, {
      // 选中点单独描一圈：热图配色相近时，光看颜色分不清引擎到底落在哪格
      type: 'scatter', data: selIdx[0] >= 0 && selIdx[1] >= 0 ? [[selIdx[0], selIdx[1]]] : [],
      symbolSize: 26, itemStyle: { color: 'transparent', borderColor: '#1f6feb', borderWidth: 3 }
    }]
  };
}

/** 逐响应 R²：偏协变量前 / 后 两组条，弱信号响应一眼能看出来 */
function r2Option(r, F) {
  const after = r.R2_per_response_partialled || [];
  const before = r.R2_per_response || [];
  if (!after.length) return null;
  const cats = after.map((_, i) => `Y${i + 1}`);
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => ps.map((p) => `${p.seriesName}：${F.fmt(p.value)}`).join('<br/>') },
    legend: { data: ['偏掉协变量后', '原尺度'], top: 8 },
    grid: { left: 62, right: 28, top: 46, bottom: 40 },
    xAxis: { type: 'category', data: cats },
    yAxis: { type: 'value', name: 'R²', min: 0, max: 1 },
    series: [
      { name: '偏掉协变量后', type: 'bar', data: after, markLine: { silent: true, data: [{ yAxis: r.R2_partialled, name: '整体' }], label: { formatter: `整体 ${F.fmt(r.R2_partialled)}` } } },
      { name: '原尺度', type: 'bar', data: before, itemStyle: { opacity: 0.55 } }
    ]
  };
}

/** 载荷双标图：第一/第二典范方向上，X 的 U 载荷与 Y 的 V 载荷同轴 */
function biplotOption(r, F) {
  const U = toRows(r.U); const V = toRows(r.V);
  // S 是**列数**（U 是 p x S、V 是 q x S），不是行数。
  // 上一版按 U.length 判，秩 1 时 p 行照样 >=2 -> 硬画出一张只有一维的"双标图"。
  if (!U.length || !V.length || U[0].length < 2 || V[0].length < 2) return null;
  const scale = (m) => {
    const mx = Math.max(...m.map((c) => Math.max(...c.map(Math.abs)))) || 1;
    return m.map((c) => c.map((x) => (x / mx) * 0.9));
  };
  const Us = scale(U); const Vs = scale(V);
  return {
    tooltip: {
      formatter: (p) => `${p.seriesName} ${p.name}<br/>维度1=${F.fmt(p.value[0])}，维度2=${F.fmt(p.value[1])}`
    },
    legend: { data: ['预测变量 X', '响应变量 Y'], top: 8 },
    grid: { left: 56, right: 28, top: 46, bottom: 48 },
    xAxis: { type: 'value', name: '典范方向 1', min: -1, max: 1 },
    yAxis: { type: 'value', name: '典范方向 2', min: -1, max: 1 },
    series: [
      {
        name: '预测变量 X', type: 'scatter', symbolSize: 11,
        data: Us[0].map((_, i) => ({ name: `X${i + 1}`, value: [Us[0][i], Us[1][i]] })),
        label: { show: true, position: 'right', formatter: '{b}' }
      },
      {
        name: '响应变量 Y', type: 'scatter', symbolSize: 11, symbol: 'rect',
        data: Vs[0].map((_, i) => ({ name: `Y${i + 1}`, value: [Vs[0][i], Vs[1][i]] })),
        label: { show: true, position: 'right', formatter: '{b}' }
      }
    ]
  };
}

export const GMR4_CHART_BUILDERS = {
  selection: (r, F) => selectionOption(r, F),
  cvHeat: (r, F) => cvHeatOption(r, F),
  r2: (r, F) => r2Option(r, F),
  biplot: (r, F) => biplotOption(r, F)
};
