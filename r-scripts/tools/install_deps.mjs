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

// npm 在 Windows 上是 npm.cmd；spawn 需要给绝对命令名（shell:true 时才可省）
const isWin = process.platform === 'win32';
const NPM = (() => {
  if (process.env.npm_execpath) return { cmd: process.execPath, prefix: [] };
  return { cmd: isWin ? 'npm.cmd' : 'npm', prefix: [] };
})();

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
  const argv = [...st.prefix, ...st.args];
  console.log(`\n=== ${st.name}：npm ${st.args.join(' ')}（${path.relative(ROOT, st.cwd) || '.'}）===`);
  const r = spawnSync(NPM.cmd, argv, { cwd: st.cwd, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    console.log(`  ✗ ${st.name} 失败（退出码 ${r.status ?? 'signal'}）`);
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
  console.log(`\n[FAIL] ${bad} 步有问题：把上面的输出贴过来，或先跑 node r-scripts/tools/check_env.mjs`);
  process.exit(1);
}
console.log('\n[PASS] JS 依赖就绪。下一步：npm run setup:r 装配 R 运行时（或 npm run verify:env 看现状）');
