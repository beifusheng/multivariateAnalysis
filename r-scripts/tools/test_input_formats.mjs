/**
 * 输入格式归一化等价性测试
 * 同一份数据的三种写法（矩阵 / 行字典 / 列字典）必须得到完全一致的统计结果，
 * 以此证明 R 侧的转置方向与消歧逻辑正确。
 * 用法: node r-scripts/tools/test_input_formats.mjs
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
// 用 RSCRIPT 环境变量可做 R 版本 A/B（如 4.3.3 vs 4.6.1）);
const MED_R = path.join(ROOT, 'r-scripts', 'permanova_med.R');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-'));
// medTemplates.js 现在依赖 ./rng.js，直接复制成 .mjs 会断，走统一的 ESM 沙箱
const { medTemplates: { MED_TEMPLATE_MAP, buildMedTemplateData } } = await loadFrontendUtils(['medTemplates']);

// 行字典：键=样本，值=该样本的各变量
const rowDict = (m, prefix) => {
  const o = {};
  m.forEach((row, i) => { o[`${prefix}${i + 1}`] = row; });
  return o;
};
// 列字典：键=变量，值=各样本该变量的值
const colDict = (m, names) => {
  const o = {};
  m[0].forEach((_, j) => { o[names?.[j] ?? `V${j + 1}`] = m.map((r) => r[j]); });
  return o;
};

const runR = (payload, tag) => {
  const inp = path.join(tmp, tag + '.in.json');
  const outp = path.join(tmp, tag + '.out.json');
  const errp = path.join(tmp, tag + '.err.txt');
  fs.writeFileSync(inp, JSON.stringify(payload));
  let ok = true, err = '';
  try {
    execFileSync(RSCRIPT, [MED_R, inp, outp, errp], { cwd: ROOT, stdio: 'ignore', timeout: 300000 });
  } catch (e) {
    ok = false;
    err = (fs.existsSync(errp) ? fs.readFileSync(errp, 'utf8').trim() : e.message)
      .split('\n').filter((l) => /Error|错误|样本|格式/.test(l)).slice(-2).join(' | ');
  }
  if (!ok) return { ok, err };
  const j = JSON.parse(fs.readFileSync(outp, 'utf8'));
  return { ok, p: j.mediation_p, FX: j.covariate_tests[0].F_statistic, FY: j.covariate_tests[1].F_statistic,
           nvar: j.model_info?.mediator_vars ?? null };
};

// ---------- 等价性：用带协变量的模板 ----------
const id = 'inflammationMed';
const d = buildMedTemplateData(MED_TEMPLATE_MAP[id].spec);
console.log(`模板 ${id}: n=${d.n}, M=${d.taxa} 变量, X=${d.predictorData[0].length}, Y=${d.outcomeData[0].length}, Z=${d.covariates[0].length}\n`);

const base = { permutations: 100, seed: 12345 };
const variants = {
  'A 矩阵(现状)': { ...base, mediatorData: d.mediatorData, predictorData: d.predictorData, outcomeData: d.outcomeData, covariates: d.covariates },
  'B 行字典M/X/Y + 列字典Z': { ...base, mediatorData: rowDict(d.mediatorData, 'Sample'), predictorData: rowDict(d.predictorData, 'Sample'),
      outcomeData: rowDict(d.outcomeData, 'Sample'), covariates: colDict(d.covariates, d.varLabels.z) },
  'C 列字典M/X/Y': { ...base, mediatorData: colDict(d.mediatorData, null), predictorData: colDict(d.predictorData, d.varLabels.x),
      outcomeData: colDict(d.outcomeData, d.varLabels.y), covariates: colDict(d.covariates, d.varLabels.z) },
  'D 单变量裸向量X/Y': { ...base, mediatorData: d.mediatorData, predictorData: d.predictorData.map((r) => r[0]),
      outcomeData: d.outcomeData.map((r) => r[0]) },
};

const res = {};
for (const [tag, payload] of Object.entries(variants)) res[tag] = runR(payload, tag.replace(/\W/g, ''));

console.log('格式                        结果      mediation_p   FX     FY');
for (const [tag, r] of Object.entries(res)) {
  console.log(tag.padEnd(26), r.ok ? '成功' : '失败  ', r.ok ? String(r.p.toFixed(4)).padEnd(13) : '',
    r.ok ? r.FX?.toFixed(3).padEnd(6) : '', r.ok ? r.FY?.toFixed(3) : '', r.ok ? '' : '\n   ' + r.err);
}
const okv = Object.entries(res).filter(([, r]) => r.ok);
const same = okv.length > 1 && okv.every(([, r]) => Math.abs(r.p - okv[0][1].p) < 1e-12);
console.log('\n可解析格式数: ' + okv.length + '/' + Object.keys(variants).length);
console.log(okv.length === 0 ? '❌ 全部失败' :
  (same ? '✅ 多格式结果完全一致（转置方向正确）' : '⚠️ 不同格式结果不一致 -> 存在方向/消歧错误'));

// ---------- 错误信息可读性 ----------
console.log('\n=== 坏输入的报错是否可读 ===');
const badCases = {
  '长度不一致': { ...base, mediatorData: { S1: [1, 2, 3], S2: [1, 2], S3: [1, 2, 3] }, predictorData: d.predictorData, outcomeData: d.outcomeData },
  '样本数对不上': { ...base, mediatorData: d.mediatorData, predictorData: d.predictorData.slice(0, 5), outcomeData: d.outcomeData },
  '含非数值': { ...base, mediatorData: d.mediatorData, predictorData: rowDict(d.predictorData.map((r) => ['Control', ...r.slice(1)]), 'S'), outcomeData: d.outcomeData },
  '样本太少': { ...base, mediatorData: [[1, 2], [3, 4]], predictorData: [[1], [0]], outcomeData: [[1], [0]] },
};
for (const [tag, payload] of Object.entries(badCases)) {
  const r = runR(payload, 'bad_' + tag.replace(/\W/g, ''));
  console.log(`\n[${tag}] -> ${r.ok ? '居然成功了(需检查)' : '如预期失败'}`);
  console.log('  ' + (r.err || '(无错误摘要)').slice(0, 300));
}
fs.rmSync(tmp, { recursive: true, force: true });
