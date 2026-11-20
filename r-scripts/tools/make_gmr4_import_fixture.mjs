#!/usr/bin/env node
/**
 * 生成 GMR⁴「导入 → 填入表单」的手测样本（写进 data/，data/ 在 .gitignore 里）
 * ---------------------------------------------------------------
 *   node r-scripts/tools/make_gmr4_import_fixture.mjs
 *
 * 为什么要脚本而不是手抄 Excel：这几份样本的意义全在**参数表里那几个字符串**，
 * 手抄一改就不知道改没改、改错了谁。脚本重跑一次就是同一份字节。
 * 数据本体直接复用 gmr4TemplateSheets（用户下载模板走的同一个函数），
 * 只改「模型参数」表里的 ranks / lambdas —— 这样"导入后表单该显示什么"有唯一答案。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadFrontendUtils } from './load_frontend_utils.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const req = createRequire(import.meta.url);
const XLSX = req(path.join(ROOT, 'frontend/node_modules/xlsx'));
const { gmr4SheetSpec: spec } = await loadFrontendUtils(['gmr4SheetSpec']);

const OUT = path.join(ROOT, 'data', 'GMR4_导入测试');
fs.mkdirSync(OUT, { recursive: true });

/** 把「模型参数」表里某些键改成指定字符串，其余照默认设计（lowrank3：36×5×8 + 1 协变量） */
function withParams(overrides, tplId = 'lowrank3') {
  return spec.gmr4TemplateSheets(tplId).map((sh) => {
    if (sh.name !== '模型参数') return sh;
    return {
      ...sh,
      aoa: sh.aoa.map((row) => (row[0] in overrides ? [row[0], String(overrides[row[0]])] : row))
    };
  });
}

function writeXlsx(sheets, file) {
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.aoa), sh.name);
  const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  fs.writeFileSync(path.join(OUT, file), buf);
  return buf.length;
}

// 每一份都带一句「预期」：手测时对照的是声明，不是"跑出什么算什么"
const CASES = [
  {
    file: '01_ranks手填_1_2_3.xlsx',
    overrides: { ranks: '1,2,3' },
    expect: '候选秩框显示 1,2,3；lambda 框显示 0.01,0.1,0.5,1,5,20；kfold=4、seed=12345；CV 网格 3 行 × 6 列'
  },
  {
    file: '02_ranks留空.xlsx',
    overrides: { ranks: '' },
    expect: '先把 01 导入过一次再导这份：候选秩框必须被**清空**（旧值 1,2,3 不许残留）'
  },
  {
    file: '03_ranks越界_1_2_9.xlsx',
    overrides: { ranks: '1,2,9' },
    expect: '必须开口提示「候选秩 9 超过上限 min(p,q)=5，引擎会忽略它们」；网格仍是 2 行（1、2 有效）'
  },
  {
    file: '04_lambda只给两档.xlsx',
    overrides: { lambdas: '0.1,1' },
    expect: 'lambda 框显示 0.1,1；CV 网格列数=2（不是默认 12 档）'
  },
  {
    file: '05_整数带空格_1__2__3.xlsx',
    overrides: { ranks: ' 1 ,, 2 , 3 ' },
    expect: '分隔符里的空格与中文逗号都要被吃掉：表单显示" 1 ,, 2 , 3 "原样，但 numList 仍解析出 3 个秩'
  }
];

console.log(`\n生成到 ${OUT}`);
for (const c of CASES) {
  const bytes = writeXlsx(withParams(c.overrides), c.file);
  console.log(`  ${c.file}（${bytes} 字节）\n      预期：${c.expect}`);
}
console.log('\n用法：GMR⁴ 页 → 右侧工具栏「导入」→ 选文件 → 「填入表单」，然后看参数框与运行后的 CV 网格。\n');
