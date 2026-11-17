/**
 * PERMANOVA-med 演示模板回归校验
 * ---------------------------------------------------------------------------
 * 把 frontend/src/utils/medTemplates.js 里的全部模板真正跑一遍便携版 R，确认：
 *   1) 生成的数据合法（维度对齐、非负整数计数、无 NaN/Inf、变量非常量）
 *   2) permanova_med.R 能跑通（不报 subscript out of bounds 之类）
 *   3) 中介效应可检出（mediation_p < 0.05）
 * 目的：前端「载入模板 → 运行分析」的每个按钮都必须是实测可用的。
 *
 * 用法（项目根目录，需 node + r-portable）：
 *   node r-scripts/tools/verify_med_templates.mjs
 *   node r-scripts/tools/verify_med_templates.mjs --ids gutDrugMed,pco2Med
 *   node r-scripts/tools/verify_med_templates.mjs --keep   # 保留中间 json 以便排查
 *
 * 退出码：0 = 全部跑通；1 = 存在运行/数据失败
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const IS_WIN = process.platform === 'win32';
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable', 'bin', process.platform === 'win32' ? 'Rscript.exe' : 'Rscript');
// 用 RSCRIPT 环境变量可做 R 版本 A/B（如 4.3.3 vs 4.6.1）
const MED_R = path.join(ROOT, 'r-scripts', 'permanova_med.R');
const SRC = path.join(ROOT, 'frontend', 'src', 'utils', 'medTemplates.js');

const argv = process.argv.slice(2);
const idx = argv.indexOf('--ids');
const onlyIds = idx === -1 ? null : argv[idx + 1].split(',').map((s) => s.trim()).filter(Boolean);
const keep = argv.includes('--keep');

if (!fs.existsSync(RSCRIPT)) { console.error('找不到便携版 R:', RSCRIPT); process.exit(1); }
if (!fs.existsSync(MED_R)) { console.error('找不到分析脚本:', MED_R); process.exit(1); }

// medTemplates.js 是 ESM 语法但 frontend 不是 module 包，复制成 .mjs 让 node 能导入
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'medcheck-'));
const mjs = path.join(tmp, 'medTemplates.mjs');
fs.copyFileSync(SRC, mjs);
const mod = await import(pathToFileURL(mjs).href);
const { MED_TEMPLATE_GROUPS, buildMedTemplateData } = mod;

const allFinite = (v) =>
  Array.isArray(v) ? v.every(allFinite) : typeof v === 'number' && Number.isFinite(v);

const items = [];
for (const g of MED_TEMPLATE_GROUPS) for (const it of g.items) items.push(it);
const targets = onlyIds ? items.filter((it) => onlyIds.includes(it.id)) : items;
if (targets.length === 0) { console.error('--ids 没有匹配到任何模板'); process.exit(1); }

console.log('校验模板数: ' + targets.length + ' / ' + items.length);
console.log('Rscript: ' + RSCRIPT);
console.log('分析脚本: ' + MED_R + '\n');

const rows = [];
for (const it of targets) {
  const d = buildMedTemplateData(it.spec);

  // ---- 1) 数据合法性 ----
  const valid =
    d.predictorData.length === d.n &&
    d.outcomeData.length === d.n &&
    d.mediatorData.length === d.n &&
    d.mediatorData.every((r) => r.length === d.taxa && r.every((v) => Number.isInteger(v) && v >= 0)) &&
    allFinite(d.mediatorData) && allFinite(d.predictorData) &&
    allFinite(d.outcomeData) && (!d.covariates || allFinite(d.covariates)) &&
    new Set(d.predictorData.flat()).size > 1 &&
    new Set(d.outcomeData.flat()).size > 1;

  const inp = path.join(tmp, it.id + '.in.json');
  const outp = path.join(tmp, it.id + '.out.json');
  const errp = path.join(tmp, it.id + '.err.txt');
  const payload = {
    mediatorData: d.mediatorData,
    predictorData: d.predictorData,
    outcomeData: d.outcomeData,
    permutations: 100,
    seed: 12345,
  };
  if (d.covariates) payload.covariates = d.covariates;
  fs.writeFileSync(inp, JSON.stringify(payload));

  // ---- 2) 真实跑 R ----
  let status = 'ok';
  let msg = '';
  const t0 = Date.now();
  try {
    execFileSync(RSCRIPT, [MED_R, inp, outp, errp], {
      cwd: ROOT, stdio: 'ignore', timeout: 300000,
    });
  } catch (e) {
    status = 'run_fail';
    const last = fs.existsSync(errp)
      ? fs.readFileSync(errp, 'utf8').trim().split('\n').slice(-1)[0]
      : e.message;
    msg = last;
  }
  const ms = Date.now() - t0;

  // ---- 3) 读结果 ----
  let p = null, fx = null, fy = null, sig = null;
  if (status === 'ok') {
    if (!fs.existsSync(outp)) {
      status = 'no_output'; msg = 'R 未写出结果文件';
    } else {
      const j = JSON.parse(fs.readFileSync(outp, 'utf8'));
      p = j.mediation_p;
      sig = !!j.significant_mediation;
      fx = j.covariate_tests && j.covariate_tests[0] ? j.covariate_tests[0].F_statistic : null;
      fy = j.covariate_tests && j.covariate_tests[1] ? j.covariate_tests[1].F_statistic : null;
      if (typeof p !== 'number') { status = 'bad_result'; msg = '结果缺少 mediation_p'; }
    }
  }
  if (status === 'ok' && !valid) { status = 'invalid_data'; msg = '数据未通过合法性检查'; }

  rows.push({ id: it.id, n: d.n, taxa: d.taxa, valid, status, p, fx, fy, sig, ms, msg });
  const mark = status !== 'ok' ? 'NG' : sig ? 'ok' : '! ';
  const fmt = (v, w, f) => (v == null ? '  -' : f(v)).toString().padStart(w);
  console.log(
    mark + ' ' + it.id.padEnd(24) +
    ' n=' + String(d.n).padStart(3) +
    ' taxa=' + String(d.taxa).padStart(3) +
    ' p=' + fmt(p, 7, (v) => v.toFixed(4)) +
    ' FX=' + fmt(fx, 6, (v) => v.toFixed(2)) +
    ' FY=' + fmt(fy, 6, (v) => v.toFixed(2)) +
    ' ' + String(ms).padStart(5) + 'ms' +
    (msg ? '  ' + msg : '')
  );
}

const failed = rows.filter((r) => r.status !== 'ok');
const notSig = rows.filter((r) => r.status === 'ok' && !r.sig);
const times = rows.map((r) => r.ms);

console.log('\n──────── 汇总 ────────');
console.log('运行成功 : ' + (rows.length - failed.length) + '/' + rows.length);
console.log('数据合法 : ' + rows.filter((r) => r.valid).length + '/' + rows.length);
console.log('中介显著 : ' + rows.filter((r) => r.status === 'ok' && r.sig).length + '/' + rows.length);
console.log('单模板耗时: ' + Math.min(...times) + 'ms ~ ' + Math.max(...times) + 'ms');
if (failed.length) console.log('失败清单: ' + failed.map((f) => f.id + '(' + f.msg + ')').join(', '));
if (notSig.length) console.log('不显著: ' + notSig.map((f) => f.id + '(p=' + f.p + ')').join(', '));
if (keep) console.log('中间文件保留: ' + tmp);
else fs.rmSync(tmp, { recursive: true, force: true });

process.exit(failed.length ? 1 : 0);
