/**
 * 仓库卫生：误调用留下的垃圾文件、零引用的静态资源、包管理器错配。
 *
 * 为什么需要：今天根目录冒出过 q=1 / q=4 / n=60.json 三个文件 —— 那是我手跑 R 探测时
 * 参数写歪，脚本把 argv 里的 "q=4" 当成输出路径创建了文件，内容是一句 jsonlite 报错。
 * 它们被 git add -A 顺手提交进仓库了。**只要有人用 -A 提交，垃圾就能永久留下**，
 * 所以这事得机器查，不能靠人眼。
 *
 * 用法：node r-scripts/tools/test_repo_hygiene.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readSafe = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
// 剔掉注释行：文本匹配命中注释是本项目的老毛病（判据打在文档/自身源码上假红假绿都有）。
// 只要“行”层面的过滤就够：本仓库的代码不存在行内拼接注释的写法。
const codeOnly = (txt) => txt.split(String.fromCharCode(10))
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join(String.fromCharCode(10));
// 待查的模式用拼接构造：上一版我把字面量直接写在本文件里，
// 结果这个套件**匹配到了自己的源码**，报了一个自指误报。
const EXAMPLE_DIR = ['views', 'example'].join('/');
let pass = 0; const fails = []; const warns = [];
const check = (name, cond, detail = '', fix = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else {
    fails.push(name + (detail ? ` —— ${detail}` : ''));
    console.log('  ✗ ' + name + (detail ? `  [${detail}]` : '') + (fix ? `\n      下一步：${fix}` : ''));
  }
};
const warn = (name, msg) => { warns.push(name); console.log('  · 提示：' + name + (msg ? ` —— ${msg}` : '')); };

const git = (args) => {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }); }
  catch { return ''; }
};
const tracked = git(['ls-files']).split(/\r?\n/).filter(Boolean);
if (!tracked.length) {
  console.log('\n[SKIP] 不在 git 仓库里（或 git 不可用），无从对账');
  console.log('RESULT pass=0 fail=0');
  process.exit(0);
}

console.log('\n=== 1. 根目录被跟踪的文件必须在白名单里 ===');
{
  const allow = [
    '.gitattributes', '.gitignore', 'LICENSE', 'README.md', 'R_FRAMEWORK.md',
    'package.json', 'r-runtime.lock.json', 'yarn.lock', 'package-lock.json'
  ];
  const rootFiles = tracked.filter((f) => !f.includes('/'));
  const stray = rootFiles.filter((f) => !allow.includes(f));
  check('根目录没有意外入库的文件', stray.length === 0, stray.join(', '),
    '确认是垃圾就 git rm；确实要留就把它加进本文件白名单并说明理由');
  // 误调用产物的特征：文件名里有 = （argv 被当成路径）
  const eq = tracked.filter((f) => f.includes('='));
  check('没有任何被跟踪文件名含 =（那是命令行参数写歪后留下的输出文件）',
    eq.length === 0, eq.join(', '), 'git rm 掉，别留');
}

console.log('\n=== 2. 临时/构建残留不得入库 ===');
{
  const tmp = tracked.filter((f) => /(^|\/)\.tmp_|\.tmp_[a-z0-9]+\.(json|out|err|txt|R|log)$/.test(f)
    || /\.in\.json$|\.out\.json$|\.err\.txt$/.test(f));
  check('没有 .tmp_* / *.in.json / *.out.json 这类中间文件入库', tmp.length === 0, tmp.join(', '));
  // 工作区里残留也提醒一下（不判失败：可能是正在调试）
  const dirty = fs.readdirSync(path.join(ROOT, 'r-scripts', 'tools')).filter((f) => f.startsWith('.tmp_'));
  if (dirty.length) warn('r-scripts/tools 下有调试残留（未入库，可删）', dirty.join(', '));
  const outDirs = ['out', 'out-installer', 'out-proof', 'dist'].filter((d) => fs.existsSync(path.join(ROOT, d)));
  const outTracked = tracked.filter((f) => outDirs.some((d) => f.startsWith(d + '/')));
  check('out*/ 构建产物没有被跟踪', outTracked.length === 0, outTracked.slice(0, 5).join(', '),
    '加进 .gitignore（打包目录每次 build 都会重写）');
}

console.log('\n=== 3. 静态资源必须真的被引用 ===');
{
  const srcDirs = ['frontend/src', 'electron', 'r-scripts', 'scripts', 'cmd', 'build', 'public/html'];
  // 把所有源码拼一份（体积有限），避免反复起进程；本文件自己除外
  const bag = [];
  const walk = (d) => {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(path.join(d, e.name)); }
      else if (/\.(vue|js|ts|mjs|json|html|md|css)$/.test(e.name) && p !== path.join(ROOT, 'r-scripts/tools/test_repo_hygiene.mjs')) bag.push(readSafe(p));
    }
  };
  srcDirs.forEach(walk);
  bag.push(readSafe(path.join(ROOT, 'README.md')), readSafe(path.join(ROOT, 'R_FRAMEWORK.md')));
  const all = bag.join('\n');

  const imgDir = path.join(ROOT, 'public', 'images', 'example');
  if (!fs.existsSync(imgDir)) {
    console.log('  - public/images/example 已删除（原本 24 个上游 demo 图、2.6MB、零引用）');
  } else {
    const files = fs.readdirSync(imgDir);
    const used = files.filter((f) => all.includes(f));
    check('public/images/example 里的图确有引用（否则是上游脚手架残留）',
      used.length === files.length, `零引用 ${files.length - used.length} 个 / 共 ${files.length} 个`,
      '确认不用就 git rm -r public/images/example');
  }
  // 这两条要精确：不是“文本里出现过就算引用”，而是“路由表里有没有、文件还在不在”。
  // （文本匹配会命中提及它的文档与测试自己 —— 上一版就是匹到了自己。）
  const rmText = readSafe(path.join(ROOT, 'frontend/src/router/routerMap.js'));
  check('路由表里没有上游示例页', !rmText.includes(EXAMPLE_DIR), rmText.slice(0, 60));
  check('上游示例视图已移除（无路由指向它，留着只会让人以为还能打开）',
    !fs.existsSync(path.join(ROOT, 'frontend/src', EXAMPLE_DIR)),
    '还存在：git rm -r frontend/src/' + EXAMPLE_DIR);
}

console.log('\n=== 4. 包管理器与 lockfile 要对得上 ===');
{
  const hasNpm = fs.existsSync(path.join(ROOT, 'package-lock.json'));
  const hasYarn = fs.existsSync(path.join(ROOT, 'yarn.lock'));
  const scripts = JSON.parse(readSafe(path.join(ROOT, 'package.json'))).scripts || {};
  // 真正的装依赖动作在 install_deps.mjs 里（npm install / npm ci），
  // 上一版只看 package.json 的 scripts，漏判了。
  const installer = readSafe(path.join(ROOT, 'r-scripts/tools/install_deps.mjs'));
  const usesNpm = /npm (install|ci)/.test(JSON.stringify(scripts) + installer);
  check('npm 与 yarn 的 lockfile 没有同时存在（两套必漂移）', !(hasNpm && hasYarn),
    hasNpm && hasYarn ? '两个都在' : 'ok');
  if (usesNpm && !hasNpm) {
    warn('装依赖用 npm，但仓库里只有 yarn.lock',
      '在有网机器上跑一次 `npm install --package-lock-only` 生成 package-lock.json；' +
      '否则 npm run setup:js:frozen（npm ci）必然失败');
  }
}

console.log('\n=== 5. 文档类大文件要说明理由 ===');
{
  const big = tracked.map((f) => [f, (() => { try { return fs.statSync(path.join(ROOT, f)).size; } catch { return 0; } })()])
    .filter(([, s]) => s > 900 * 1024)
    .filter(([f]) => /\.(jsonl|zip|exe|dll|pdf)$/i.test(f));
  // 用户已明确决定：development-doc 下的会话记录保留、不过滤、不删除。
  // 那就写成白名单，而不是每次跑都提示一遍 —— 长期存在的提示等于没有提示，
  // 它会把真正该看的新问题淹掉。要改这个决定，改这里并在提交说明里写原因。
  const KEEP = ['2026-11-02T03-29-49-031Z_01a19a4e-5be5-7472-909a-cd373ef454eb.jsonl',
    '2026-11-18T01-01-17-932Z_01a1ec2c-22ea-7781-a539-9c47845954c2.jsonl'];
  const undeclared = big.filter(([f]) => !KEEP.some((k) => f.endsWith(k)));
  check('没有未声明理由的大体积记录文件（已明确保留的两个除外）',
    undeclared.length === 0,
    undeclared.map(([f, s]) => `${f} ${(s / 1048576).toFixed(1)}MB`).join(', '),
    '要么删掉，要么加进本文件的 KEEP 列表并写清为什么留');
  console.log('  - 按你的决定保留：' + KEEP.length + ' 个会话记录（10.3MB，仍会在 git 历史里）');
}

console.log('\n=== 6. SFC 选项里不得有重复键（同名方法后者会静默覆盖前者）===');
{
  // 这就是今天那个"JSON 导不出"的真因：PERMANOVA.vue 的 methods 里有两个 confirmExport，
  // 后面那个旧版把前面 spec 驱动的版本盖住了 —— 代码看着对，跑的却是死的那份。
  // 这种错不会报错、不会红，只能结构上看出来。
  const vues = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p); }
      else if (e.name.endsWith('.vue')) vues.push(p);
    }
  };
  walk(path.join(ROOT, 'frontend', 'src'));
  const bad = [];
  // 上一版正则太宽：把 `rgba(`、`if (`、不同对象里同名的 `chartData: (` 都当成方法了。
  // 方法定义的形状很窄：名字 + 参数表 + 行尾左花括号，且不是关键字。
  const KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'else', 'do', 'try', 'new', 'await', 'typeof']);

  for (const f of vues) {
    const txt = fs.readFileSync(f, 'utf8');
    // 必须按块分组：computed 里的 chartData 与 watch 里的 chartData 是两个不同的东西
    // （后者在监听前者）—— 上一版不分块，把这种止常写法报成了重复键。
    const seen = new Map(); const dup = new Set();
    let blk = '';
    let depth = 0;
    for (const raw of txt.split(String.fromCharCode(10))) {
      const bm = raw.match(/^ {2}([A-Za-z0-9_$]+)\s*:\s*[{[]/);
      if (bm && depth === 0) { blk = bm[1]; depth = 1; continue; }
      if (depth > 0 && /^ {2}\},?$/.test(raw)) { blk = ''; depth = 0; }
      if (!blk) continue;
      const mm = raw.match(/^ {4}(?:async )?([A-Za-z0-9_$]+)\s*\([^()]*\)\s*\{\s*$/)
        || raw.match(/^ {4}([A-Za-z0-9_$]+):\s*(?:async\s+)?(?:function\s*)?\([^()]*\)\s*\{\s*$/);
      if (!mm || KW.has(mm[1])) continue;
      const key = blk + '.' + mm[1];
      if (seen.has(key)) dup.add(key); else seen.set(key, true);
    }
    // 顶层选项重复（两个 methods: { ）另算
    const tops = [...txt.matchAll(/^ {2}([A-Za-z0-9_$]+)\s*:\s*[{[]/gm)].map((m) => m[1]);
    const tseen = new Set(); const tdup = new Set();
    for (const t of tops) { if (tseen.has(t)) tdup.add(t + ' (顶层选项块重复)'); tseen.add(t); }
    if (dup.size || tdup.size) bad.push(path.relative(ROOT, f) + ' [' + [...dup, ...tdup].join(',') + ']');
  }
  check(vues.length + ' 个 .vue 都没有重复的方法/选项键', bad.length === 0, bad.join(' ; '),
    '删掉旧的那份：重复键后者静默覆盖前者，留着的就是一份骗人死代码');
}

console.log('\n=== 7. 已定的决定要落在机器可见的地方\uff08防止后来人把它当漏接去补上）===');
{
  // 这一节存的不是代码质量，是人的决定。没有它们，下一个改代码的人
  // 会把“空着的 publish”当漏接的功能去补，或者又把 lockfile 删了。
  const main = readSafe(path.join(ROOT, 'electron/main.ts'));
  const callers = [];
  const walkDir = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walkDir(p);
      else if (/\.(ts|js)$/.test(e.name) && /autoUpdater\s*\.\s*\w+|from 'electron-updater'|require\('electron-updater'\)/.test(codeOnly(readSafe(path.join(ROOT, p))))) callers.push(p);
    }
  };
  walkDir('electron');
  check('\u81ea\u52a8\u66f4\u65b0\uff1aelectron/ \u91cc\u786e\u5b9e\u6ca1\u6709\u63a5\u7ebf\uff08\u4ea7\u54c1\u51b3\u5b9a\uff1a\u4e0d\u505a\uff09',
    callers.length === 0, callers.join(','));
  check('\u4f46\u8fd9\u4e2a\u51b3\u5b9a\u5199\u8fdb\u4e86\u4ee3\u7801\u6ce8\u91ca\uff08\u5426\u5219\u770b\u8d77\u6765\u50cf\u6f0f\u63a5\uff09',
    /publish[^"]{0,40}\u5360\u4f4d|\u4e0d\u505a/.test(main), 'main.ts \u91cc\u6ca1\u627e\u5230\u8bf4\u660e');

  check('package-lock.json 在（npm run setup:js:frozen 依赖它）',
    fs.existsSync(path.join(ROOT, 'package-lock.json')),
    '\u8dd1 npm install --package-lock-only \u751f\u6210');
  check('\u4ed3\u5e93\u91cc\u4e0d\u518d\u6709 yarn.lock\uff08\u53cc lockfile \u5df2\u5b9e\u6d4b\u6f02\u79fb 835/941 \u884c\uff09',
    !fs.existsSync(path.join(ROOT, 'yarn.lock')) && !tracked.includes('yarn.lock'), '');

  // 用户决定：public/dist 先入库（短期很少重新构建）—— 写住，别被当成失误删了
  check('public/dist \u4ea7\u7269\u5165\u5e93\uff08\u7528\u6237\u51b3\u5b9a\uff0c\u4fbf\u4e8e\u65e0\u9700\u6784\u5efa\u5373\u53ef\u8dd1\uff09',
    tracked.some((f) => f.startsWith('public/dist/')), '\u82e5\u8981\u6539\u4e3a\u4e0d\u5165\u5e93\uff0c\u540c\u6b65\u6539\u672c\u5224\u636e\u4e0e README');
}

console.log(`\n──────── ${pass} 通过 / ${fails.length} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
console.log('RESULT pass=' + pass + ' fail=' + fails.length);
process.exit(fails.length ? 1 : 0);
