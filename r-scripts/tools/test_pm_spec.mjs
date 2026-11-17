#!/usr/bin/env node
/**
 * permanovaSheetSpec.js（PERMANOVA 的导入声明 + 导出计划器）回归
 * ---------------------------------------------------------------
 * 选 (B) 之后，这个模块的导入语义变严了：表名走别名、缺必需表指名拒绝、
 * 样本数据一律按距离矩阵的样本 ID 重排。这三件事都必须能被断言，
 * 否则"更严格"就等于"更不可预测"。
 *
 *   node r-scripts/tools/test_pm_spec.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'child_process';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable/bin/Rscript.exe');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pmspec-'));

let pass = 0, fail = 0;
const fails = [];
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ` —— ${extra}` : '')); console.log('  ✗ ' + name + (extra ? `\n      ${extra}` : '')); }
};

const { permanovaSheetSpec: spec, sheetIo } = await loadFrontendUtils(['permanovaSheetSpec', 'sheetIo']);

// ---- 先拿一份真的 R 结果当 ctx（字段名漂移只有真跑才会暴露）----
const DIST = [
  ['样本', 'S1', 'S2', 'S3', 'S4'],
  ['S1', 0, 0.35, 0.42, 0.28],
  ['S2', 0.35, 0, 0.38, 0.45],
  ['S3', 0.42, 0.38, 0, 0.52],
  ['S4', 0.28, 0.45, 0.52, 0]
];
const SAMPLE_ROWS = [
  ['样本', 'Group', 'Age'],
  ['S1', 'Control', 25],
  ['S2', 'Control', 28],
  ['S3', 'Treatment', 30],
  ['S4', 'Treatment', 27]
];
const FORMULA = [['模型公式'], ['Y ~ Group + Age']];

const matrix = DIST.slice(1).map((r) => r.slice(1).map(Number));
const params = {
  distanceMatrix: matrix,
  sampleData: { 样本: ['S1', 'S2', 'S3', 'S4'], Group: ['Control', 'Control', 'Treatment', 'Treatment'], Age: [25, 28, 30, 27] },
  formula: 'Y ~ Group + Age',
  permutations: 99
};
const inPath = path.join(TMP, 'in.json');
fs.writeFileSync(inPath, JSON.stringify(params));
const rErr = execFileSync(RSCRIPT, [path.join(ROOT, 'r-scripts/permanova.R'), inPath, inPath + '.out', inPath + '.err'],
  { stdio: 'pipe', timeout: 300000 });
if (fs.existsSync(inPath + '.err') && fs.readFileSync(inPath + '.err', 'utf8').trim() && !fs.existsSync(inPath + '.out')) {
  console.log('R 报错：' + fs.readFileSync(inPath + '.err', 'utf8'));
  process.exit(1);
}
const json = JSON.parse(fs.readFileSync(inPath + '.out', 'utf8'));
t('真跑 R 拿到结果', !!json && !json.error, JSON.stringify(json).slice(0, 200));

const ctx = {
  analysisResult: json,
  params: { distanceMatrix: matrix, sampleData: params.sampleData, formula: params.formula, permutations: 99 }
};

// ---------------------------------------------------------------- 导入声明
console.log('\n=== 1. 导入声明 ===');
t('三张表：距离矩阵/样本数据必需，模型公式可选',
  spec.PM_IMPORT_SHEETS.length === 3 &&
  spec.PM_IMPORT_SHEETS.filter((s) => s.required).map((s) => s.key).join(',') === 'distance,sample',
  JSON.stringify(spec.PM_IMPORT_SHEETS.map((s) => [s.key, s.required])));
t('每项都有外壳要的 label/desc/aliasHint',
  spec.PM_IMPORT_SHEETS.every((s) => s.label && s.desc && s.aliasHint));
const kindProbe = spec.PM_IMPORT_SHEETS.map((s) => {
  // 故意丢一“形状对但内容不是数”的表，看它是不是走进了自己 kind 的解析器
  const wb = { '距离矩阵': DIST, '样本数据': SAMPLE_ROWS, [s.label]: [['样本', 'x'], ['S1', '不是数'], ['S2', 2], ['S3', 3], ['S4', 4]] };
  const r = sheetIo.mapWorkbook(wb, spec.PM_IMPORT_SHEETS, { primary: 'distance' });
  return { kind: s.kind, err: r.error || '' };
});
t('每个 kind 都落到自己的解析器（报错指名那张表，不是“没找到表”）',
  kindProbe.every((p) => p.err.startsWith(`${p.kind === 'distance' ? '距离矩阵' : p.kind === 'sample' ? '样本数据' : '模型公式'}：`) ||
    (p.kind === 'sample' && !p.err)),
  JSON.stringify(kindProbe));
const good = sheetIo.mapWorkbook(
  { '距离矩阵': DIST, '样本数据': SAMPLE_ROWS, '模型公式': FORMULA },
  spec.PM_IMPORT_SHEETS, { primary: 'distance' });
t('模板三张表能过', good.ok === true, good.error);
t('样本顺序取自主表（距离矩阵）', (good.ids || []).join(',') === 'S1,S2,S3,S4', (good.ids || []).join(','));

// ---------------------------------------------------------------- 别名
console.log('\n=== 2. 表名别名（旧版是精确名 + 位置兜底）===');
const alias = sheetIo.mapWorkbook(
  { 'Distance Matrix': DIST, 'Sample Data': SAMPLE_ROWS, '公式': FORMULA },
  spec.PM_IMPORT_SHEETS, { primary: 'distance' });
t('英文表名也能认', alias.ok === true, alias.error);
const pos = sheetIo.mapWorkbook(
  { 'Sheet1': DIST, 'Sheet2': SAMPLE_ROWS },
  spec.PM_IMPORT_SHEETS, { primary: 'distance' });
t('表名完全对不上时 -> 明确拒绝（不再按位置猜）', pos.ok === false && /距离矩阵/.test(pos.error || ''), pos.error);

// ---------------------------------------------------------------- 缺表
console.log('\n=== 3. 缺表与脏数据 ===');
const noSample = sheetIo.mapWorkbook({ '距离矩阵': DIST }, spec.PM_IMPORT_SHEETS, { primary: 'distance' });
t('缺样本数据 -> 指名缺哪张表', noSample.ok === false && /样本数据/.test(noSample.error) && /没找到/.test(noSample.error), noSample.error);
const noDist = sheetIo.mapWorkbook({ '样本数据': SAMPLE_ROWS }, spec.PM_IMPORT_SHEETS, { primary: 'distance' });
t('缺距离矩阵 -> 指名缺哪张表', noDist.ok === false && /距离矩阵/.test(noDist.error), noDist.error);
const notSquare = sheetIo.mapWorkbook({ '距离矩阵': [DIST[0], DIST[1], DIST[2]], '样本数据': SAMPLE_ROWS }, spec.PM_IMPORT_SHEETS, { primary: 'distance' });
t('非方阵被拒（旧版会静默截成 3×3）', notSquare.ok === false && /方阵/.test(notSquare.error || ''), notSquare.error);
const missingSample = sheetIo.mapWorkbook(
  { '距离矩阵': DIST, '样本数据': [SAMPLE_ROWS[0], SAMPLE_ROWS[1], SAMPLE_ROWS[2], SAMPLE_ROWS[3]] },
  spec.PM_IMPORT_SHEETS, { primary: 'distance' });
t('样本数据少一个样本 -> 拒绝并指名 S4', missingSample.ok === false && /S4/.test(missingSample.error || ''), missingSample.error);
const extraSample = sheetIo.mapWorkbook(
  { '距离矩阵': DIST, '样本数据': [SAMPLE_ROWS[0], SAMPLE_ROWS[1], SAMPLE_ROWS[2], SAMPLE_ROWS[3], SAMPLE_ROWS[4], ['S9', 'X', 1]] },
  spec.PM_IMPORT_SHEETS, { primary: 'distance' });
t('样本数据多出的样本 -> 警告并忽略（不静默）', extraSample.ok === true && extraSample.warnings.some((w) => /S9/.test(w)), extraSample.warnings.join(' | '));
const numericGroup = sheetIo.mapWorkbook(
  { '距离矩阵': DIST, '样本数据': [['样本', 'Group'], ['S1', 1], ['S2', 2], ['S3', 1], ['S4', 2]] },
  spec.PM_IMPORT_SHEETS, { primary: 'distance' });
t('分组列全数值 -> 提醒（R 会当连续变量用）', numericGroup.warnings.some((w) => /Group/.test(w) && /数值/.test(w)), numericGroup.warnings.join(' | '));
const badFormula = sheetIo.mapWorkbook(
  { '距离矩阵': DIST, '样本数据': SAMPLE_ROWS, '模型公式': [['模型公式'], ['Group + Age']] },
  spec.PM_IMPORT_SHEETS, { primary: 'distance' });
t('公式缺因变量 -> 拒绝并给出写法', badFormula.ok === false && /Y ~/ .test(badFormula.error || ''), badFormula.error);
const noFormulaSheet = sheetIo.mapWorkbook({ '距离矩阵': DIST, '样本数据': SAMPLE_ROWS }, spec.PM_IMPORT_SHEETS, { primary: 'distance' });
t('模型公式表可选，缺了只是提示', noFormulaSheet.ok === true, noFormulaSheet.error);

// ---------------------------------------------------------------- 表单补丁
console.log('\n=== 4. pmToFormPatch：交给引擎的形状 ===');
const patch = spec.pmToFormPatch(good.fields, good.ids);
t('distanceMatrix 是纯数值二维数组（不含样本名）',
  Array.isArray(patch.distanceMatrix) && patch.distanceMatrix.length === 4 && Number.isFinite(patch.distanceMatrix[0][1]),
  JSON.stringify(patch.distanceMatrix && patch.distanceMatrix[0]));
t('distanceMatrixStr 与 distanceMatrix 一致', JSON.parse(patch.distanceMatrixStr).length === 4);
const dictKeys = Object.keys(patch.sampleData);
t('sampleData 第一列必须是样本 ID（R 按位置取）', dictKeys[0] === '样本', dictKeys.join(','));
t('每列长度 = 样本数', dictKeys.every((k) => patch.sampleData[k].length === 4), JSON.stringify(patch.sampleData));
t('formula 传下去了', patch.formula === 'Y ~ Group + Age', patch.formula);

// 本模块选 (B) 的核心理由：Excel 里把样本数据排过序，旧版按行号静默错位
const shuffled = sheetIo.mapWorkbook(
  { '距离矩阵': DIST, '样本数据': [['样本', 'Group', 'Age'], ['S4', 'Treatment', 27], ['S2', 'Control', 28], ['S1', 'Control', 25], ['S3', 'Treatment', 30]] },
  spec.PM_IMPORT_SHEETS, { primary: 'distance' });
const p2 = spec.pmToFormPatch(shuffled.fields, shuffled.ids);
t('样本数据表被排过序 -> 仍按距离矩阵顺序重排', p2.sampleData['样本'].join(',') === 'S1,S2,S3,S4', p2.sampleData['样本'].join(','));
t('重排后 Age 跟着样本走（25,28,30,27）', p2.sampleData.Age.join(',') === '25,28,30,27', p2.sampleData.Age.join(','));
t('重排后 Group 跟着样本走', p2.sampleData.Group.join(',') === 'Control,Control,Treatment,Treatment', p2.sampleData.Group.join(','));

// ---------------------------------------------------------------- 预览
console.log('\n=== 5. 预览 tabs（外壳只摆不看业务）===');
const tabs = sheetIo.previewFromFields(good.ids, good.fields.distance, good.fields, {});
t('三张表都出预览', tabs.map((x) => x.name).join(',') === 'distance,sample,formula', tabs.map((x) => x.name).join(','));
t('距离矩阵 tab 标题带尺寸', /4 × 4/.test(tabs[0].label), tabs[0].label);
t('距离矩阵预览第一列是样本名', tabs[0].cols[0] === '样本' && tabs[0].rows[0]['样本'] === 'S1');
t('公式 tab 里能看到公式原文', tabs[2].rows[0]['公式'] === 'Y ~ Group + Age', JSON.stringify(tabs[2].rows));

// ---------------------------------------------------------------- 导出
console.log('\n=== 6. planExport ===');
t('导出项 label 与旧版逐字一致',
  spec.PM_EXPORT_OPTIONS.slice(0, 4).map((o) => o.label).join('|') ===
  '完整结果 (JSON)|PERMANOVA 表格 (Excel)|PCoA 坐标 (Excel)|当前图表 (PNG)',
  spec.PM_EXPORT_OPTIONS.map((o) => o.label).join('|'));
const all = spec.planExport(spec.PM_EXPORT_OPTIONS.map((o) => o.key), ctx, '2026-01-01T00-00-00');
t('勾 5 项出 5 个任务', all.length === 5, all.length);
t('文件名前缀保持原样', all.map((j) => j.filename.split('_2026')[0]).join('|') ===
  'PERMANOVA 结果|PERMANOVA 表|PCoA 坐标|分析图表|PERMANOVA 输入', all.map((j) => j.filename).join(' , '));
t('后缀按类型走', all.map((j) => j.filename.split('.').pop()).join(',') === 'json,xlsx,xlsx,png,json',
  all.map((j) => j.filename).join(','));
t('未知 key 不会产生空文件', spec.planExport(['nope'], ctx, 'x').length === 0);
t('PNG 任务只带文件名，内容由视图执行', all[3].type === 'png' && !all[3].data && !all[3].sheets);
t('JSON 任务就是 analysisResult 本体', all[0].data === json);

const permJob = all[1];
const permAoa = permJob.sheets[0].aoa;
t('PERMANOVA 表有表头 + 数据行', permAoa.length > 1 && permAoa[0].length > 1, JSON.stringify(permAoa[0]));
t('表名还是那张 PERMANOVA', permJob.sheets[0].name === 'PERMANOVA', permJob.sheets[0].name);
const pIdx = permAoa[0].findIndex((h) => /^(p|p_value|p\s*值)$/i.test(String(h).trim()));
t('p 值列里是真数（空=字段没接上）', pIdx >= 0 && Number.isFinite(Number(permAoa[1][pIdx])), JSON.stringify({ head: permAoa[0], row: permAoa[1] }));
t('没有一个单元格出现 undefined/null 字面量', !JSON.stringify(permAoa).includes('null,null'), '');

const pcoaJob = all[2];
const pcoaAoa = pcoaJob.sheets[0].aoa;
t('PCoA 列名与旧版逐字一致', pcoaAoa[0].join(',') === '样本 ID,PCoA1,PCoA2,分组,分组变量', pcoaAoa[0].join(','));
t('PCoA 行数 = 样本数 + 表头', pcoaAoa.length === (json.pcoa?.samples?.length || 0) + 1, `${pcoaAoa.length}`);
t('PCoA 坐标是真数', Number.isFinite(Number(pcoaAoa[1][1])) && Number.isFinite(Number(pcoaAoa[1][2])), JSON.stringify(pcoaAoa[1]));
t('每个样本都有分组（不允许空着）', pcoaAoa.slice(1).every((r) => String(r[3]).length > 0), JSON.stringify(pcoaAoa.slice(1)));

const empty = spec.planExport(['permanovaTable', 'pcoaCoords'], { analysisResult: null, params: {} }, 'x');
t('没结果时只出表头，不抛异常', empty[0].sheets[0].aoa.length === 1 && empty[1].sheets[0].aoa.length === 1);
const inputJob = spec.planExport(['input'], ctx, 'y')[0];
t('下载输入带矩阵/样本数据/公式/置换数',
  ['distanceMatrix', 'sampleData', 'formula', 'permutations'].every((k) => k in inputJob.data),
  Object.keys(inputJob.data).join(','));

// ---------------------------------------------------------------- 模板
console.log('\n=== 7. 下载模板 ===');
const tpl = spec.pmTemplateSheets();
t('模板四张表且表名不变', tpl.map((x) => x[0]).join(',') === '距离矩阵,样本数据,模型公式,填写说明', tpl.map((x) => x[0]).join(','));
t('模板自身能被自己的声明读回去（写出→读回整链）', (() => {
  const wb = {};
  tpl.forEach(([name, aoa]) => { wb[name] = aoa; });
  return sheetIo.mapWorkbook(wb, spec.PM_IMPORT_SHEETS, { primary: 'distance' }).ok === true;
})(), sheetIo.mapWorkbook(Object.fromEntries(tpl.map(([n, a]) => [n, a])), spec.PM_IMPORT_SHEETS, { primary: 'distance' }).error);
t('模板示例是 5 样本方阵', tpl[0][1].length === 6 && tpl[0][1][0].length === 6);

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
