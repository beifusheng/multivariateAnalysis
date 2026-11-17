/**
 * R 版本 A/B 对照工具
 * ------------------------------------------------------------------
 * 目的：判断「换便携 R 版本」会不会改变已有分析的数值结果。
 * 做法：用同一个种子生成输入 JSON，分别喂给两个 Rscript，比较输出。
 *
 * 用法：
 *   node r-scripts/tools/ab_r_version.mjs
 *   可覆盖：R_OLD / R_NEW 环境变量
 *     R_OLD=C:/.../electron-egg/r-portable/bin/Rscript.exe
 *     R_NEW=C:/.../Demo/r-portable/bin/Rscript.exe
 *
 * 说明：permanova.R 置换不固定种子时 p 值每次抖动，因此本工具同时检验
 *       「加了 set.seed 之后是否可复现」。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TMP = path.join(ROOT, 'r-scripts', 'tools', '.tmp_ab');
fs.mkdirSync(TMP, { recursive: true });

const R_OLD = process.env.R_OLD || path.resolve(ROOT, '..', 'r-portable-4.3.3-backup', 'bin', 'Rscript.exe');
// 默认对照：项目内 4.6.1（当前版本）vs 项目外 4.3.3 备份
const R_NEW = process.env.R_NEW || path.join(ROOT, 'r-portable', 'bin', 'Rscript.exe');

for (const [name, p] of [['R_OLD', R_OLD], ['R_NEW', R_NEW]]) {
  if (!fs.existsSync(p)) { console.error(`找不到 ${name}: ${p}`); process.exit(1); }
}

const run = (Rscript, args, timeout = 300000) =>
  execFileSync(Rscript, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout, encoding: 'utf8' });

/** 从 JSON 里挑出用于比对的数值字段 */
function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    const v = k.split('.').reduce((a, x) => (a == null ? a : a[x]), obj);
    out[k] = v;
  }
  return out;
}

function fmt(v) {
  if (v == null) return 'null';
  if (typeof v === 'number') return v.toFixed(6);
  if (Array.isArray(v)) return '[' + v.map(fmt).join(',') + ']';
  if (typeof v === 'object') return JSON.stringify(v, Object.keys(v).sort());
  return String(v);
}

let fail = 0;
const check = (label, a, b, tol = 1e-6) => {
  const sa = fmt(a), sb = fmt(b);
  const numeric = typeof a === 'number' && typeof b === 'number';
  const ok = numeric ? Math.abs(a - b) <= tol : sa === sb;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: 4.3=${sa}  新=${sb}`);
  if (!ok) fail++;
  return ok;
};

// ---------- 1. 生成一份确定性的 PERMANOVA 输入 ----------
const genR = path.join(TMP, 'gen_ab_input.R');
const inP = path.join(TMP, 'permanova_ab.json');
fs.writeFileSync(genR, `
suppressMessages(library(vegan)); suppressMessages(library(jsonlite))
set.seed(20260427L)
otu <- matrix(round(rpois(24 * 18, lambda = 4)), nrow = 24)
rownames(otu) <- paste0("S", 1:24)
colnames(otu) <- paste0("OTU", 1:18)
idx <- sample(24)                       # 打乱行序，避免分组与样本顺序完全绑定
grp <- factor(rep(c("A","B"), each = 12)[idx], levels = c("A","B"))
ph  <- factor(rep(c("P1","P2"), times = 12)[idx], levels = c("P1","P2"))
otu[, 1:4] <- otu[, 1:4] + ifelse(grp == "A", 1L, 0L)   # group 弱信号（让 p 落在中段，才能检验可复现性）
otu[, 5:6] <- otu[, 5:6] + ifelse(ph == "P1", 1L, 0L)   # phase 更弱信号
d  <- vegdist(otu, method = "bray")
df <- data.frame(row.names = rownames(otu), group = grp, phase = ph)
cat("[gen] R", as.character(getRversion()), "| 样本", nrow(otu), "| OTU", ncol(otu), file = stderr())
writeLines(toJSON(list(
  distanceMatrix = as.matrix(d),
  sampleData = df,
  formula = "group + phase",
  permutations = 999L,
  distances = "bray",
  pcoaAxes = 3L
  ), auto_unbox = TRUE, digits = 10, pretty = TRUE), "${inP.replace(/\\/g, '/')}", sep = "")
`);
run(R_OLD, [genR]);
console.log(`输入已生成: ${path.relative(ROOT, inP)} (24 样本 × 18 OTU)`);

// ---------- 2. 两边各跑一次 permanova.R ----------
const outOld = path.join(TMP, 'out_old.json');
const outNew = path.join(TMP, 'out_new.json');
const errOld = path.join(TMP, 'err_old.txt');
const errNew = path.join(TMP, 'err_new.txt');

console.log('\n=== PERMANOVA: 4.3.3 ===');
run(R_OLD, [path.join(ROOT, 'r-scripts', 'permanova.R'), inP, outOld, errOld]);
console.log('=== PERMANOVA: 新版 ===');
run(R_NEW, [path.join(ROOT, 'r-scripts', 'permanova.R'), inP, outNew, errNew]);

const a = JSON.parse(fs.readFileSync(outOld, 'utf8'));
const b = JSON.parse(fs.readFileSync(outNew, 'utf8'));

console.log('\n--- 整体结构 ---');
check('success', a.success, b.success);
check('R2', a.R2, b.R2);
const rowsA = a.permanova_result || [];
const rowsB = b.permanova_result || [];
check('行数', rowsA.length, rowsB.length);
check('行名', rowsA.map((r) => r._row), rowsB.map((r) => r._row));

console.log('\n--- 逐项统计量（确定性，应与 RNG 无关）---');
for (let i = 0; i < rowsA.length; i++) {
  for (const f of ['Df', 'SumOfSqs', 'F_model', 'R2']) {
    if (rowsA[i][f] !== undefined) check(`${rowsA[i]._row}.${f}`, rowsA[i][f], rowsB[i][f], 1e-5);
  }
}

console.log('\n--- p 值（置换，允许抖动，只比较 α=0.05 判定）---');
for (let i = 0; i < rowsA.length; i++) {
  const pa = rowsA[i].p_value, pb = rowsB[i].p_value;
  if (pa == null || pb == null) { console.log(`  - ${rowsA[i]._row}.p_value 缺失`); continue; }
  const sameDecision = (pa < 0.05) === (pb < 0.05);
  console.log(`  ${sameDecision ? '✓' : '✗'} ${rowsA[i]._row}.p_value: 4.3=${pa} 新=${pb}${sameDecision ? '' : '  ← 判定翻转'}`);
  if (!sameDecision) fail++;
}

// ---------- 3. 同一 R 连跑两次，检验置换是否可复现 ----------
console.log('\n--- 可复现性：同一 R、同一输入连跑两次 ---');
const outAgain = path.join(TMP, 'out_again.json');
run(R_OLD, [path.join(ROOT, 'r-scripts', 'permanova.R'), inP, outAgain, path.join(TMP, 'err_again.txt')]);
const c = JSON.parse(fs.readFileSync(outAgain, 'utf8'));
const p1 = rowsA[0].p_value, p2 = (c.permanova_result || [])[0].p_value;
console.log(`  ${p1 === p2 ? '✓' : '✗'} 第一项 p_value: 第一次=${p1} 第二次=${p2}${p1 === p2 ? '' : '  ← 未固定种子，结果不可复现'}`);
if (p1 !== p2) fail++;

console.log(`\n──────── A/B 结论：${fail === 0 ? '两个版本结果一致，可放心切换' : `${fail} 处不一致，需人工判断`} ────────`);
console.log(`临时文件在 ${path.relative(ROOT, TMP)}（可 rm -rf）`);
process.exit(fail === 0 ? 0 : 2);
