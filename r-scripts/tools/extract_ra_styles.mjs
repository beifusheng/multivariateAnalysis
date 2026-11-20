/**
 * 从 PERMANOVA_Med.vue 抽出共享样式表，供三个新界面复用。
 *
 * 为什么脚本抽取而不是手抄：新界面要求「样式与现有界面完全一致」，手抄 870 行
 * CSS 必然漂移（少一条 hover、改一个圆角都发现不了）。脚本可重跑，
 * 源仍是 PERMANOVA_Med.vue 的 <style scoped>，改样式后重跑本脚本即可同步。
 *
 *   node r-scripts/tools/extract_ra_styles.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'frontend/src/views/r-analysis/PERMANOVA_Med.vue');
const OUT = path.join(ROOT, 'frontend/src/components/r-analysis/r-analysis.css');

const vue = fs.readFileSync(SRC, 'utf8');
const sm = vue.match(/<style scoped>([\s\S]*?)<\/style>/);
if (!sm) { console.error('没找到 <style scoped> 块'); process.exit(1); }
let css = sm[1].trim();

// 去掉 med 专有命名，改成中性的共享命名（视觉不变，语义不再误导）
const RENAMES = [
  ['.permanova-med-container', '.ra-shell'],
  ['.med-headline-card', '.headline-card'],
  ['.med-headline-left', '.headline-left'],
  ['.med-headline-right', '.headline-right'],
  ['.med-p-big', '.headline-p'],
  ['.med-p-caption', '.headline-caption'],
  ['.med-interp', '.headline-interp'],
  ['.med-sub', '.headline-sub'],
  ['.mediator-effects-card', '.result-card'],
  ['.med-data-note', '.template-note'],
  ['.med-data-current', '.template-current'],
  ['/* ===== 中介分析结果（对齐 LDM 真实输出）===== */', '/* ===== 结果区卡片 ===== */']
];
for (const [a, b] of RENAMES) css = css.split(a).join(b);

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');

function prefixSelector(sel) {
  return sel.split(',').map((s) => {
    const t = s.trim();
    if (!t) return t;
    if (t === '.ra-shell' || t.startsWith('.ra-shell')) return t;   // 容器自身规则不套娃
    return '.ra-shell ' + t;
  }).join(', ');
}

/** 找到 prelude 里最后一个注释结束的位置：注释原样保留，只给后面的选择器加前缀 */
function commentSplit(prelude) {
  const end = prelude.lastIndexOf('*/');
  return end < 0 ? 0 : end + 2;
}

function countRules(text) {
  // 只数「非 at-rule 的选择器块」，用于自校验规则数没丢
  return (stripComments(text).match(/\{/g) || []).length;
}

function rewriteBlocks(text, isNested) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const brace = text.indexOf('{', i);
    if (brace < 0) { out += text.slice(i); break; }
    const preludeRaw = text.slice(i, brace);
    let depth = 1, j = brace + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    const bodyRaw = text.slice(brace + 1, j - 1);
    const code = stripComments(preludeRaw).trim();

    if (code.startsWith('@')) {
      const nested = /^@(media|supports|layer)/.test(code);
      out += preludeRaw + '{\n' + (nested ? rewriteBlocks(bodyRaw, true) : bodyRaw) + '\n}\n';
    } else {
      const cut = commentSplit(preludeRaw);
      const head = preludeRaw.slice(0, cut);
      // 注释与选择器之间补上换行，否则写成一行 `*/.ra-shell x {` 难读也难 diff
      const sep = head.trim() && !/\n\s*$/.test(head) ? '\n' : '';
      out += head + sep + prefixSelector(code) + ' {' + bodyRaw + '}\n';
    }
    i = j;
  }
  return out;
}

const body = rewriteBlocks(css, false);

/*
 * 「手工维护块」必须活过重跑。本文件不是纯生成物：分栏宽度（max-width: 1200px）
 * 与页头左对齐这两块是实机反馈后加在生成文件里的，Med.vue 里没有它们。
 * 上一版本重跑一次就把这两块静默抹掉（现象：GMR4 页头又居中、宽屏整页铺满），
 * 而 CSS 不会报错 —— 所以这里显式把哨兵之后的内容原样接回输出。
 * 哨兵之后的东西由人维护，本脚本不解释、不重排、不加前缀。
 */
const SENTINEL = '/* ==== RA-MANUAL-BEGIN ==== */';
let managed = '';
if (fs.existsSync(OUT)) {
  const cur = fs.readFileSync(OUT, 'utf8');
  // lastIndexOf：banner 里会提到这个标记的名字，不能被它自己匹到
  const at = cur.lastIndexOf(SENTINEL);
  if (at >= 0) managed = '\n' + cur.slice(at).trimEnd() + '\n';
}

const banner = `/**
 * R 分析界面共享样式
 * ---------------------------------------------------------------
 * 本文件由 r-scripts/tools/extract_ra_styles.mjs 从
 * frontend/src/views/r-analysis/PERMANOVA_Med.vue 的 <style scoped> 自动生成。
 * 目的：让新增分析界面（Non-random PERMANOVA / GMR⁴ / Bayesian ERA）与既有界面
 * 像素级一致，同时避免把 870 行 CSS 复制三份各自漂移。
 *
 * 所有选择器都限定在 .ra-shell 内，不会泄漏到 Home / PERMANOVA 等页面。
 * 要改样式请改 PERMANOVA_Med.vue 再重跑抽取脚本，不要直接编辑本文件。
 * 例外：文件末尾 RA-MANUAL-BEGIN 标记行之后的内容不在 Med.vue 里，
 * 重跑会被原样保留（不要往前插东西然后指望它还在）。
 */
`;
const out = banner + body.trim() + '\n' + managed;

// ---- 自检：括号配对、规则数守恒、没有漏加前缀的选择器 ----
const errors = [];
const opens = (out.match(/\{/g) || []).length;
const closes = (out.match(/\}/g) || []).length;
if (opens !== closes) errors.push(`括号不配对 { =${opens}, } =${closes}`);
const srcRules = countRules(css);
const outRules = countRules(out);
const managedRules = countRules(managed);
// 自守：手工维护块自己不能丢（丢一条 = 重跑把实机修复抹了，CSS 不报错的那种事故）
if (managed && managedRules === 0) errors.push('哨兵在但手工维护块是空的（正则错了？）');
if (!managed && /max-width: 1200px/.test(fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '')) {
  errors.push('既有文件里有 max-width: 1200px 却没找到 RA-MANUAL-BEGIN 标记 —— 重跑会把实机修复抹掉');
}
if (outRules !== srcRules + managedRules) errors.push(`规则数变化 ${srcRules} + 手工 ${managedRules} -> ${outRules}`);
if (/@media[^{]*\n/.test(out)) errors.push('@media 头后面丢了 {');
if (/\.ra-shell\s+\.ra-shell/.test(out)) errors.push('出现 .ra-shell 套娃');
if (/\*\/@?\.?ra-shell|\*\/\.(ra-)?[a-z]/.test(out)) errors.push('注释与选择器挤在同一行');
for (const legacy of ['med-headline', 'mediator-effects', 'permanova-med', 'med-data']) {
  if (out.includes(legacy)) errors.push(`残留 med 专有命名: ${legacy}`);
}
// 每个非 at-rule 选择器都必须带 .ra-shell 前缀
{
  const noAt = out.replace(/@media[^{]*\{([\s\S]*?)\n\}/g, (m) => m.replace(/\n\s*\}/, ''));
  const bad = [];
  let k = 0;
  while (true) {
    const b = noAt.indexOf('{', k);
    if (b < 0) break;
    let d = 1, e = b + 1;
    while (e < noAt.length && d > 0) { if (noAt[e] === '{') d++; else if (noAt[e] === '}') d--; e++; }
    const head = stripComments(noAt.slice(k, b)).trim();
    if (head && !head.startsWith('@') && !head.startsWith('.ra-shell') && !/^(from|to|\d+%|,)/.test(head)) {
      bad.push(head.slice(0, 40));
    }
    k = e;
  }
  if (bad.length) errors.push(`未加前缀的选择器 ${bad.length} 个：${bad.slice(0, 5).join(' | ')}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);

if (errors.length) {
  console.error(`❌ 自检未通过（文件已写出以便排查，请勿使用）:`);
  errors.forEach((e) => console.error('   - ' + e));
  process.exit(1);
}
console.log(`✅ ${path.relative(ROOT, OUT)}：${out.length} 字节，${outRules} 条规则（含手工维护 ${managedRules} 条），全部限定在 .ra-shell 内`);
