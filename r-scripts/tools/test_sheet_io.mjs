#!/usr/bin/env node
/**
 * sheetIo.js（Excel/CSV 导入导出底层）回归
 * ---------------------------------------------------------------
 * 关键做法：真把模板工作簿写出来、再用 readWorkbook 读回来解析，
 * 而不是只测纯函数——"下载模板 -> 用户填 -> 上传"这条链的两端必须是同一套约定。
 *
 * 用法：node r-scripts/tools/test_sheet_io.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');
// Windows 下 Node ESM 不接受绝对路径，必须是 file:// URL
const pick = (p) => pathToFileURL(path.join(ROOT, p)).href;
const XLSX = await import(pick('frontend/node_modules/xlsx/xlsx.mjs'));
const mod = await import(pick('frontend/src/utils/sheetIo.js'));
const {
  SHEET_ALIASES, findSheet, parseCommunitySheet, parseSampleSheet, parseCoordinateSheet,
  parseDistanceSheet, alignBySampleId, buildTemplateSheets, writeWorkbook, workbookOf, readWorkbook
} = mod;

let pass = 0;
const fails = [];
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? ` —— ${extra}` : '')); console.log(`  ✗ ${name}${extra ? `\n      ${extra}` : ''}`); }
};
const aoaToBook = (sheets) => {
  const wb = XLSX.utils.book_new();
  for (const [n, aoa] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
  return wb;
};
const bookToFile = (wb, name = 'x.xlsx') => {
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buf], name);
};

console.log('\n[1] 模板工作簿 -> 读回 -> 解析（整链）');
const tpl = buildTemplateSheets();
t('模板含 4 张表', tpl.length === 4, tpl.map((x) => x[0]).join(','));
for (const need of ['物种矩阵', '样本信息', '坐标']) {
  t(`模板里有「${need}」表`, tpl.some(([n]) => n === need));
}
const tplFile = bookToFile(aoaToBook(tpl));
const back = await readWorkbook(tplFile);
t('readWorkbook 认全部 sheet', Object.keys(back).length === 4, Object.keys(back).join(','));
const comm = findSheet(back, 'community');
const samp = findSheet(back, 'sample');
const coord = findSheet(back, 'coordinate');
t('按别名找到物种矩阵表', !!comm && comm.name === '物种矩阵', comm && comm.name);
const pc = parseCommunitySheet(comm.aoa);
t('物种矩阵解析成功', pc.ok === true, pc.error);
t('6 样本 × 8 物种', pc.ids.length === 6 && pc.matrix.every((r) => r.length === 8), `${pc.ids.length}×${(pc.matrix[0] || []).length}`);
t('物种名取自表头', pc.species[0] === 'Bacteroides' && pc.species.length === 8, (pc.species || []).join(','));
t('数值类型正确', pc.matrix[0][0] === 42 && typeof pc.matrix[0][0] === 'number');
const ps = parseSampleSheet(samp.aoa);
t('样本信息解析成功', ps.ok === true, ps.error);
t('样本信息列为 group/strata', ps.columns.join(',') === 'group,strata', ps.columns.join(','));
const pco = parseCoordinateSheet(coord.aoa);
t('坐标解析成功', pco.ok === true && pco.coords.length === 6, pco.error);
const al = alignBySampleId(pc, ps);
t('按 ID 对齐成功', al.ok === true, al.error);
t('对齐后行数与群落矩阵一致', al.rows.length === pc.ids.length);
t('分组跟着样本走（S1=Case, S6=Control）', al.rows[0].group === 'Case' && al.rows[5].group === 'Control',
  al.rows.map((r) => r.group).join(','));

console.log('\n[2] 下载模板再上传，得到的必须就是模板里那份数据');
// 浏览器里 writeWorkbook 会走 saveAs 下载；这里取它同样的工作簿对象写入内存，
// 相当于“用户下载后原封不动上传”，验证两端约定一致
const tplWb = workbookOf(XLSX, tpl);
t('模板工作簿 sheet 名与顺序正确', tplWb.SheetNames.join('|') === '物种矩阵|样本信息|坐标|填写说明', tplWb.SheetNames.join('|'));
t('sheet 名超长会被截到 31 字符（Excel 硬限制）',
  workbookOf(XLSX, [['表名'.repeat(20), [['a']]]]).SheetNames[0].length === 31);
const tplBytes = XLSX.write(tplWb, { bookType: 'xlsx', type: 'array' });
const diskFile = new File([tplBytes], 'nr-tpl.xlsx');
t('写出的 xlsx 不是空文件', tplBytes.byteLength > 1000, String(tplBytes.byteLength));
const back2 = await readWorkbook(diskFile);
t('readWorkbook 读回 4 张表', Object.keys(back2).length === 4);
t('两次解析结果一致（可复现）',
  JSON.stringify(parseCommunitySheet(findSheet(back2, 'community').aoa)) === JSON.stringify(pc));

console.log('\n[3] 真实脏数据：表名/表头写法五花八门');
for (const [kind, names] of Object.entries(SHEET_ALIASES)) {
  for (const n of names.slice(0, 3)) {
    const sheets = kind === 'community'
      ? { [n]: [['样本', 'sp1'], ['A', 1], ['B', 2]] }
      : kind === 'sample'
        ? { [n]: [['样本', 'group'], ['A', 'X'], ['B', 'Y']] }
        : { [n]: [['样本', 'x', 'y'], ['A', 0, 0], ['B', 1, 1]] };
    const hit = findSheet(sheets, kind);
    t(`别名「${n}」能被认作 ${kind} 表`, !!hit && hit.name === n, hit ? '' : '未命中');
  }
}
t('无关表名不误命中', findSheet({ 随便写的: [[1]] }, 'community') === null);

console.log('\n[4] 顺序错位：必须按 ID 重排，不能按行号');
const shuffledComm = { ok: true, ids: ['S3', 'S1', 'S2'], matrix: [[1], [2], [3]] };
const shuffledSample = { ok: true, ids: ['S1', 'S2', 'S3'], rows: [{ g: 'a' }, { g: 'b' }, { g: 'c' }], columns: ['g'] };
const fixed = alignBySampleId(shuffledComm, shuffledSample);
t('乱序样本被重排（S3->c, S1->a, S2->b）',
  fixed.rows.map((r) => r.g).join(',') === 'c,a,b', fixed.rows.map((r) => r.g).join(','));
const lost = alignBySampleId({ ok: true, ids: ['S1', 'S9'], matrix: [[1], [2]] }, shuffledSample);
t('缺样本时明确拒绝并列出是谁', !lost.ok && /S9/.test(lost.error), lost.error);
const surplus = alignBySampleId({ ok: true, ids: ['S1'], matrix: [[1]] }, shuffledSample);
t('多余样本不阻断，但报出来', surplus.ok === true && surplus.extra.length === 2, JSON.stringify(surplus.extra));

console.log('\n[5] 该拒绝的必须拒绝（不能悄悄补 0 或按行号猜）');
t('丰度非数值 -> 报错并定位', !parseCommunitySheet([['样本', 'a', 'b'], ['S1', 1, 'NA']]).ok);
const badCell = parseCommunitySheet([['样本', 'a', 'b'], ['S1', 1, 'xx'], ['S2', 2, 3]]);
t('报错包含行列位置', !badCell.ok && /第 2 行/.test(badCell.error) && /第 2 个物种/.test(badCell.error), badCell.error);
t('重复样本 ID -> 报错', !parseCommunitySheet([['样本', 'a'], ['S1', 1], ['S1', 2]]).ok);
t('只有表头 -> 报错', !parseCommunitySheet([['样本', 'a']]).ok);
t('空行被跳过', parseCommunitySheet([['样本', 'a'], ['S1', 1], ['', ''], ['S2', 2]]).ids.length === 2);
t('行名式表头（第一格空）也认', parseCommunitySheet([['', 'a', 'b'], ['S1', 1, 2]]).ok === true);
t('行名式表头取到列名', parseCommunitySheet([['', 'a', 'b'], ['S1', 1, 2]]).species.join(',') === 'a,b');
const numericGroup = parseSampleSheet([['样本', 'group'], ['S1', 1], ['S2', 2]]);
t('数值型分组转成字符串（否则 R 会当连续变量拒掉）',
  numericGroup.ok === true && numericGroup.rows[0].group === '1' && typeof numericGroup.rows[0].group === 'string',
  JSON.stringify(numericGroup.rows[0]));
t('样本信息只有 ID 列 -> 报错', !parseSampleSheet([['样本'], ['S1']]).ok);
t('坐标不足两列 -> 报错', !parseCoordinateSheet([['样本', 'x'], ['S1', 1]]).ok);
t('坐标非数值 -> 报错', !parseCoordinateSheet([['样本', 'x', 'y'], ['S1', 1, '米']]).ok);
const nonsym = parseDistanceSheet([['', 'A', 'B'], ['A', 0, 0.4], ['B', 0.9, 0]]);
t('距离矩阵不对称 -> symmetric=false', nonsym.ok === true && nonsym.symmetric === false);
const sym = parseDistanceSheet([['', 'A', 'B'], ['A', 0, 0.4], ['B', 0.4, 0]]);
t('对称距离矩阵 -> symmetric=true', sym.ok === true && sym.symmetric === true);
t('距离矩阵非方阵 -> 报错', !parseDistanceSheet([['', 'A', 'B'], ['A', 0, 0.1]]).ok);
t('CSV 单表也能读', await (async () => {
  const f = new File([new Blob(['样本,group\nS1,A\nS2,B\n'])], 'a.csv', { type: 'text/csv' });
  const s = await readWorkbook(f);
  const only = Object.values(s)[0];
  return parseSampleSheet(only).ok === true;
})());

console.log(`\n──────── ${pass} 通过 / ${fails.length} 失败 ────────`);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
