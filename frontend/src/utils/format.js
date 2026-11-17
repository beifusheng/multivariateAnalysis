/**
 * 数值格式化（视图与图表共用）
 * 从 medCharts.js 提出：Non-random PERMANOVA / GMR⁴ / Bayesian ERA 也要用同一套
 * 口径，否则同一个 p 值会在表格里显示 0.0001、图里显示 1.0e-4。
 */
export function makeFormatters() {
  const fmt = (v, d = 4) =>
    v === null || v === undefined || !Number.isFinite(Number(v)) ? 'N/A' : Number(v).toFixed(d);
  const fmtP = (v) => {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return 'N/A';
    const p = Number(v);
    if (p <= 0) return '< 0.0001';
    return p < 0.0001 ? p.toExponential(2) : p.toFixed(4);
  };
  const num = (v, d = 6) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(Number(v).toFixed(d)));
  return { fmt, fmtP, num };
}
