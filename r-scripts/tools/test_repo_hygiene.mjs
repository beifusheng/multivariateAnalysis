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
  if (big.length) {
    const tot = big.reduce((a, [, s]) => a + s, 0);
    warn(`仓库里有 ${big.length} 个会话/记录类大文件（共 ${(tot / 1048576).toFixed(1)} MB）`,
      big.map(([f, s]) => `${f} ${(s / 1048576).toFixed(1)}MB`).join(', ') +
      ' —— 若含本机绝对路径或对话内容，建议 git rm --cached 并加 ignore（注意：历史里仍然在，' +
      '要真正缩小体积得改写历史或另起仓库）');
  } else {
    console.log('  ✓ 没有跟踪超过 900KB 的记录类文件');
  }
}

console.log(`\n──────── ${pass} 通过 / ${fails.length} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
console.log('RESULT pass=' + pass + ' fail=' + fails.length);
process.exit(fails.length ? 1 : 0);
