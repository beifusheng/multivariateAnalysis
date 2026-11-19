#!/usr/bin/env node
/**
 * gmr4SheetSpec.js（GMR4 的导入声明 + 导出计划器 + 模板）回归
 * ---------------------------------------------------------------
 *   node r-scripts/tools/test_gmr4_spec.mjs
 *
 * 为什么必须真跑到 R：模板的价值在于"下载→导入→点运行就出结论"。
 * 只断言形状的话，一份统计上站不住的模板照样全绿（Med 模块就这么翻过一次车）。
 * 所以这里从 xlsx 字节开始，走 sheetIo 真解析、真组 payload、真起 Rscript，
 * 最后断言**选型找回真实秩 3**、R² 过下限。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'child_process';
import { createRequire } from 'node:module';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable/bin/Rscript.exe');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gmr4spec-'));
const require_ = createRequire(import.meta.url);

let pass = 0, fail = 0;
const fails = [];
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ` —— ${extra}` : '')); console.log('  ✗ ' + name + (extra ? `\n      ${extra}` : '')); }
};

const { gmr4SheetSpec: spec, sheetIo } = await loadFrontendUtils(['gmr4SheetSpec', 'sheetIo']);
const XLSX = require_(path.join(ROOT, 'frontend/node_modules/xlsx'));

console.log('\n=== 1. 声明本身的形状（视图的外壳靠这些字段循环）===');
t('四张导入表，X/Y 必需、Z/参数可选',
  spec.GMR4_IMPORT_SHEETS.length === 4 &&
    spec.GMR4_IMPORT_SHEETS.filter((s) => s.required).map((s) => s.key).join(',') === 'X,Y',
  JSON.stringify(spec.GMR4_IMPORT_SHEETS.map((s) => [s.key, s.required])));
t('X/Y 都是 matrix kind（sheetIo 只认 sample/coordinate/matrix，写别的等于不解析）',
  spec.GMR4_IMPORT_SHEETS.filter((s) => s.key !== 'params').every((s) => s.kind === 'matrix'),
  spec.GMR4_IMPORT_SHEETS.map((s) => s.kind).join(','));
t('每张表都有 aliasHint 与 desc（缺了提示文案就退化成"缺少表"）',
  spec.GMR4_IMPORT_SHEETS.every((s) => s.aliasHint && s.desc));
t('预览 tab 里 Z/参数是 onlyWhenData（没有也要摆空 tab 就是骗版面）',
  spec.GMR4_PREVIEW_TABS.filter((x) => x.onlyWhenData).map((x) => x.key).join(',') === 'Z,params');
t('导出项 4 个且都有 label/type/fileTag',
  spec.GMR4_EXPORT_OPTIONS.length === 4 &&
    spec.GMR4_EXPORT_OPTIONS.every((o) => o.label && o.type && o.fileTag));
t('默认勾选项在可选项里', spec.GMR4_EXPORT_DEFAULTS.every((k) => spec.GMR4_EXPORT_OPTIONS.some((o) => o.key === k)));
t('纯函数：不碰 DOM、不引 file-saver（否则 Node 里根本测不了）',
  !/^\s*import\s+.*(file-saver|dom)/m.test(fs.readFileSync(path.join(ROOT, 'frontend/src/utils/gmr4SheetSpec.js'), 'utf8')), '注释里出现 file-saver 不算违规，只有真 import 才算');

console.log('\n=== 2. 模板：写进 xlsx 再读回来，形状与确定性 ===');
const sheets = spec.gmr4TemplateSheets();
const wb = XLSX.utils.book_new();
for (const sh of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.aoa), sh.name);
const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
t('模板四张表名可读', wb.SheetNames.join(',') === '预测变量X,响应变量Y,协变量Z,模型参数', wb.SheetNames.join(','));
const aoaOf = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
const Xaoa = aoaOf('预测变量X');
const Yaoa = aoaOf('响应变量Y');
t('X 是 36 样本 × 5 变量（表头一行不算样本）', Xaoa.length - 1 === 36 && Xaoa[0].length === 6,
  `${Xaoa.length - 1} 行 × ${Xaoa[0].length} 列`);
t('Y 是 36 样本 × 8 响应，与 X 同序同数', Yaoa.length === 37 && Yaoa[0].length === 9);
t('样本 ID 两边一致（不一致就配不上对）',
  Xaoa.slice(1).map((r) => r[0]).join('|') === Yaoa.slice(1).map((r) => r[0]).join('|'));
t('模板是确定性的：两次生成逐字节相同',
  JSON.stringify(spec.gmr4TemplateSheets()) === JSON.stringify(sheets),
  '用了 Math.random 之类的不确定源');

console.log('\n=== 3. 真解析 + 真跑 R：模板必须能跑出结论 ===');
// mapWorkbook 的第一参数是 {表名: aoa} 对象（findSheet 靠 Object.keys 取表名）
const asSheets = Object.fromEntries(sheets.map((s) => [s.name, s.aoa]));
const mapRes = sheetIo.mapWorkbook(asSheets, spec.GMR4_IMPORT_SHEETS, { primary: 'X' });
t('mapWorkbook 通过', mapRes.ok === true, mapRes.error || '');
const fields = mapRes.fields;
const patch = spec.gmr4ToFormPatch(fields);   // fields 已经是 mapRes.fields
const Xrows = JSON.parse(patch.xStr || '[]');
const Yrows = JSON.parse(patch.yStr || '[]');
const Zrows = JSON.parse(patch.zStr || '[]');
t('formPatch 拿到行数组而不是列数组', Xrows.length === 36 && Xrows[0].length === 5,
  JSON.stringify([Xrows.length, (Xrows[0] || []).length]));
t('Z 也按样本对齐了 36 行', Zrows.length === 36, String(Zrows.length));
t('参数表解析出 ranks/kfold/seed', (patch.ranks || []).join(',') === '1,2,3,4,5' && patch.kfold === 4 && patch.seed === 12345,
  JSON.stringify([patch.ranks, patch.kfold, patch.seed]));

const payload = { X: Xrows, Y: Yrows, Z: Zrows, ranks: patch.ranks, kfold: patch.kfold, seed: patch.seed };
const fIn = path.join(TMP, 'in.json'), fOut = fIn + '.out', fErr = fIn + '.err';
fs.writeFileSync(fIn, JSON.stringify(payload));
let code = 0;
try {
  execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/gmr4.R'), fIn, fOut, fErr], { stdio: 'pipe', timeout: 600000 });
} catch (e) { code = e.status || 1; }
t('模板真跑通（exit=0）', code === 0, code ? fs.readFileSync(fErr, 'utf8') : '');
let r = null;
if (code === 0) r = JSON.parse(fs.readFileSync(fOut, 'utf8'));
if (r) {
  t('选型找回真实秩 3（模板的设计目的就是演示降秩）', r.rank_selected === 3,
    `选中 S=${r.rank_selected}，解释：${String(r.interpretation).slice(0, 60)}`);
  // 带协变量时必须看"偏掉 Z 之后"的 R² —— 原尺度那个数会被 Z 稀释，
  // 拿它当下限只会逼人把模板做得更假。两个都断言，谁也别骗谁。
  t('偏掉协变量后的整体 R² 过下限（>0.85）', r.R2_partialled > 0.85, String(r.R2_partialled));
  t('原尺度 R² 明显更低（说明 Z 确实带走了变异，两个数不是复制粘贴）',
    r.R2 < r.R2_partialled - 0.02, `${r.R2} vs ${r.R2_partialled}`);
  const rr = r.R2_per_response_partialled;
  t('前 7 个响应 R² > 0.8，第 8 个（故意压弱的 X 载荷）明显更低',
    rr.slice(0, 7).every((v) => v > 0.8) && rr[7] < Math.min(...rr.slice(0, 7)),
    rr.map((v) => v.toFixed(2)).join(' '));
  t('偏掉了 1 个协变量', r.covariates_partialled_out === 1, String(r.covariates_partialled_out));
  t('selection_rule 用中文写清了怎么选的（不是只给个数）',
    /1-SE|SE/.test(r.selection_rule) && /简约/.test(r.selection_rule), r.selection_rule);
  // jsonlite 写矩阵是行优先：coefficients 就是 p 行 × q 列。
  // 这条断言的价值在于"方向"而不是数字 —— 方向搞反时形状常常看着正常。
  t('系数矩阵是 p×q = 5 行 × 8 列（行优先，不转置）',
    r.coefficients.length === 5 && r.coefficients.every((row) => row.length === 8),
    `${r.coefficients.length}×${(r.coefficients[0] || []).length}`);
  t('CV 网格行 = 候选秩个数、列 = lambda 个数',
    r.cv.mean.length === r.rank_grid.length && r.cv.mean[0].length === r.lambda_grid.length,
    JSON.stringify([r.cv.mean.length, r.lambda_grid.length]));
  t('模板不该带出退化诊断（带了就说明示例本身有问题）',
    (r.diagnostics || []).length === 0, JSON.stringify(r.diagnostics));

  console.log('\n=== 4. 导出计划器吃真结果 ===');
  const ctx = { r, analysisResult: r, payload, templateLabel: 'GMR4 示例', diagnostics: r.diagnostics, stamp: '20261119_101500' };
  const jobs = spec.gmr4PlanExport(['excel', 'json', 'coefficients', 'input'], ctx, ctx.stamp);
  t('四项都出得来、文件名带模块名与时间戳',
    jobs.length === 4 && jobs.every((j) => /^GMR4 .*_20261119_101500\.(xlsx|json|csv)$/.test(j.filename)),
    jobs.map((j) => j.filename).join(' , '));
  const xls = jobs.find((j) => j.kind === 'xlsx');
  t('Excel 五张表：结论/选型路径/CV网格/系数矩阵/模型信息',
    xls.sheets.map((s) => s.name).join(',') === '结论,选型路径,CV网格,系数矩阵,模型信息',
    xls.sheets.map((s) => s.name).join(','));
  const concl = xls.sheets[0].aoa;
  t('结论表里 S / lambda / 两个 R² 都在且值非空（原尺度与偏后都要，不让其中一个被拿掉）',
    concl.some((rw) => rw[0] === '选定秩 S' && rw[1] === 3) &&
      concl.some((rw) => rw[0] === '选定 lambda' && Number.isFinite(rw[1])) &&
      concl.some((rw) => rw[0] === '整体 R²（原尺度）' && Number.isFinite(rw[1])) &&
      concl.some((rw) => rw[0] === '整体 R²（偏掉协变量后）' && Number.isFinite(rw[1])),
    JSON.stringify(concl.slice(1)));
  t('选型路径表把 selection_rule 原文带上（用户看得懂的依据）',
    xls.sheets[1].aoa[0][1] === r.selection_rule);
  const cvSheet = xls.sheets[2].aoa;
  t('CV 网格表把 λ 写在表头、S 写在首列，另附标准误与最小点',
    String(cvSheet[1][0]).startsWith('S') && cvSheet.some((rw) => String(rw[0]).includes('CV 最小点')),
    JSON.stringify(cvSheet.slice(0, 2)));
  const csv = jobs.find((j) => j.kind === 'csv');
  t('系数 CSV 是 1 表头 + p 行，每行 1+q 列',
    csv.aoa.length === 6 && csv.aoa[0].length === 9 && csv.aoa[0][0] === 'X\\Y',
    `${csv.aoa.length}×${csv.aoa[0].length}`);
  const inJob = jobs.find((j) => j.kind === 'json' && j.filename.includes('输入'));
  t('输入导出能把 X/Y/Z/参数原样带回来（可复现）',
    inJob.data.X.length === 36 && inJob.data.Y.length === 36 && inJob.data.Z.length === 36 && inJob.data.seed === 12345);
  t('未知 key 不出空任务', spec.gmr4PlanExport(['nope'], ctx, ctx.stamp).length === 0);
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
process.exit(fail ? 1 : 0);
