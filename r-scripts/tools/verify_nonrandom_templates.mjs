#!/usr/bin/env node
/**
 * Non-random PERMANOVA 模板回归验证
 * ---------------------------------------------------------------
 * 每个模板都带 expect（自由/受限置换各自应当 sig 还是 ns），本脚本把 26 条模板
 * 全部通过真实 Rscript 跑一遍，断言实测 p 值与预期一致。
 *
 * 为什么断言 p 而不是断言「能跑完」：这些模板的价值就在于「换置换方案会换结论」，
 * 如果哪天数据生成器或 R 脚本改坏了，教学案例会悄悄退化成「两种方案都显著」，
 * 只看 success===true 是发现不了的。
 *
 * 用法：
 *   node r-scripts/tools/verify_nonrandom_templates.mjs               # 全部 26 条
 *   node r-scripts/tools/verify_nonrandom_templates.mjs confounded    # 只跑 id 含该词的
 *   node r-scripts/tools/verify_nonrandom_templates.mjs --group=teaching
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
const ALPHA = 0.05;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nrcheck-'));

const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith('--'));
const groupFilter = (args.find((a) => a.startsWith('--group=')) || '').split('=')[1];
// 重复次数：>=2 时额外断言「同模板重跑结果完全一致」
const repeat = Number((args.find((a) => a.startsWith('--repeat=')) || '').split('=')[1] || 1);

if (!fs.existsSync(RSCRIPT)) {
  console.error(`未找到 Rscript：${RSCRIPT}\n先跑 scripts/setup-r-runtime.ps1 装配运行时`);
  process.exit(1);
}

const { nonrandomTemplates: nrt } = await loadFrontendUtils(['nonrandomTemplates']);

const runOne = (payload, tag) => {
  const inPath = path.join(TMP, `${tag}.json`);
  const outPath = inPath + '.out.json';
  const errPath = inPath + '.err.txt';
  fs.writeFileSync(inPath, JSON.stringify(payload));
  try {
    execFileSync(RSCRIPT, [SCRIPT, inPath, outPath, errPath], { encoding: 'utf8', timeout: 180000, stdio: 'pipe' });
  } catch (e) {
    const err = fs.existsSync(errPath) ? fs.readFileSync(errPath, 'utf8') : (e.message || '');
    return { ok: false, error: err.trim().split('\n').slice(-3).join(' / ') };
  }
  if (!fs.existsSync(outPath)) return { ok: false, error: '没有写出 output.json' };
  const json = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  return json.success ? { ok: true, json } : { ok: false, error: json.error || '未知错误' };
};

const verdict = (p) => (p === null || p === undefined ? 'na' : p < ALPHA ? 'sig' : 'ns');
const cmp = (a, b) => {
  if (a === b) return true;
  if (a === 'na' && b === 'ns') return true; // ns 覆盖 na（无法判定按不显著处理）
  return false;
};

const rows = [];
let passAll = 0;
let failAll = 0;
const failures = [];
const t0 = Date.now();
let idx = 0;

console.log('Non-random PERMANOVA 模板回归');
console.log(`  运行时: ${path.relative(ROOT, RSCRIPT)}  ·  脚本: ${path.relative(ROOT, SCRIPT)}`);
console.log(`  判定阈值: p < ${ALPHA} 为 sig\n`);
console.log('  ' + ['模板'.padEnd(26), '方案'.padEnd(11), 'p_free'.padStart(7), 'p_con'.padStart(7), '预期free'.padStart(8), '预期con'.padStart(8), '判定'].join(' '));
console.log('  ' + '-'.repeat(92));

for (const g of nrt.NR_TEMPLATE_GROUPS) {
  if (groupFilter && g.id !== groupFilter) continue;
  for (const item of g.items) {
    if (filter && !item.id.includes(filter) && !(item.label || '').includes(filter)) continue;
    idx++;
    const built = nrt.buildNonrandomTemplateData(item.spec);
    const res = runOne(built.payload, `nr${idx}`);
    if (!res.ok) {
      failAll++;
      failures.push(`${item.id}: R 运行失败 —— ${res.error}`);
      console.log('  ' + [item.id.padEnd(26), (built.scheme || '').padEnd(11), '-', '-', '-', '-', '❌ R失败'].join(' '));
      continue;
    }
    const j = res.json;
    const o = j.observed;
    const pf = o.p_free;
    const pc = o.p_constrained;
    const gotFree = verdict(pf);
    const gotCon = verdict(pc);
    const exp = item.spec.expect || {};
    const reasons = [];

    if (exp.free && !cmp(exp.free, gotFree)) reasons.push(`p_free=${pf} 预期 ${exp.free} 实测 ${gotFree}`);
    if (exp.constrained && !cmp(exp.constrained, gotCon)) reasons.push(`p_con=${pc} 预期 ${exp.constrained} 实测 ${gotCon}`);

    // 置换真的执行了（不是退化成一个值）
    const perf = j.permutation.performed;
    const req = j.permutation.requested;
    if (!(perf >= req * 0.9)) reasons.push(`performed=${perf} < 请求数 90%(${req})`);
    if (built.scheme !== 'free' && !(j.permutation.feasible_blocks > 0)) reasons.push('没有可用区组');

    // 自洽：同一个 F 才能比较两个 p
    const F = o.F_model;
    if (Math.abs((j.chart_data.null.observed || 0) - F) > 1e-6) reasons.push('null.observed 与 F 不一致');
    for (const c of j.chart_data.comparison || []) {
      if (Math.abs(c.F - F) > 1e-6) reasons.push('comparison 的 F 与主结果不一致');
    }
    if (!(F > 0) || !isFinite(F)) reasons.push(`F 非法(${F})`);
    if (!(o.R2 >= 0 && o.R2 <= 1)) reasons.push(`R² 越界(${o.R2})`);

    // 图表数据必须是真实算出来的（能画）
    const cd = j.chart_data;
    const vals = cd.null.values || [];
    if (!(vals.length >= 100)) reasons.push(`零分布点太少(${vals.length})，直方图不可用`);
    // R 侧为控制 JSON 体积把零分布抽样下采样到 ≤500 点，所以这里只能断言「不超过真数」
    if (vals.length > cd.null.n_used) reasons.push(`零分布点数(${vals.length}) 超过 performed(${cd.null.n_used})`);
    if (!((cd.pcoa || {}).x || []).length || cd.pcoa.x.length !== j.model.n_samples) reasons.push('PCoA 点数与样本数不符');
    if (((cd.pcoa || {}).group || []).length !== j.model.n_samples) reasons.push('PCoA 分组长度不符');
    if (!(cd.variance || []).length) reasons.push('variance 为空');

    // 教学保证：旗舰案例必须演示出「自由显著、受限不显著」的差距
    if (item.id === 'confoundedBlock' && !((pc || 0) - (pf || 0) > 0.3)) {
      reasons.push(`旗舰案例差距不足（Δp=${((pc || 0) - (pf || 0)).toFixed(3)}，需 > 0.3）`);
    }

    // scheme=free 时 constrained 与 free 是同一次检验，p 必须相同
    if (built.scheme === 'free' && pf !== pc) reasons.push('scheme=free 时两个 p 不应不同');

    if (repeat > 1) {
      const again = runOne(built.payload, `nr${idx}r`);
      if (!again.ok) reasons.push('复跑失败');
      else if (again.json.observed.p_constrained !== pc || again.json.observed.p_free !== pf) {
        reasons.push(`不可复现（复跑 p=${again.json.observed.p_free}/${again.json.observed.p_constrained}）`);
      }
    }

    const ok = reasons.length === 0;
    if (ok) passAll++;
    else { failAll++; failures.push(`${item.id}: ${reasons.join('; ')}`); }
    console.log('  ' + [
      item.id.padEnd(26),
      String(j.permutation.scheme).padEnd(11),
      String(pf).padStart(7),
      String(pc).padStart(7),
      String(exp.free || '-').padStart(8),
      String(exp.constrained || '-').padStart(8),
      ok ? '✅' : '❌ ' + reasons.join('; ')
    ].join(' '));
  }
}

console.log('  ' + '-'.repeat(92));
console.log(`  通过 ${passAll} / ${passAll + failAll}　耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failures.length) {
  console.log('\n失败明细:');
  failures.forEach((f) => console.log('  - ' + f));
}
fs.rmSync(TMP, { recursive: true, force: true });
// 机器可读结果行：run_all_tests.mjs 只认这种 ASCII 契约，
// 不再去猜各家散文式收尾（曾经五种格式，两种被猜成 NO-SUMMARY 当成失败）
console.log('RESULT pass=' + passAll + ' fail=' + failAll);
process.exit(failures.length ? 1 : 0);
