/**
 * 安装 JS 依赖：根目录 + frontend，一条命令搞定。
 *
 * 为什么不用 npm script 里的 `npm install && npm --prefix frontend install`：
 * Windows 自带的 PowerShell 5.x 不支持 `&&`，写进去就是"这台能跑那台不能"。
 * 交给 node 执行，跨平台行为一致，失败时还能说清是哪一步。
 *
 * 用法：node r-scripts/tools/install_deps.mjs [--frozen]（--frozen 用 lockfile 严格安装）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frozen = process.argv.includes('--frozen');
const dry = process.argv.includes('--dry');   // 只报告要做什么：让判据能验证"这脚本至少跑得起来"

// npm 在 Windows 上是 npm.cmd；spawn 需要给绝对命令名（shell:true 时才可省）
const isWin = process.platform === 'win32';
const NPM = (() => {
  // prefix 里必须带上 npm_execpath：上一版漏了，变成 `node install`，
  // node 会去找一个叫 install 的文件 -> MODULE_NOT_FOUND（第二个 bug，只有真跑才看得见）
  if (process.env.npm_execpath) return { cmd: process.execPath, prefix: [process.env.npm_execpath] };
  return { cmd: isWin ? 'npm.cmd' : 'npm', prefix: [] };
})();

/** 把 npm 的 stderr 归成几类可执行的结论（比“把输出贴过来”有用）*/
function detectFailure(r) {
  const s = String((r.stderr || '') + (r.stdout || ''));
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|network/i.test(s)) {
    const m = /request to (https?:\/\/[^\s/]+)/.exec(s);
    return `\n      \u539f\u56e0\uff1a\u7f51\u7edc\u4e0d\u901a\u2014\u2014\u62c9\u4e0d\u5230\u6e90${m ? '\uff08' + m[1] + '\uff09' : ''}\u3002\u6362\u4e2a\u53ef\u8fbe\u7684 registry\uff08npm config set registry ...\uff09\u6216\u8d70\u4ee3\u7406\uff1b\u79bb\u7ebf\u673a\u5668\u8bf7\u76f4\u63a5\u62f7\u8d1d node_modules`;
  }
  if (/EPERM|EACCES|EBUSY/i.test(s)) return '\n      \u539f\u56e0\uff1a\u6587\u4ef6\u88ab\u5360\u7528\u6216\u6743\u9650\u4e0d\u8db3\u2014\u2014\u5148\u5173\u6389\u6b63\u5728\u8fd0\u884c\u7684\u7a0b\u5e8f\uff08\u5305\u62ec\u6253\u5f00\u7684\u5b89\u88c5\u5305\uff09';
  if (/lock|ERESOLVE|peer/i.test(s)) return '\n      \u539f\u56e0\uff1a\u4f9d\u8d56\u89e3\u6790\u51b2\u7a81\u2014\u2014\u6e05\u6389 node_modules \u4e0e package-lock.json \u540e\u91cd\u8bd5';
  return String.fromCharCode(10) + '      ' + '\u4e0b\u4e00\u6b65\uff1a\u8fd0\u884c node r-scripts/tools/check_env.mjs \u67e5\u73af\u5883\uff0c\u6216\u628a\u4e0a\u9762\u7684\u62a5\u9519\u539f\u6587\u8d34\u8fc7\u6765';
}

const steps = [
  { name: '根目录依赖', cwd: ROOT,
    args: frozen ? ['ci'] : ['install'] },
  { name: 'frontend 依赖', cwd: path.join(ROOT, 'frontend'),
    args: frozen ? ['ci'] : ['install'] }
];

let bad = 0;
for (const st of steps) {
  if (!fs.existsSync(path.join(st.cwd, 'package.json'))) {
    console.log(`  ✗ ${st.name}：找不到 package.json（${st.cwd}）`);
    bad++;
    continue;
  }
  const argv = [...NPM.prefix, ...st.args];
  if (dry) { console.log(`  [dry] ${NPM.cmd} ${argv.join(' ')}  (cwd=${st.cwd})`); continue; }   // prefix 属于 NPM，不属于步骤（上一版写成 st.prefix，展开 undefined 直接报不可迭代）
  console.log(`\n=== ${st.name}：npm ${st.args.join(' ')}（${path.relative(ROOT, st.cwd) || '.'}）===`);
  // stdio 用 inherit 时 r.stderr 是 null，归因函数拿不到任何内容（上一版就因此
  // 永远走“通用”分支）。改成捕获 + 当场回显，两边都兼顾。
  const r = spawnSync(NPM.cmd, argv, { cwd: st.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: isWin });
  const outTxt = String(r.stdout || '') + String(r.stderr || '');
  if (r.status === 0) {
    const tailLines = outTxt.split(String.fromCharCode(10)).filter((x) => x.trim()).slice(-3);
    tailLines.forEach((x) => console.log('    ' + x.slice(0, 160)));
  } else {
    outTxt.split(String.fromCharCode(10)).filter((x) => x.trim()).slice(-14).forEach((x) => console.log('    ' + x.slice(0, 180)));
  }
  if (r.status !== 0) {
    // 报错要能归因：同是“退出码 1”，网络不통、lockfile 冲突、权限问题是三件不同的事。
    // 只写“失败了”的话，用户会去查根本不存在的代码 bug（本项目已经在这上头赔过不少时间）。
    const hint = dry ? '' : detectFailure(r);
    console.log(`  ✗ ${st.name} 失败（退出码 ${r.status ?? 'signal'}）${hint}`);
    bad++;
  } else {
    console.log(`  ✓ ${st.name} 完成`);
  }
}

// 装完立刻自检：缺 xlsx / vite 这类东西，等到点"导出"才发现最糟
const feNM = path.join(ROOT, 'frontend', 'node_modules');
const need = ['vue', 'vite', 'element-plus', 'xlsx', 'file-saver'];
const missing = need.filter((p) => !fs.existsSync(path.join(feNM, p)));
console.log('\n=== 关键依赖存在性 ===');
if (missing.length && bad === 0) { console.log('  ✗ 缺：' + missing.join(', ')); bad++; }
else if (!missing.length) console.log('  ✓ ' + need.join(', ') + ' 都在');

if (bad) {
  console.log('\n[FAIL] ' + bad + ' \u6b65\u6709\u95ee\u9898\u2014\u2014\u5177\u4f53\u539f\u56e0\u5df2\u5728\u4e0a\u9762\u6bcf\u4e2a\u6b65\u9aa4\u4e0b\u9762\u6807\u51fa\uff08\u7f51\u7edc / \u6743\u9650 / \u51b2\u7a81\uff09');
  console.log('     \u73af\u5883\u5168\u8c8c\u53ef\u7528 node r-scripts/tools/check_env.mjs \u53d6\u5f97');
  process.exit(1);
}
console.log('\n[PASS] JS 依赖就绪。下一步：npm run setup:r 装配 R 运行时（或 npm run verify:env 看现状）');
