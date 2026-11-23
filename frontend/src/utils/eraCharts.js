/**
 * Bayesian ERA 的图表构造器（纯函数：结果 + 格式化器 -> echarts option）
 * ---------------------------------------------------------------
 * 与 gmr4Charts / medCharts / nrCharts 同一套约定：
 *  - 不碰 DOM、不 import echarts，能在 Node 里逐键断言；
 *  - 返回 null 表示"这份结果画不出这张图"，由视图决定是**安静说明**还是**开口报警**；
 *    合法空白（数学上就不存在）走 note，真故障走警告 —— 混在一起用户就只会当 bug 报。
 *
 * 森林图的区间画法照 medCharts.buildForestChart 那套已验证过的 custom/renderItem，
 * 只是这里一行格子里要叠三块（直接/间接/总），所以用 **y = 格子序号 + 固定偏移**
 * 把三块挪开：y 轴仍是数值轴，靠 axisLabel.formatter 把序号换成格子名。
 * 不用 category 轴套三条子序列是因为 echarts 的 category 不支持子位置，
 * 而三条独立 series 各占一格会让格子数×3 的标签挤成一团。
 */

const OFFSET = { direct: -0.3, indirect: 0, total: 0.3 };
const COLOR = { direct: '#409eff', indirect: '#e6a23c', total: '#67c23a' };

const isNumArr = (v) => Array.isArray(v) && v.length > 0;

/** 图 1：效应森林图（每格三块：直接 / 间接 / 总，含 95% 区间与 0 参考线） */
export function forestOption(r, F) {
  const e = r.effects;
  if (!e || !isNumArr(e.indirect.mean) || !isNumArr(e.indirect.hdi_lo)) return null;
  const labels = r.cell_labels || [];
  const n = e.indirect.mean.length;
  if (!n) return null;
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      cell: labels[i] || `#${i + 1}`,
      direct: { est: e.direct.mean[i], lo: e.direct.hdi_lo[i], hi: e.direct.hdi_hi[i], ols: e.direct.ols[i] },
      indirect: { est: e.indirect.mean[i], lo: e.indirect.hdi_lo[i], hi: e.indirect.hdi_hi[i], ols: e.indirect.ols[i], p0: e.indirect.prob_gt0[i] },
      total: { est: e.total.mean[i], lo: e.total.hdi_lo[i], hi: e.total.hdi_hi[i] }
    });
  }
  const series = [];
  for (const blk of ['direct', 'indirect', 'total']) {
    const off = OFFSET[blk];
    const iv = e[blk];
    const data = iv.mean.map((_, i) => [i + off, F.num(iv.hdi_lo[i]), F.num(iv.hdi_hi[i])]);
    series.push({
      type: 'custom', name: `${BLK_CN[blk]} · 区间`, z: 1,
      encode: { x: [1, 2], y: 0 },
      data,
      tooltip: {
        formatter: (p) => {
          const i = Math.round(p.data[0]);
          const rr = rows[i];
          const b = rr[blk];
          return `${rr.cell} · ${BLK_CN[blk]}<br/>后验均值 ${F.fmt(b.est, 4)}<br/>` +
            `区间 ${F.fmt(iv.hdi_lo[i], 4)} ~ ${F.fmt(iv.hdi_hi[i], 4)}<br/>` +
            `同数据 OLS ${b.ols === undefined ? '—' : F.fmt(b.ols, 4)}` +
            (b.p0 !== undefined ? `<br/>P(>0) = ${F.fmt(b.p0, 3)}` : '');
        }
      },
      renderItem: (params, api) => {
        const yi = api.value(0);
        const lo = api.coord([api.value(1), yi]);
        const hi = api.coord([api.value(2), yi]);
        const h = api.size([0, 1])[1] * 0.09;
        const style = { stroke: COLOR[blk], lineWidth: 2 };
        return {
          type: 'group',
          children: [
            { type: 'line', shape: { x1: lo[0], y1: lo[1], x2: hi[0], y2: hi[1] }, style },
            { type: 'line', shape: { x1: lo[0], y1: lo[1] - h, x2: lo[0], y2: lo[1] + h }, style },
            { type: 'line', shape: { x1: hi[0], y1: hi[1] - h, x2: hi[0], y2: hi[1] + h }, style }
          ]
        };
      }
    });
    series.push({
      type: 'scatter', name: `${BLK_CN[blk]} · 均值`, z: 2, symbolSize: 9,
      itemStyle: { color: COLOR[blk] },
      data: iv.mean.map((v, i) => [i + off, F.num(v)])
    });
  }
  // 0 参考线挂在第一个 scatter 上：markLine 是 series 级配置，画三次会叠成粗线
  series[1].markLine = {
    silent: true, symbol: 'none',
    label: { formatter: '无效应 0' },
    lineStyle: { color: '#909399', type: 'dashed' },
    data: [{ xAxis: 0 }]
  };
  return {
    _rows: rows,
    grid: { left: 96, right: 40, top: 46, bottom: 46 },
    legend: { top: 8, data: ['直接 · 均值', '间接 · 均值', '总 · 均值'] },
    tooltip: { trigger: 'item' },
    xAxis: { type: 'value', name: '标准化效应', axisLine: { lineStyle: { color: '#909399' } } },
    yAxis: {
      type: 'value', inverse: true, min: -0.5, max: Math.max(0.5, n - 0.5), interval: 1,
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: '#f0f0f0' } },
      // 偏移 -0.3/0/+0.3 也会落到刻度上，非整数一律留空，否则同一格子出现三行标签
      axisLabel: {
        formatter: (v) => (Number.isInteger(v) && rows[v] ? rows[v].cell : '')
      }
    },
    series
  };
}

const BLK_CN = { direct: '直接', indirect: '间接', total: '总' };

/** 高斯核密度（Silverman 带宽）——只用 base 数学，不引新依赖 */
function kde(xs, grid) {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1)) || 1e-6;
  const iqr = (() => {
    const s = xs.slice().sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
    return q(0.75) - q(0.25);
  })();
  // 带宽用 min(sd, iqr/1.34)：单峰厚尾数据里 iqr 更抗离群，写死 sd 会把峰画平
  const h = 0.9 * Math.min(sd, iqr > 0 ? iqr / 1.34 : sd) * Math.pow(n, -0.2);
  if (!(h > 0)) return grid.map(() => 0);
  const c = 1 / (n * h * Math.sqrt(2 * Math.PI));
  return grid.map((g) => {
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const u = (g - xs[i]) / h;
      if (u > -5 && u < 5) acc += Math.exp(-0.5 * u * u);
    }
    return acc * c;
  });
}

/** 图 2：间接效应后验密度（ridge，逐格一行） */
function densityOption(r, F) {
  const d = r.draws && r.draws.ind;
  if (!Array.isArray(d) || !d.length || !Array.isArray(d[0])) return null;
  // orientation 必须钉住：引擎里已经 t() 过，所以 **d.length = 格子数、d[0].length = 抽样数**。
  // 上一版把两者读反，于是要画 600 条“曲线”、每条只 4 个点，全部被 20 点门槛拦下，
  // 最后静默返回 null —— 数据结构上的方向错不会报错，只会产出看上去合理的空结果。
  const cells = d.length;
  const labels = r.cell_labels || [];
  if (labels.length && cells !== labels.length) return null;   // 对不上就不画，不猜
  const lo0 = Math.min(...d.map((row) => Math.min(...row)));
  const hi0 = Math.max(...d.map((row) => Math.max(...row)));
  const pad = (hi0 - lo0) * 0.06 || 0.1;
  const M = 120;
  const grid = Array.from({ length: M }, (_, i) => lo0 - pad + ((hi0 - lo0 + 2 * pad) * i) / (M - 1));
  const series = [];
  const rows = [];
  for (let i = 0; i < cells; i++) {
    const xs = d[i].filter((v) => Number.isFinite(v));
    if (xs.length < 20) continue;
    const dens = kde(xs, grid);
    const scale = Math.max(...dens) || 1;
    series.push({
      type: 'line', name: labels[i] || `#${i + 1}`, smooth: true, symbol: 'none',
      lineStyle: { width: 1.6, color: '#409eff' }, areaStyle: { opacity: 0.18 },
      // ridge：每格抬高一行，幅值按本行最大密度归一，行高 0.8 留一点呼吸
      data: grid.map((g, j) => [g, i + 0.92 - 0.8 * (dens[j] / scale)]),
      tooltip: { formatter: () => `${labels[i]}<br/>密度峰值已归一，纵向位置只表示第 ${i + 1} 格` }
    });
    rows.push({ cell: labels[i] || `#${i + 1}`, lo: r.effects.indirect.hdi_lo[i], hi: r.effects.indirect.hdi_hi[i] });
  }
  if (!series.length) return null;
  return {
    _rows: rows,
    grid: { left: 60, right: 40, top: 30, bottom: 46 },
    tooltip: { trigger: 'item' },
    xAxis: { type: 'value', name: '间接效应（标准化尺度）', min: F.num(lo0 - pad), max: F.num(hi0 + pad) },
    yAxis: {
      type: 'value', inverse: true, min: -0.2, max: series.length - 0.2, interval: 1,
      axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { formatter: (v) => (Number.isInteger(v) && rows[v] ? rows[v].cell : '') }
    },
    series
  };
}

/** 图 3：方差分解堆叠柱（逐响应：X 独有 / X∩M / M 独有 / 残差） */
function partitionOption(r, F) {
  const vp = r.variance_partition;
  if (!vp || !isNumArr(vp.x_unique) || !isNumArr(vp.residual)) return null;
  const cats = Array.from({ length: r.q }, (_, c) => `Y${c + 1}`);
  const blocks = [
    ['x_unique', 'X 独有', '#409eff'],
    ['shared', 'X∩M（经中介）', '#e6a23c'],
    ['m_unique', 'M 独有', '#67c23a'],
    ['residual', '残差', '#c0c4cc']
  ];
  const neg = blocks.some((kk) => vp[kk[0]].some((v) => v < -1e-6));
  return {
    _blocks: blocks.map((b) => ({ key: b[0], name: b[1], values: vp[b[0]] })),
    grid: { left: 60, right: 30, top: 46, bottom: 46 },
    legend: { top: 8, data: blocks.map((b) => b[1]) },
    tooltip: {
      trigger: 'axis',
      formatter: (ps) => `${ps[0].axisValue}<br/>` +
        ps.map((p) => `${p.marker}${p.seriesName} ${F.fmt(p.value, 4)}`).join('<br/>') +
        (neg ? '<br/><b>出现负分量。未调整 R² 下它来自过拟合（shared 的真值本就是 0，估计在 0 两侧飘）；'
          + '调整后 R² 下则来自罚项 —— 两种都不是"共线把数字拉负"，对比文献前先看清口径</b>' : '')
    },
    xAxis: { type: 'category', data: cats },
    yAxis: { type: 'value', name: 'R² 份额' },
    series: blocks.map((b) => ({
      type: 'bar', name: b[1], stack: 'vp', itemStyle: { color: b[2] },
      barMaxWidth: 46, data: vp[b[0]].map((v) => F.num(v))
    }))
  };
}

/** 图 4：收敛诊断（ESS × split-R̂ 散点 + 两条阈值线；越线就是"区间不可信"） */
function diagOption(r, F) {
  const e = r.effects;
  if (!e || !isNumArr(e.indirect.rhat) || !isNumArr(e.indirect.ess)) return null;
  const th = r.thresholds || { rhat_max: 1.05, ess_min: 400 };
  const labels = r.cell_labels || [];
  const pts = [];
  ['direct', 'indirect'].forEach((blk) => {
    e[blk].rhat.forEach((rh, i) => {
      pts.push({
        x: F.num(e[blk].ess[i]), y: F.num(rh),
        name: `${labels[i] || `#${i + 1}`} · ${BLK_CN[blk]}`,
        bad: !(rh <= th.rhat_max && e[blk].ess[i] >= th.ess_min)
      });
    });
  });
  if (!pts.length) return null;
  return {
    _points: pts,
    grid: { left: 70, right: 40, top: 40, bottom: 56 },
    tooltip: {
      trigger: 'item',
      formatter: (p) => `${p.data.name}<br/>ESS ${F.fmt(p.data.value[0], 0)}<br/>split-R̂ ${F.fmt(p.data.value[1], 4)}` +
        (p.data.bad ? '<br/><b>越线：这一格的区间不可信，加大 iterations 重跑</b>' : '')
    },
    xAxis: { type: 'value', name: '有效样本量 ESS', min: 0 },
    yAxis: { type: 'value', name: 'split-R̂', min: 0.98 },
    series: [{
      type: 'scatter', symbolSize: 12,
      data: pts.map((p) => ({ value: [p.x, p.y], name: p.name, itemStyle: { color: p.bad ? '#f56c6c' : '#409eff' } })),
      markLine: {
        silent: true, symbol: 'none',
        lineStyle: { color: '#f56c6c', type: 'dashed' },
        // 标签只写在每一条线上：上一版在外面又接了一个 formatter，里面用
        // p.axisValue / p.marker 反推“这是哪条线”—— echarts 不保证那些字段，
        // 靠它写文案就是一个时而空白时而乱字的标。逐条写定才是确定的。
        data: [{ yAxis: th.rhat_max, label: { formatter: `R̂ 阈值 ${th.rhat_max}` } },
          { xAxis: th.ess_min, label: { formatter: `ESS 阈值 ${th.ess_min}` } }]
      }
    }]
  };
}

/** 空白原因：区分"数学上不存在"与"数据没给够"，前者安静、后者必须开口 */
export const ERA_CHART_BLANK_REASON = {
  forest: 'effects.indirect 的均值或区间',
  density: 'draws.ind（后验抽样）',
  partition: 'variance_partition 的四个分量',
  diag: 'effects.*.rhat / ess'
};

/**
 * 分中介通路：每格拆成“经 M1 / 经 M2 …”的柱子 + 合计间接效应点。
 *
 * 存在的理由就是一个画面：两条强通路反号时，柱子一边正一边负，
 * 而合计的点贴在 0 上 —— 用户于是不会再读成“没有中介”。
 * 被引擎判为抵消的格子在类目上挂个 ⚖，鼠标上去还会再讲一遂。
 */
function pathBarsOption(r, F) {
  const bm = r.indirect_by_mediator;
  // 没有这个块只有两种情况：旧版引擎的输出，或结果本身不完整 —— 两种都宁可不出图
  if (!bm || !Array.isArray(bm.per_mediator) || !bm.per_mediator.length) return null;
  const cells = Array.isArray(bm.cells) && bm.cells.length ? bm.cells : (r.cell_labels || []);
  if (!cells.length) return null;
  const cancelled = new Set(bm.cancelled_cells || []);
  const colors = ['#409eff', '#e6a23c', '#67c23a', '#f56c6c', '#909399', '#b37feb'];
  const series = bm.per_mediator.map((blk, mi) => ({
    type: 'bar',
    name: '经 ' + ((bm.mediator_labels || [])[mi] || 'M' + (mi + 1)),
    itemStyle: { color: colors[mi % colors.length] },
    barMaxWidth: 26,
    data: cells.map((_, ci) => F.num((blk.mean || [])[ci]))
  }));
  series.push({
    type: 'scatter', name: '合计间接（后验均值）', symbolSize: 11,
    itemStyle: { color: '#303133' },
    data: cells.map((_, ci) => F.num((r.effects.indirect.mean || [])[ci]))
  });
  return {
    _cancelled: bm.cancelled_cells || [],
    grid: { left: 62, right: 26, top: 46, bottom: 58 },
    legend: { top: 8 },
    tooltip: {
      trigger: 'axis',
      formatter: (ps) => {
        const nm = String(ps[0].axisValue).replace(/ ⚖$/, '');
        return `${nm}<br/>` + ps.map((p) => `${p.marker}${p.seriesName} ${F.fmt(p.value, 4)}`).join('<br/>') +
          (cancelled.has(nm)
            ? '<br/><b>此格被判定为抵消：两条通路方向相反且量级相当，合计接近 0。'
              + '“间接效应不含 0”不成立不等于“没有中介”。</b>'
            : '');
      }
    },
    xAxis: {
      type: 'category',
      data: cells.map((nm) => (cancelled.has(nm) ? nm + ' ⚖' : nm)),
      axisLabel: { interval: 0, rotate: cells.length > 8 ? 32 : 0, fontSize: 11 }
    },
    yAxis: { type: 'value', name: '标准化通路强度' },
    series
  };
}

export const ERA_CHART_TABS = [
  { id: 'forest', name: '效应森林图', tip: '每格直接/间接/总三块区间与 0 参考线 —— 含不含 0 一眼看出' },
  { id: 'paths', name: '分中介通路', tip: '每格按“经 M1 / 经 M2 …”拆开 + 合计点：两条强通路反号时，合计贴在 0 上但柱子看得见' },
  { id: 'density', name: '间接效应密度', tip: '逐格后验密度（ridge）：区间宽度与"含 0"是两件事，这里看得清' },
  { id: 'partition', name: '方差分解', tip: '逐响应 X 独有 / X∩M / M 独有 / 残差，四块之和必须为 1' },
  { id: 'diag', name: '收敛诊断', tip: 'ESS × split-R̂ 与两条阈值线：越线的格子（红）不该拿来下结论' }
];

export const ERA_CHART_BUILDERS = {
  forest: (r, F) => forestOption(r, F),
  paths: (r, F) => pathBarsOption(r, F),
  density: (r, F) => densityOption(r, F),
  partition: (r, F) => partitionOption(r, F),
  diag: (r, F) => diagOption(r, F)
};
