#!/usr/bin/env node
/**
 * nonrandomSheetSpec.js（导入表声明 + 导出计划器）回归
 * ---------------------------------------------------------------
 * 这份声明是"导出内容对不对"第一次变成可断言的东西：以前 build 逻辑写在视图 methods 里，
 * 只能人肉打开 Excel 数格子。现在 planExport 是纯函数，吃 ctx 吐任务表。
 *
 *   node r-scripts/tools/test_nr_spec.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'node:url';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const pick = (p) => pathToFileURL(path.join(ROOT, p)).href;
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable/bin/Rscript.exe');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nrspec-'));

let pass = 0, fail = 0;
const fails = [];
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ` —— ${extra}` : '')); console.log('  ✗ ' + name + (extra ? `\n      ${extra}` : '')); }
};

const { nonrandomTemplates: nrt, nonrandomSheetSpec: spec, sheetIo } = await loadFrontendUtils(
  ['nonrandomTemplates', 'nonrandomSheetSpec', 'sheetIo']);

// ---- 真跑一次 R，拿真实 chart_data / observed 当 ctx ----
const built = nrt.buildNonrandomTemplateData(nrt.NR_TEMPLATE_MAP.confoundedBlock.spec);
const inPath = path.join(TMP, 'in.json');
fs.writeFileSync(inPath, JSON.stringify(built.payload));
execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/nonrandom_permanova.R'), inPath, inPath + '.out', inPath + '.err'],
  { stdio: 'pipe', timeout: 180000 });
const json = JSON.parse(fs.readFileSync(inPath + '.out', 'utf8'));

const mkCtx = (over = {}) => ({
  r: {
    tested_term: json.observed.tested_term,
    F: json.observed.F_model,
    R2: json.observed.R2,
    p_free: json.observed.p_free,
    p_constrained: json.observed.p_constrained,
    scheme: json.permutation.scheme,
    requested: json.permutation.requested,
    performed: json.permutation.performed,
    feasible_blocks: json.permutation.feasible_blocks,
    dropped_blocks: json.permutation.dropped_blocks,
    seed: json.permutation.seed,
    table: json.anova_table || []
  },
  analysisResult: json,
  cd: json.chart_data,
  payload: built.payload,
  verdict: '是（自由置换假阳性）',
  interpretation: json.interpretation,
  permInfo: [{ label: '置换方案', value: json.permutation.scheme }],
  modelInfo: [{ label: '公式', value: json.model.formula }],
  templateLabel: 'confoundedBlock（合成演示数据）',
  chartTabName: '结论对比',
  ...over
});

console.log('\n[1] 导入声明本身');
t('三张表：物种矩阵/样本信息必填，坐标可选',
  spec.NR_IMPORT_SHEETS.filter((s) => s.required).length === 2 &&
  spec.NR_IMPORT_SHEETS.find((s) => s.key === 'coordinate').required === false);
t('每张表都有 aliasHint（缺表提示要用它，没有就会说"可叫 undefined"）',
  spec.NR_IMPORT_SHEETS.every((s) => (s.aliasHint || '').length > 3),
  spec.NR_IMPORT_SHEETS.map((s) => s.key).join(','));
t('kind 都在 sheetIo 的解析器表里', spec.NR_IMPORT_SHEETS.every((s) => s.parser === undefined));
t('声明里不再有没人读的 parser 字段',
  !JSON.stringify(spec.NR_IMPORT_SHEETS).includes('parser'));

console.log('\n[2] 导出项声明');
const keys = spec.NR_EXPORT_OPTIONS.map((o) => o.key);
t('6 个导出项', keys.length === 6, keys.join(','));
t('key 不重复', new Set(keys).size === keys.length);
t('label 都带内容说明（用户在勾选框里看的就是这句）',
  spec.NR_EXPORT_OPTIONS.every((o) => o.label.length >= 6), spec.NR_EXPORT_OPTIONS.map((o) => o.label).join(' | '));
t('默认勾上的项都存在', spec.NR_EXPORT_DEFAULTS.every((k) => keys.includes(k)), spec.NR_EXPORT_DEFAULTS.join(','));
t('默认只勾 Excel + JSON（和另外两个模块一致的默认量）',
  spec.NR_EXPORT_DEFAULTS.join(',') === 'excel,json');

console.log('\n[3] planExport：勾了就出任务，没勾就不出');
{
  const ctx = mkCtx();
  const jobs = spec.planExport(keys, ctx, 'STAMP');
  t('勾满 6 项 -> 6 个任务', jobs.length === 6, JSON.stringify(jobs.map((j) => j.type)));
  t('任务类型正确', jobs.map((j) => j.type).join(',') === 'xlsx,xlsx,xlsx,json,json,png', jobs.map((j) => j.type).join(','));
  t('文件名带模块名/标签/时间戳/正确后缀',
    jobs.every((j) => j.filename.startsWith('Non-random-PERMANOVA_') && j.filename.includes('_STAMP.')),
    jobs.map((j) => j.filename).join(' | '));
  t('xlsx 后缀是 .xlsx，json 是 .json，png 是 .png',
    jobs[0].filename.endsWith('.xlsx') && jobs[3].filename.endsWith('.json') && jobs[5].filename.endsWith('.png'));
  t('PNG 文件名用当前图表名', jobs[5].filename.includes('结论对比'), jobs[5].filename);
  t('只勾两项 -> 只出两个任务，顺序按勾选走',
    spec.planExport(['json', 'excel'], ctx, 'S').map((j) => j.type).join(',') === 'json,xlsx');
  t('不存在的 key 被忽略（不会静默出个空文件）',
    spec.planExport(['excel', '不存在'], ctx, 'S').length === 1);

  console.log('\n[4] Excel 内容是真数，不是占位');
  const main = jobs[0];
  t('主结果工作簿 4 张表', main.sheets.map((x) => x[0]).join('|') === '结论对比|逐术语检验|置换执行|模型信息',
    main.sheets.map((x) => x[0]).join('|'));
  const cmp = main.sheets[0][1];
  const rowOf = (k) => cmp.find((r) => r[0] === k);
  t('结论对比里 p（自由置换）是真数', rowOf('p（自由置换）') && Number.isFinite(Number(rowOf('p（自由置换）')[1])),
    JSON.stringify(rowOf('p（自由置换）')));
  t('结论对比里观测 F 与 R 一致',
    Math.abs(Number(rowOf('观测 F')[1]) - json.observed.F_model) < 1e-9);
  t('结论是否被置换方案改变 = ctx.verdict', rowOf('结论是否被置换方案改变')[1] === ctx.verdict);
  t('解释文案来自 R（不是前端写死）', rowOf('解释')[1] === json.interpretation);
  t('数据说明用了 templateLabel', rowOf('数据说明')[1] === ctx.templateLabel);
  t('没有一行第二列是空的（空=字段没接上）',
    cmp.slice(1).every((r) => r[1] !== '' && r[1] !== undefined && r[1] !== null),
    JSON.stringify(cmp.filter((r) => r[1] === '' || r[1] == null)));

  console.log('\n[5] PCoA / 零分布 的行数对得上真结果');
  const pcoa = jobs[1].sheets[0][1];
  t('PCoA 行数 = 样本数 + 表头', pcoa.length === json.model.n_samples + 1, `${pcoa.length}`);
  t('PCoA 每行 5 列且 PC1/PC2 是数',
    pcoa.slice(1).every((r) => r.length === 5 && Number.isFinite(Number(r[3])) && Number.isFinite(Number(r[4]))));
  const nl = jobs[2].sheets[0][1];
  t('零分布两列都有值（受限 + 自由都要）',
    nl.length > 100 && nl.slice(1).every((r) => r[0] !== '' && r[1] !== ''), `${nl.length}`);

  console.log('\n[6] JSON 任务带的是原始对象本身');
  t('json 任务 data === analysisResult（没被裁剪）', jobs[3].data === json);
  t('input 任务 data === payload', jobs[4].data === built.payload);

  console.log('\n[7] 缺图/缺结果时不炸');
  const bare = spec.planExport(['pcoa', 'null'], mkCtx({ cd: {} }), 'S');
  t('没有 chart_data 也只出表头，不抛异常',
    bare.length === 2 && bare[0].sheets[0][1].length === 1 && bare[1].sheets[0][1].length === 1);
  t('chartTabName 缺省时 PNG 文件名叫图表',
    spec.planExport(['png'], mkCtx({ chartTabName: '' }), 'S')[0].filename.includes('图表'));
}

console.log('\n[8] nrToFormPatch：解析结果 -> 表单字符串，形状不能变');
{
  const sheets = await (async () => {
    const XLSX = await import(pick('frontend/node_modules/xlsx/xlsx.mjs'));
    const wb = XLSX.utils.book_new();
    for (const [n, aoa] of spec.nrTemplateSheets().filter(([n]) => n !== '填写说明')) {
      wb.SheetNames.push(n);
      wb.Sheets[n] = XLSX.utils.aoa_to_sheet(aoa);
    }
    return { XLSX, wb };
  })();
  const { XLSX, wb } = sheets;
  const aoaOf = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false, defval: '' });
  const asSheets = {
    物种矩阵: aoaOf('物种矩阵'),
    样本信息: aoaOf('样本信息'),
    坐标: aoaOf('坐标')
  };
  const res = sheetIo.mapWorkbook(asSheets, spec.NR_IMPORT_SHEETS, { primary: 'community' });
  t('mapWorkbook 成功', res.ok === true, res.error);
  t('无警告（模板本身是干净数据）', res.warnings.length === 0, res.warnings.join(' | '));
  const patch = spec.nrToFormPatch(res.fields);
  const comm = JSON.parse(patch.communityStr);
  const samp = JSON.parse(patch.sampleStr);
  const co = JSON.parse(patch.coordinatesStr);
  t('物种矩阵 12×6 数值', comm.length === 12 && comm[0].length === 6 && comm[0][0] === 39, JSON.stringify(comm[0]));
  t('样本信息行数与主表一致', samp.length === 12, String(samp.length));
  t('分组跟着样本走', samp[0].group === 'Case' && samp[11].group === 'Control', samp.map((r) => r.group).join(','));
  t('坐标 12 行 2 列', co.length === 12 && co[0].length === 2, String(co.length));
  t('patch 不含 coordinatesStr 以外的多余键',
    Object.keys(patch).sort().join(',') === 'communityStr,coordinatesStr,sampleStr', Object.keys(patch).join(','));

  const noCoord = sheetIo.mapWorkbook(
    { 物种矩阵: asSheets['物种矩阵'], 样本信息: asSheets['样本信息'] },
    spec.NR_IMPORT_SHEETS, { primary: 'community' });
  t('没有坐标表时不报错（坐标是可选）', noCoord.ok === true && noCoord.fields.coordinate === undefined);
  t('此时 patch 里没有 coordinatesStr', spec.nrToFormPatch(noCoord.fields).coordinatesStr === undefined);

  const need = sheetIo.mapWorkbook(
    { 物种矩阵: asSheets['物种矩阵'], 样本信息: asSheets['样本信息'] },
    spec.NR_IMPORT_SHEETS, { primary: 'community', needKeys: ['coordinate'], needLabel: '空间受限置换' });
  t('声明需要坐标却没给 -> 警告而不是失败',
    need.ok === true && need.warnings.some((w) => /没有坐标表/.test(w)), need.warnings.join(' | '));

  const bad = sheetIo.mapWorkbook({ 样本信息: asSheets['样本信息'] }, spec.NR_IMPORT_SHEETS, { primary: 'community' });
  t('缺主表 -> 明确拒绝', bad.ok === false && /物种矩阵/.test(bad.error), bad.error);
}

console.log('\n[引擎提醒通路] 引擎说“这次不可能显著”时，导出里不能丢');
{
  const diag = ['受限置换的零分布退化：999 次置换里只有 2 个互不相同的统计量，p 的理论下界约 0.270。'];
  const jobs = spec.planExport(['excel'], mkCtx({ diagnostics: diag }), 'STAMP');
  const summary = jobs[0].sheets.find((x) => x[0] === '结论对比')[1];
  t('Excel 结论对比里带上引擎提醒',
    summary.some((r) => String(r[0] || '').includes('引擎提醒') && String(r[1] || '').includes('零分布退化')),
    JSON.stringify(summary.slice(-2)));
  const none = spec.planExport(['excel'], mkCtx({ diagnostics: [] }), 'S')[0].sheets.find((x) => x[0] === '结论对比')[1];
  t('没有提醒时不多塞一行', !none.some((r) => String(r[0] || '').includes('引擎提醒')), JSON.stringify(none.slice(-1)));
  t('旧 R 脚本没有 diagnostics 字段也不炸', (() => {
    try { spec.planExport(['excel'], mkCtx({ diagnostics: undefined }), 'S'); return true; } catch (e) { return false; }
  })());
  t('多条提醒各占一行',
    spec.planExport(['excel'], mkCtx({ diagnostics: ['甲问题', '乙问题'] }), 'S')[0].sheets
      .find((x) => x[0] === '结论对比')[1].filter((r) => String(r[0] || '').includes('引擎提醒')).length === 2);
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); }
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
