/**
 * matrixInput.js 单元测试：三种历史输入格式必须无损归一化为「样本 × 变量」
 * 用 medTemplates 的真实数据做往返比对（逐元素），因此能同时验证转置方向。
 * 用法: node r-scripts/tools/test_matrix_input.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'minput-'));
const { matrixInput: mi, medTemplates: mt } = await loadFrontendUtils(['matrixInput', 'medTemplates']);

const { inspectValue, inspectMatrix, refSampleNFrom, sampleMismatchMessage } = mi;
const { MED_TEMPLATE_GROUPS, buildMedTemplateData } = mt;

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
}

const rowDict = (m) => { const o = {}; m.forEach((r, i) => { o['Sample' + (i + 1)] = r; }); return o; };
const colDict = (m, names) => {
  const o = {};
  m[0].forEach((_, j) => { o[names?.[j] ?? 'V' + (j + 1)] = m.map((r) => r[j]); });
  return o;
};

console.log('=== 1. 基础归一化 ===');
{
  const m = [[1, 2, 3], [4, 5, 6]];
  const r = inspectValue(m);
  check('二维数组直接透传', r.ok && r.n === 2 && r.p === 3 && eq(r.rows, m), JSON.stringify(r));

  const rd = inspectValue(rowDict(m), 2);
  check('行字典(键=样本) 还原原矩阵', rd.ok && rd.n === 2 && rd.p === 3 && eq(rd.rows, m), JSON.stringify(rd));

  const cd = inspectValue(colDict(m, ['A', 'B', 'C']), 2);
  check('列字典(键=变量) 转置还原', cd.ok && cd.n === 2 && cd.p === 3 && eq(cd.rows, m), JSON.stringify(cd));

  const v = inspectValue([1, 0, 1, 0]);
  check('单变量裸向量 -> n×1', v.ok && v.n === 4 && v.p === 1 && eq(v.rows, [[1], [0], [1], [0]]), JSON.stringify(v));

  const sq = inspectValue({ S1: [1, 2], S2: [3, 4] }, 2);
  check('方阵优先按行字典（与 R 一致）', sq.ok && sq.orientation.startsWith('row-dict'), JSON.stringify(sq));
}

console.log('\n=== 2. 错误拦截 ===');
{
  check('参差数组被拦', !inspectValue([[1, 2], [3]]).ok);
  check('非数值被拦', !inspectValue([['a', 1], [2, 3]]).ok);
  check('NaN 被拦', !inspectValue([[1, NaN], [2, 3]]).ok);
  check('null 被拦', !inspectValue([[1, null], [2, 3]]).ok);
  const r = inspectValue({ Age: [1, 2, 3], BMI: [4, 5, 6] }, 10);
  check('样本数对不上时给出候选说明', !r.ok && /记录数=2/.test(r.error) && /参照样本数=10/.test(r.error), r.error);
  check('空数组', !inspectValue([]).ok);
  check('JSON 语法错误', !inspectMatrix('{ 坏 ').ok);
}

console.log('\n=== 3. 参照样本数推断（只看无歧义的二维数组写法）===');
{
  const fields = {
    mediatorDataStr: JSON.stringify([[1, 2], [3, 4], [5, 6]]),
    predictorDataStr: JSON.stringify(rowDict([[9], [8], [7]])),
    outcomeDataStr: '',
    covariatesStr: '',
  };
  check('从中介矩阵推 n=3', refSampleNFrom(fields, 'predictorDataStr') === 3);
  check('排除自身不会用自己当参照', refSampleNFrom(fields, 'mediatorDataStr') === null);
}

console.log('\n=== 4. 样本数一致性检查 ===');
{
  const M = [[1, 2], [3, 4], [5, 6]];
  const good = sampleMismatchMessage([['中介 M', JSON.stringify(M)], ['暴露 X', JSON.stringify([[1], [0], [1]])]], 3);
  check('一致时无提示', good === '', good);
  const bad = sampleMismatchMessage([['中介 M', JSON.stringify(M)], ['暴露 X', JSON.stringify([[1], [0]])]], 3);
  check('不一致时报出各矩阵 n', /中介 M=3/.test(bad) && /暴露 X=2/.test(bad), bad);
}

console.log('\n=== 5. 25 个模板真实数据三格式往返（逐元素比对）===');
{
  let okAll = true, firstDetail = '';
  const squareCases = [];
  for (const g of MED_TEMPLATE_GROUPS) {
    for (const it of g.items) {
      const d = buildMedTemplateData(it.spec);
      const parts = [
        ['mediatorData', d.mediatorData, d.n],   // 有参照时才能消歧（UI 会从 X/Y 的矩阵写法反推）
        ['predictorData', d.predictorData, d.n],
        ['outcomeData', d.outcomeData, d.n],
      ];
      if (d.covariates) parts.push(['covariates', d.covariates, d.n]);
      for (const [tag, mat, ref] of parts) {
        const variants = {
          matrix: mat,
          rowDict: rowDict(mat),
          colDict: colDict(mat, null),
          jsonMatrixStr: JSON.stringify(mat),
        };
        for (const [vname, input] of Object.entries(variants)) {
          const r = typeof input === 'string' ? inspectMatrix(input, ref) : inspectValue(input, ref);
          // 方阵的列字典与行字典在数学上不可区分，按文档约定归为行字典
          const isSquare = mat.length === mat[0].length;
          const expectRows = !(vname === 'colDict' && isSquare);
          const same = r.ok && r.n === mat.length && r.p === mat[0].length &&
            (expectRows ? eq(r.rows, mat) : /^row-dict/.test(r.orientation));
          if (!same) {
            okAll = false;
            if (!firstDetail) firstDetail = `${it.id}.${tag} 作为 ${vname}: ` +
              `期望 ${mat.length}×${mat[0].length}，实得 ${r.ok ? r.n + '×' + r.p + ' ' + r.orientation : r.error}`;
          }
          if (vname === 'colDict' && isSquare) squareCases.push(`${it.id}.${tag}`);
        }
      }
    }
  }
  check('全部模板 × 4 种写法 无损往返', okAll, firstDetail);
  if (squareCases.length)
    console.log('  （已文档化的二义性：方阵列字典按行字典解释 -> ' + squareCases.join(', ') + '）');
}

// ============================================================ inspectSampleTable
{
  const st = mi.inspectSampleTable;
  const rowsIn = '[{"sample":"S1","group":"A","strata":"B1"},{"sample":"S2","group":"B","strata":"B1"}]';
  const colIn = '{"group":["A","B"],"strata":["B1","B1"]}';

  const a = st(rowsIn);
  check('行对象数组: 解析成功', a.ok === true, a.error);
  check('行对象数组: n=2', a.n === 2);
  check('行对象数组: 列名齐全', a.columns.join(',') === 'sample,group,strata', a.columns.join(','));

  const b = st(colIn);
  check('列字典: 解析成功', b.ok === true, b.error);
  check('列字典: 转成行对象', JSON.stringify(b.rows) === JSON.stringify([{ group: 'A', strata: 'B1' }, { group: 'B', strata: 'B1' }]));
  check('列字典: n 正确', b.n === 2);

  check('两种写法等价（行数一致）', a.n === b.n);
  check('参照样本数不符时报错', st(rowsIn, 5).ok === false && /样本数不一致/.test(st(rowsIn, 5).error));
  check('参照一致时通过', st(rowsIn, 2).ok === true);
  check('非法 JSON 报错', st('{oops').ok === false);
  check('空数组报错', st('[]').ok === false);
  check('数组里混入标量报错', st('[{"a":1},2]').ok === false);
  check('行字段数不齐报错（不静默补 NA）', st('[{"a":1},{"a":2,"b":3}]').ok === false && /字段数不一致/.test(st('[{"a":1},{"a":2,"b":3}]').error));
  check('列字典长度不齐报错', st('{"a":[1,2],"b":[1]}').ok === false && /长度不一致/.test(st('{"a":[1,2],"b":[1]}').error));
  check('列字典里混非数组报错', st('{"a":[1,2],"b":3}').ok === false);
  check('顶层非对象报错', st('"abc"').ok === false && st('null').ok === false);
}


console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

