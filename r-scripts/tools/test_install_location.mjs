#!/usr/bin/env node
/**
 * setup-r-runtime.ps1 里"安装产物在哪"的判定测试（离线，纯目录树）
 * --------------------------------------------------------------
 * 现场 bug：安装块传的是 `/DIR=$parent`（项目根），而 Inno 的 /DIR 就是**最终安装
 * 目录**、不是上级目录 —— 结果 R 的 bin/library/etc 直接铺进项目根，脚本再按
 * `<parent>\R-<version>` 子目录去找，找不到，报"安装后找不到 R-4.6.1 目录"。
 *
 * 所以 Find-InstalledR 必须只认 bin\Rscript.exe 这个硬证据，并且能吃下两种历史形状：
 * 直接装在目标目录、或装成 <parent>\R-<version>。同时要拒绝"空壳目录"（半成品安装）
 * 和"别的版本"（不能把 R-3.6.1 当 R-4.6.1 搬走）。
 *
 *   node r-scripts/tools/test_install_location.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const raw = fs.readFileSync(path.join(ROOT, 'scripts/setup-r-runtime.ps1'), 'utf8').replace(/^\uFEFF/, '');
const NL = String.fromCharCode(13, 10);

function grab(n) {
  const start = raw.indexOf('function ' + n + '(');
  if (start < 0) throw new Error('找不到函数 ' + n + '（改名了就同步这个测试）');
  const next = raw.indexOf(NL + 'function ', start + 1);
  const b = raw.slice(start, next < 0 ? raw.length : next);
  const lb = b.lastIndexOf('}');
  if (lb < 0) throw new Error('函数 ' + n + ' 没有闭合花括号');
  return b.slice(0, lb + 1);
}

let pass = 0; const fails = [];
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' —— ' + extra : '')); console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'instloc-'));
const mk = (...seg) => {
  const d = path.join(tmp, ...seg);
  fs.mkdirSync(path.join(d, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(d, 'bin', 'Rscript.exe'), 'MZ stub');
  return d;
};
const mkdirOnly = (...seg) => {
  const d = path.join(tmp, ...seg);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

const parent = mkdirOnly('workdir');                 // 模拟项目根
const target = path.join(parent, 'r-portable');      // 期望的目标

// 每种场景：先清场，造出布局，再问 Find-InstalledR 认哪个
function ask(targetDir, parentDir, rv) {
  const body = ['[Console]::OutputEncoding = [System.Text.Encoding]::UTF8']
    .concat([grab('Find-InstalledR')], [
      '$d = Find-InstalledR "' + targetDir + '" "' + parentDir + '" "' + rv + '"',
      'if ($d) { Write-Output ("FOUND=" + $d.FullName) } else { Write-Output "FOUND=" }',
    ]).join(NL + NL);
  const f = path.join(tmp, 'harness.ps1');
  fs.writeFileSync(f, '\uFEFF' + body + NL, 'utf8');
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f],
    { encoding: 'utf8', timeout: 120000 });
  const out = String(r.stdout || '') + String(r.stderr || '');
  const m = /FOUND=(.*)/.exec(out);
  return { found: m ? m[1].trim() : null, out };
}

console.log('\n=== 1. 新形状：/DIR 直接指向 r-portable，产物就在里面 ===');
fs.rmSync(target, { recursive: true, force: true });
mk('workdir', 'r-portable');
let r = ask(target, parent, '4.6.1');
t('认出了目标目录本身（不该再去翻子目录）',
  r.found && r.found.replace(/[\\/]$/, '') === target.replace(/[\\/]$/, ''), 'found=' + r.found);

console.log('\n=== 2. 旧形状：安装器忽略了 /DIR，装成 <parent>\R-4.6.1 ===');
fs.rmSync(target, { recursive: true, force: true });
const nested = mk('workdir', 'R-4.6.1');
r = ask(target, parent, '4.6.1');
t('回退到 <parent>\\R-4.6.1', r.found && r.found.replace(/[\\/]$/, '') === nested.replace(/[\\/]$/, ''), 'found=' + r.found);

console.log('\n=== 3. 什么都没装：必须返回空，不能返回一个不存在的目录 ===');
fs.rmSync(nested, { recursive: true, force: true });
fs.rmSync(target, { recursive: true, force: true });
r = ask(target, parent, '4.6.1');
t('返回空（于是脚本会报"找不到产物"而不是搬个空壳）', r.found === '', 'found=' + r.found);

console.log('\n=== 4. 空壳目录（bin 里没 Rscript.exe）：拒绝 ===');
const shell = mkdirOnly('workdir', 'R-4.6.1');
fs.mkdirSync(path.join(shell, 'bin'), { recursive: true });   // bin 在，但里面空的
fs.rmSync(target, { recursive: true, force: true });
r = ask(target, parent, '4.6.1');
t('不把空壳当安装产物', r.found === '', 'found=' + r.found);

console.log('\n=== 5. 版本不对：不能把 R-3.6.1 当 R-4.6.1 搬走 ===');
fs.rmSync(shell, { recursive: true, force: true });
mkdirOnly('workdir', 'R-3.6.1');
mk('workdir', 'R-3.6.1');                                     // 完整但版本不对
r = ask(target, parent, '4.6.1');
t('拒绝别的版本（否则会搬错运行时）', r.found === '', 'found=' + r.found);

console.log('\n=== 6. 目标目录已存在但没有 Rscript：不能被"目录存在"骗过 ===');
fs.rmSync(path.join(parent, 'R-3.6.1'), { recursive: true, force: true });
mkdirOnly('workdir', 'r-portable');                           // 只有目录，没产物
r = ask(target, parent, '4.6.1');
t('返回空（Test-Path 存在 ≠ 装好了）', r.found === '', 'found=' + r.found);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 系统会清 */ }
console.log('\n──────── ' + pass + ' 通过 / ' + fails.length + ' 失败 ────────');
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
console.log('RESULT pass=' + pass + ' fail=0');
