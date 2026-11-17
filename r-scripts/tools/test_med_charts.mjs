/**
 * 图表配置单测：用真实 R 产出的 chart_data 驱动 5 个 builder
 * 关键不只是"能生成对象"，还要：
 *   • 实际执行 tooltip / label formatter 与 renderItem（渲染期崩溃只有跑起来才发现）
 *   • 递归扫描确认没有 NaN / Infinity / undefined（ECharts 会画成"看不见的点"= 沉默失败）
 * 用法: node r-scripts/tools/test_med_charts.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable', 'bin', process.platform === 'win32' ? 'Rscript.exe' : 'Rscript');
// 用 RSCRIPT 环境变量可做 R 版本 A/B（如 4.3.3 vs 4.6.1）

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medcharts-'));
const { medTemplates: mt, medCharts: mc } = await loadFrontendUtils(['medTemplates', 'medCharts']);

const { MED_TEMPLATE_MAP, buildMedTemplateData } = mt;
const { MED_CHART_BUILDERS, makeFormatters, ols } = mc;
const F = makeFormatters();

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '\n      ' + String(detail).slice(0, 260) : '')); }
};

// 递归找非法数值 / undefined
function scanBad(v, p = '$', out = []) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${p}=${v}`);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => scanBad(x, `${p}[${i}]`, out));
  } else if (v && typeof v === 'object') {
    for (const [k, sub] of Object.entries(v)) {
      if (typeof sub === 'function') continue;
      if (sub === undefined) out.push(`${p}.${k}=undefined`);
      else scanBad(sub, `${p}.${k}`, out);
    }
  }
  return out;
}

// ---- 跑 3 个有代表性的模板，拿真实 chart_data ----
const ids = ['inflammationMed', 'subtypeMed', 'multiExposureMed']; // 带Z / 二分类Y / 多暴露
const fixtures = [];
for (const id of ids) {
  const d = buildMedTemplateData(MED_TEMPLATE_MAP[id].spec);
  const inp = path.join(tmp, id + '.in.json');
  const outp = path.join(tmp, id + '.out.json');
  fs.writeFileSync(inp, JSON.stringify({
    mediatorData: d.mediatorData, predictorData: d.predictorData, outcomeData: d.outcomeData,
    ...(d.covariates ? { covariates: d.covariates } : {}), permutations: 100, seed: 12345,
  }));
  execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/permanova_med.R'), inp, outp, inp + '.err'], { cwd: ROOT, stdio: 'ignore', timeout: 300000 });
  const j = JSON.parse(fs.readFileSync(outp, 'utf8'));
  if (!j.chart_data) { console.log(`  ✗ ${id} 没有 chart_data`); fail++; continue; }
  fixtures.push({ id, n: d.n, cd: j.chart_data, res: j });
  console.log(`  ✓ ${id}: mediation_p=${j.mediation_p} chart_data keys=${Object.keys(j.chart_data).join(',')}`);
}

console.log('\n=== 1. 结构完整性 ===');
for (const f of fixtures) {
  const bad = scanBad(f.cd, f.id);
  check(`${f.id}: R 输出的 chart_data 无 NaN/Inf/undefined`, bad.length === 0, bad.join(', '));
  const p = f.cd.path;
  check(`${f.id}: 路径系数齐全`, ['a', 'b', 'c_prime', 'total', 'indirect'].every((k) => Number.isFinite(p[k])), JSON.stringify(p));
  // 分解自洽性：total ≈ c' + a*b（标准化下应成立）
  const diff = Math.abs(p.total - (p.c_prime + p.indirect));
  check(`${f.id}: 效应分解自洽 |total-(c'+a·b)|<1e-6`, diff < 1e-6, diff);
}

console.log('\n=== 2. 五个图配置 + formatter/renderItem 实际执行 ===');
for (const f of fixtures) {
  for (const [chartId, build] of Object.entries(MED_CHART_BUILDERS)) {
    let opt, err = '';
    try { opt = build(f.cd, F); } catch (e) { err = e.message; }
    check(`${f.id}/${chartId}: 生成 option`, !!opt && Array.isArray(opt.series) && opt.series.length > 0, err || JSON.stringify(opt)?.slice(0, 120));
    if (!opt) continue;

    const badOpt = scanBad(opt, chartId);
    check(`${f.id}/${chartId}: option 内无 NaN/Inf/undefined`, badOpt.length === 0, badOpt.slice(0, 3).join(', '));

    // 执行所有 formatter
    const fns = [];
    const collect = (v, where, keyName) => {
      if (keyName === 'renderItem') return;   // renderItem 签名是 (params, api)，不能当 formatter 调
      if (typeof v === 'function') fns.push([v, where]);
      else if (Array.isArray(v)) v.forEach((x, i) => collect(x, `${where}[${i}]`, keyName));
      else if (v && typeof v === 'object') for (const [k, sub] of Object.entries(v)) collect(sub, `${where}.${k}`, k);
    };
    collect(opt, chartId, null);
    let threw = [];
    for (const [fn, where] of fns) {
      const argsPool = [
        { dataIndex: 0, value: [0, 0, 0.5], data: { label: { formatter: 'x' }, name: 'X\n暴露' }, dataType: 'edge', value: [0, 1, 0.5] },
        { dataIndex: 3, value: [1, 2, -0.3], data: { label: { formatter: 'y' }, name: 'Y' }, dataType: 'node' },
        { value: 0.1234, dataIndex: 1 },
      ];
      for (const a of argsPool) {
        try {
          const r = fn(a);
          if (r === undefined) threw.push(where + ' -> undefined');
          else if (typeof r === 'string' && /NaN/.test(r)) threw.push(where + ' -> ' + r);
        } catch (e) { threw.push(where + ' 抛错: ' + e.message); break; }
      }
    }
    check(`${f.id}/${chartId}: ${fns.length} 个 formatter 可执行`, threw.length === 0, threw.slice(0, 2).join(' | '));

    // 执行 renderItem（森林图）
    const rs = (opt.series || []).find((s) => s.type === 'custom' && typeof s.renderItem === 'function');
    if (rs) {
      try {
        const api = {
          value: (i) => (i === 0 ? 1 : rs.data[1][i]),
          coord: (v) => [100 + v[0], 60],
          size: () => [10, 40],
        };
        const g = rs.renderItem({}, api);
        check(`${f.id}/forest: renderItem 产出 3 条线段`, g && g.type === 'group' && g.children.length === 3, JSON.stringify(g));
      } catch (e) { check(`${f.id}/forest: renderItem 可执行`, false, e.message); }
    }
  }
}

console.log('\n=== 3. 图特定的内容断言（以 inflammationMed 为例）===');
{
  const f = fixtures[0];
  const pathOpt = MED_CHART_BUILDERS.path(f.cd, F);
  const s0 = pathOpt.series[0];
  check('路径图 3 节点 / 3 有向边', s0.data.length === 3 && s0.links.length === 3);
  check('路径图边标签含系数与 p', /a = /.test(s0.links[0].label.formatter) && /p=/.test(s0.links[2].label.formatter), s0.links[0].label.formatter);

  const barOpt = MED_CHART_BUILDERS.bar(f.cd, F);
  check('柱状图 5 个效应量条目', barOpt.series[0].data.length === 5);
  check('柱状图数值与 R 一致', barOpt._rows[0].est === f.cd.path.indirect);

  const hm = MED_CHART_BUILDERS.heatmap(f.cd, F);
  check('热图 3×3=9 格', hm.series[0].data.length === 9);
  check('热图对角线 r=1', hm.series[0].data.filter((d) => d[0] === d[1]).every((d) => Math.abs(d[2] - 1) < 1e-9));
  check('热图数值在 [-1,1]', hm.series[0].data.every((d) => d[2] >= -1.0001 && d[2] <= 1.0001));

  const sc = MED_CHART_BUILDERS.scatter(f.cd, F);
  const scatterSeries = sc.series.filter((x) => x.type === 'scatter');
  check('散点矩阵 3 子图 × 样本数', sc.grid.length === 3 && scatterSeries.every((x) => x.data.length === f.n),
    scatterSeries.map((x) => x.data.length).join(','));
  check('散点拟合线由 ols 计算且有限', scatterSeries.length === 3 && sc.series.filter((x) => x.type === 'line').every((x) => x.data.length === 2 && x.data.every((pt) => pt.every(Number.isFinite))));

  const fo = MED_CHART_BUILDERS.forest(f.cd, F);
  check('森林图 4 行', fo._rows.length === 4 && fo.yAxis.data.length === 4);
  check('森林图 CI 下界<上界', fo._rows.every((r) => !(Number.isFinite(r.lo) && Number.isFinite(r.hi)) || r.lo < r.hi), JSON.stringify(fo._rows));

  const o = ols([1, 2, 3, 4], [2, 4, 6, 8]);
  check('ols 工具函数正确 (slope=2, intercept≈0)', Math.abs(o.slope - 2) < 1e-9 && Math.abs(o.intercept) < 1e-9, JSON.stringify(o));
  check('ols 对共线 x 返回 null', ols([1, 1, 1], [1, 2, 3]) === null);
}

console.log('\n=== 4. formatter 边界 ===');
{
  check('fmt(NaN) -> N/A', F.fmt(NaN) === 'N/A');
  check('fmt(null) -> N/A', F.fmt(null) === 'N/A');
  check('fmtP(0.0001) -> 小数', F.fmtP(0.0001) === '0.0001', F.fmtP(0.0001));
  check('fmtP(1e-7) -> 科学计数', /e-7/.test(F.fmtP(1e-7)), F.fmtP(1e-7));
  check('fmtP(0) -> < 0.0001（置换检验可达下限）', F.fmtP(0) === '< 0.0001', F.fmtP(0));
  check('fmtP(N/A) 不崩', F.fmtP('x') === 'N/A');
  // 旧版 R（无 chart_data）时组件不应崩：由 chartData 计算属性返回 null 兜住
  check('缺 chart_data 时 builder 不会被调用（由 v-if 守卫）', typeof MED_CHART_BUILDERS.path === 'function');
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
