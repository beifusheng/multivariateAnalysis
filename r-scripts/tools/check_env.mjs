/**
 * 环境自检（doctor）：把"能不能跑"变成一条命令的确定答案。
 *
 * 为什么需要它：本项目有 22 个测试套件 + 4 个 R 尺子，任何一套在缺依赖时报的都是
 * "找不到 vite / 找不到 Rscript / 包版本不符"，用户分不清是代码坏了还是环境没装配。
 * 这里只回答一个问题：**现在这台机器缺什么，下一步该敲哪条命令。**
 *
 * 用法：node r-scripts/tools/check_env.mjs   （或 npm run verify:env）
 * 退出码：0 全部就绪；1 有缺失（不猜、不静默降级）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isWin = process.platform === 'win32';

const problems = [];
const notes = [];
const ok = (label, cond, detail = '', fix = '') => {
  if (cond) {
    console.log(`  \u2713 ${label}${detail ? `  (${detail})` : ''}`);
  } else {
    problems.push(`${label}${fix ? ` —— 下一步：${fix}` : ''}`);
    console.log(`  \u2717 ${label}${detail ? `  (${detail})` : ''}${fix ? `\n      下一步：${fix}` : ''}`);
  }
};

console.log('=== 1. Node 与包管理器 ===');
const nodeMajor = Number(process.versions.node.split('.')[0]);
ok(`Node >= 18（当前 ${process.versions.node}）`, nodeMajor >= 18,
  '', '装一个 Node 18+ 后重跑 npm run verify:env');
// Windows 上 npm 是 npm.cmd：execFileSync('npm') 会 ENOENT（那不是「没装 npm」）
// npm 在 Windows 上是 npm.cmd：没有 shell 时 execFileSync 不解析 .cmd（ENOENT），
// 而 shell:true 传参数会让 Node 发 DEP0190 警告。这里参数是写死的 '--version'，
// 没有任何外部输入，所以 shell 只作最后兜底，优先用 npm_execpath（不需 shell）。
const npmVer = (() => {
  if (process.env.npm_execpath) {
    try { return execFileSync(process.execPath, [process.env.npm_execpath, '--version'], { encoding: 'utf8' }).trim(); } catch { /* 往下兜底 */ }
  }
  for (const c of ['npm', 'npm.cmd']) {
    try { return execFileSync(c, ['--version'], { encoding: 'utf8', shell: true }).trim(); } catch { /* 下一个 */ }
  }
  return '';
})();
ok(`npm 可用${npmVer ? `（${npmVer}）` : ''}`, !!npmVer, '', '把 npm 加进 PATH');

console.log('\n=== 2. JS 依赖（根目录与 frontend）===');
// 只挑真正会让 npm run dev / build 失败的；ee-core 是运行时框架，electron/ee-bin 是壳与构建器
const needRoot = ['ee-core', 'electron', 'ee-bin'];
const rootNM = path.join(ROOT, 'node_modules');
ok('根目录 node_modules 存在', fs.existsSync(rootNM), '', 'npm install');
for (const p of needRoot) {
  ok(`根依赖 ${p}`, fs.existsSync(path.join(rootNM, p)), '', 'npm install');
}
const feNM = path.join(ROOT, 'frontend', 'node_modules');
ok('frontend/node_modules 存在', fs.existsSync(feNM), '', 'npm run setup:frontend（或 npm --prefix frontend install）');
for (const p of ['vue', 'vite', 'element-plus', 'xlsx', 'file-saver']) {
  ok(`frontend 依赖 ${p}`, fs.existsSync(path.join(feNM, p)),
    '', 'npm --prefix frontend install');
}

console.log('\n=== 3. R 运行时 ===');
const rscript = path.join(ROOT, 'r-portable', 'bin', isWin ? 'Rscript.exe' : 'Rscript');
let lock = null;
try { lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'r-runtime.lock.json'), 'utf8')); }
catch (e) { problems.push(`读不到 r-runtime.lock.json：${e.message}`); }

ok('r-portable/bin/Rscript 存在', fs.existsSync(rscript), rscript,
  isWin
    ? 'npm run setup:r（走 scripts/setup-r-runtime.ps1 装配运行时）'
    : '本项目当前只给 Windows 装配脚本；mac/linux 需自备 R 并放到 r-portable/');

let rVersion = '';
if (fs.existsSync(rscript)) {
  try {
    rVersion = execFileSync(rscript, ['--version'], { encoding: 'utf8' }).split('\n')[0];
  } catch (e) { rVersion = ''; }
  ok(`Rscript 能执行（${rVersion.trim().slice(0, 40)}）`, !!rVersion, '', '运行时可能损坏：npm run setup:r 重新装配');
}

console.log('\n=== 4. R 包是否满足 lockfile ===');
if (lock && fs.existsSync(rscript)) {
  const minReq = (lock.r && lock.r.min_required) || '4.3.0';
  const m = /(\d+)\.(\d+)/.exec(rVersion);
  const cur = m ? Number(m[1]) * 100 + Number(m[2]) : 0;
  const [a, b] = minReq.split('.').map(Number);
  ok(`R 版本 >= ${minReq}`, cur >= a * 100 + b, rVersion.trim(), '换更高版本的 R 运行时');

  // 一次调用问完所有必需包（逐个起进程要 20 多秒）
  const mods = Object.keys(lock.required || {});
  // 用 -e 传多行 R 代码在这台机器上会「退出码 2816 且无输出」（引号层太多，
  // 而 R 串里的 Windows 路径还要转义）。改成写临时脚本 + 传一个参数：干净、可复现。
  const probe = path.join(os.tmpdir(), 'renv_probe_' + Date.now() + '.R');
  fs.writeFileSync(probe, [
    'args <- commandArgs(trailingOnly = TRUE)',
    'L <- jsonlite::fromJSON(args[1])',
    'need <- unique(unlist(lapply(L$required, function(x) x$packages)))',
    'ip <- tryCatch(rownames(installed.packages()), error = function(e) character(0))',
    "ver <- lapply(need, function(p) if (p %in% ip) as.character(packageVersion(p)) else NA_character_)",
    'names(ver) <- need   # vapply/sapply 的名字会被 toJSON 丢掉，显式建 list 才对得上',
    'cat(jsonlite::toJSON(list(missing = setdiff(need, ip), versions = ver), auto_unbox = TRUE, null = "null"))'
  ].join(String.fromCharCode(10)), 'utf8');
  let info = null;
  try {
    const out = execFileSync(rscript, [probe, path.join(ROOT, 'r-runtime.lock.json')],
      { encoding: 'utf8', timeout: 180000 });
    info = JSON.parse(out.trim().split(String.fromCharCode(10)).pop());
  } catch (e) {
    ok('向 R 询问包状态', false, String(e.message).slice(0, 120), 'npm run setup:r 之后重跑');
  } finally {
    try { fs.unlinkSync(probe); } catch { /* 临时文件已被清 */ }
  }
  if (info) {
    const miss = info.missing || [];
    ok(`${mods.length} 个模块共 ${Object.keys(info.versions || {}).length} 个必需包全部就位`,
      miss.length === 0, miss.length ? `缺：${miss.join(', ')}` : '',
      isWin
        ? 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-r-runtime.ps1 -Mode fromRepos'
        : '用你的 R 执行 install.packages(c("' + miss.join('","') + '"))');
    for (const mod of mods) {
      const pk = (lock.required[mod] && lock.required[mod].packages) || [];
      const bad = pk.filter((p) => !info.versions || info.versions[p] == null || info.versions[p] === null);
      console.log(`  ${bad.length ? '\u2717' : '\u2713'} ${mod.padEnd(22)} ${pk.map((p) => `${p}@${(info.versions || {})[p] || '-'}`).join(' ')}`);
      if (bad.length) problems.push(`模块 ${mod} 缺包：${bad.join(', ')}`);
    }
  }
  if (lock.missing_required && lock.missing_required.length) {
    notes.push(`lockfile 导出时就有缺失：${lock.missing_required.join(', ')}（说明导出那台机器也不全）`);
  }
}

console.log('\n=== 5. 装配来源是否可执行 ===');
if (lock) {
  const rel = lock.release || {};
  const hasUrl = !!rel.url;
  // 分级要说清道理：运行时与必需包都齐了的话，Release 地址为空**不影响这台机器跑分析**，
  // 它只是"别人 clone 下来装不了"的待办 —— 报成"环境未就绪"是误导，
  // 用户会以为自己的机器坏了。所以：跑得动就当提示，跑不动才算问题。
  const runtimeReady = fs.existsSync(rscript) && problems.length === 0;
  if (runtimeReady) {
    if (!hasUrl) notes.push('Release 附件地址（r-runtime.lock.json 的 release.url）仍是 null：' +
      '本机可用，但别人 clone 后无法用 -Mode fromRelease 装配');
    if (!rel.sha256) notes.push('release.sha256 为空：下载路径没有完整性校验，只能用 -Mode fromLocal/fromRepos');
  } else {
    ok(`Release 附件地址已填（${rel.asset || '未命名'}）`, hasUrl,
      hasUrl ? rel.url : 'url / sha256 仍是 null',
      hasUrl ? '' : '上传运行时到 GitHub Release 后写回 tag/url/sha256/size_bytes；' +
        '或先用 -Mode fromRepos（从 CRAN/Bioconductor 现装）/ -Mode fromLocal -From <本机备份>');
    ok('校验和已声明（下载后能验真伪）', !!rel.sha256, rel.sha256 ? rel.sha256.slice(0, 16) : 'sha256 为空',
      hasUrl && !rel.sha256 ? '补 release.sha256，否则装配脚本只能跳过完整性检查' : '');
  }
  ok('装配脚本在位', fs.existsSync(path.join(ROOT, 'scripts', 'setup-r-runtime.ps1')), '', '脚本丢失：从版本历史恢复');
  ok('R 侧校验器在位', fs.existsSync(path.join(ROOT, 'r-scripts/tools/verify_r_runtime.R')), '', '同上');
}

console.log('\n──────── 自检汇总 ────────');
if (notes.length) { console.log('提示：'); notes.forEach((n) => console.log('  · ' + n)); }
if (problems.length) {
  console.log(`\n[环境未就绪] ${problems.length} 项：`);
  problems.forEach((p) => console.log('  - ' + p));
  process.exit(1);
}
console.log('\n[PASS] 环境就绪：npm run dev 可以直接起，npm run verify 可以跑全部测试');
