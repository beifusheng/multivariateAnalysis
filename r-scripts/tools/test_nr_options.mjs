#!/usr/bin/env node
/**
 * Non-random PERMANOVA 的静态一致性检查（不跑 R，毫秒级）
 * ---------------------------------------------------------------
 * 防的是这类漂移：
 *   - 界面下拉里加了一个距离方法，R 的白名单里没有 → 用户点「运行」才报错
 *   - R 里改了方法名 / 加了自实现距离，界面不知道
 *   - 模板写了 distance:'wu' 这种拼错的名字（跑起来才知道不支持）
 *   - 模板公式引用了生成器不产出的列（R 会报「变量不存在」）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const R_SCRIPT = path.join(ROOT, 'r-scripts/nonrandom_permanova.R');

const { nrOptions: opt, nonrandomTemplates: nrt } = await loadFrontendUtils(['nrOptions', 'nonrandomTemplates']);

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (detail ? ` —— ${detail}` : '')); }
};

const rSrc = fs.readFileSync(R_SCRIPT, 'utf8');

// ---- 1) R 侧白名单 vs 界面选项 ----
const vm = rSrc.match(/VEGAN_METHODS <- c\(([^)]*)\)/);
check('R 脚本里能找到 VEGAN_METHODS', !!vm);
const rMethods = vm ? [...vm[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
const wsImplemented = /vegdist_ws <- function/.test(rSrc) && /method == "ws"/.test(rSrc);
check('R 侧确实自实现了 ws', wsImplemented);

const uiDistances = opt.NR_DISTANCES.map((d) => d.value);
check('界面距离数 = R 支持数(vegan + ws)',
  uiDistances.length === rMethods.length + 1,
  `界面 ${uiDistances.length}，R ${rMethods.length}+ws`);
const missingInUi = rMethods.filter((m) => !uiDistances.includes(m));
const missingInR = uiDistances.filter((d) => d !== 'ws' && !rMethods.includes(d));
check('R 支持的距离界面都有', missingInUi.length === 0, missingInUi.join(','));
check('界面没有 R 不支持的距离', missingInR.length === 0, missingInR.join(','));
check('距离 value 不重复', new Set(uiDistances).size === uiDistances.length);
check('每个距离都有中文说明', opt.NR_DISTANCES.every((d) => d.label && d.label.length > 3));

// ---- 2) 置换方案 ----
const uiSchemes = opt.NR_SCHEMES.map((s) => s.value);
check('方案三选一 free/stratified/spatial', ['free', 'stratified', 'spatial'].every((s) => uiSchemes.includes(s)), uiSchemes.join(','));
for (const s of uiSchemes) {
  check(`R 脚本认识方案 ${s}`, new RegExp(`"${s}"`).test(rSrc));
}

// ---- 3) 模板与选项/生成器一致 ----
const all = Object.values(nrt.NR_TEMPLATE_MAP);
check('模板总数 >= 25', all.length >= 25, String(all.length));
check('模板 id 全局唯一', new Set(all.map((t) => t.id)).size === all.length);
check('NR_TEMPLATE_COUNT 与实际一致', nrt.NR_TEMPLATE_COUNT === all.length, `${nrt.NR_TEMPLATE_COUNT} vs ${all.length}`);

for (const t of all) {
  const s = t.spec;
  if (!uiDistances.includes(s.distance || 'bray')) check(`${t.id}: 距离 ${s.distance} 受支持`, false);
  if (!uiSchemes.includes(s.scheme)) check(`${t.id}: 方案 ${s.scheme} 合法`, false);
  if (!['free', 'stratified', 'spatial'].includes(s.scheme)) check(`${t.id}: scheme 合法`, false);
  for (const key of ['free', 'constrained']) {
    const e = s.expect?.[key];
    if (!['sig', 'ns'].includes(e)) check(`${t.id}: expect.${key}=${e} 合法`, false);
  }
  if (s.scheme !== 'free' && !s.strata) check(`${t.id}: 受限方案需要区组`, false);
  if (s.scheme === 'spatial' && !(s.strata > 0)) check(`${t.id}: spatial 需要区组放置坐标`, false);
  // 公式里的列必须是生成器会写进 sampleData 的列
  const cols = new Set(['group', 'sample']);
  if (s.strata) cols.add('strata');
  if (s.phase) cols.add('phase');
  if (s.numericCovariate) cols.add(s.numericCovariate.name);
  const terms = (s.formula || 'group').split('+').map((x) => x.trim()).filter(Boolean);
  const bad = terms.filter((x) => !cols.has(x));
  check(`${t.id}: 公式列都存在`, bad.length === 0, bad.join(','));
  // 连续列绝不能进公式（R 会明确拒绝）
  check(`${t.id}: 公式里没有连续变量`, !(s.numericCovariate && terms.includes(s.numericCovariate.name)));
  if (!s.groups || s.groups.length < 2) check(`${t.id}: 至少两个组`, false);
  if ((s.groupOffsets || []).length && s.groups && s.groupOffsets.length !== s.groups.length) {
    check(`${t.id}: groupOffsets 与组数匹配`, false, `${s.groupOffsets.length} vs ${s.groups.length}`);
  }
}

// ---- 4) 生成器输出可直接喂 R（结构检查） ----
{
  const built = nrt.buildNonrandomTemplateData(all[0].spec);
  const p = built.payload;
  check('payload 含 communityData / sampleData / formula', !!p.communityData && !!p.sampleData && !!p.formula);
  check('物种矩阵行数 = 样本表行数', p.communityData.length === p.sampleData.length);
  check('样本表是行对象数组', Array.isArray(p.sampleData) && typeof p.sampleData[0] === 'object' && !Array.isArray(p.sampleData[0]));
  check('每行都有 group', p.sampleData.every((r) => 'group' in r));
  check('builder 回带 spec（视图显示设计说明要用）', !!built.spec);
  check('design 描述非空', typeof built.design === 'string' && built.design.length > 5);
  const sp = nrt.buildNonrandomTemplateData(Object.values(nrt.NR_TEMPLATE_MAP).find((t) => t.spec.scheme === 'spatial').spec);
  check('spatial 模板给出坐标', Array.isArray(sp.payload.coordinates) && sp.payload.coordinates.length === sp.n && sp.payload.coordinates[0].length === 2);
  check('spatial 坐标不含 NaN', sp.payload.coordinates.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
}

// ---- 5) 决定性：同 spec 两次生成必须逐元素相同 ----
{
  const spec = all[3].spec;
  const a = nrt.buildNonrandomTemplateData(spec);
  const b = nrt.buildNonrandomTemplateData(spec);
  check('同 spec 两次生成完全一致', JSON.stringify(a.payload) === JSON.stringify(b.payload));
}

console.log('Non-random PERMANOVA 静态一致性检查');
console.log(`  R 支持距离: ${rMethods.join(', ')} (+ws)`);
console.log(`  模板数: ${all.length}`);
console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) {
  console.log('\n失败项:');
  fails.forEach((f) => console.log('  - ' + f));
}
process.exit(fail ? 1 : 0);
