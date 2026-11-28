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
  // PowerShell 允许无参函数写成 `function Foo {`（不带括号），两种形状都要能吃下：
  // Backup-Existing 就是这种，只按 '(' 找会误报"函数不存在"。
  const withParen = raw.indexOf('function ' + n + '(');
  const bare = raw.indexOf('function ' + n + ' {');
  const start = withParen >= 0 ? withParen : bare;
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

console.log('\n=== 7-11. Place-Runtime：这一层曾经把用户刚装好的 R 删了 ===');
// 现场事故：TrimEnd('\') 被编辑过程吃成 TrimEnd('')，于是
//   $want = "…\r-portable\"（带尾斜杠）而 $installed.FullName = "…\r-portable"
// 两者不等 -> 走"删目标再搬"分支 -> 删掉的就是刚装好的那个目录 -> Move 报源不存在。
function place(targetDir, installedDir, opts) {
  opts = opts || {};
  const body = ['[Console]::OutputEncoding = [System.Text.Encoding]::UTF8']
    .concat(['Ok', 'Warn', 'Fail', 'Info', 'Step', 'Test-Runtime', 'Backup-Existing', 'Find-InstalledR', 'Place-Runtime'].map(grab), [
      '$TARGET_DIR = "' + targetDir + '"',
      '$Target = "r-portable"',
      '$Force = $' + (opts.force ? 'true' : 'false'),
      '$obj = Get-Item "' + installedDir + '"',
      '$ret = Place-Runtime $obj $TARGET_DIR',
      'Write-Output ("RET=" + $ret)',
    ]).join(NL + NL);
  const f = path.join(tmp, 'place.ps1');
  fs.writeFileSync(f, '\uFEFF' + body + NL, 'utf8');
  const rr = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f],
    { encoding: 'utf8', timeout: 120000 });
  return String(rr.stdout || '') + String(rr.stderr || '');
}
const hasRscript = (d) => fs.existsSync(path.join(d, 'bin', 'Rscript.exe'));

console.log('  -- 7. 产物已经在目标位置（最常见，也最危险）');
fs.rmSync(target, { recursive: true, force: true });
fs.rmSync(path.join(parent, 'R-4.6.1'), { recursive: true, force: true });
mk('workdir', 'r-portable');
let o = place(target, target);
t('返回 True', /RET=True/.test(o), o.trim().split('\n').slice(-1)[0]);
t('刚装好的 r-portable 还在（这就是那条删库事故的回归）', hasRscript(target), '被删了');
t('没有产生 .invalid-* 备份（说明根本没走破坏性分支）',
  !/\.invalid-/.test(fs.readdirSync(parent).join(',')), fs.readdirSync(parent).join(','));

console.log('  -- 8. 目标路径带尾斜杠：必须仍然判为"同一个目录"');
fs.rmSync(target, { recursive: true, force: true });
mk('workdir', 'r-portable');
o = place(target + String.fromCharCode(92), target);
console.log('    RAW8: ' + JSON.stringify(o.split(String.fromCharCode(10)).slice(0, 6).join(' | ').slice(0, 300)));
t('尾斜杠不再造成误判（当年就是这么删掉的）', /RET=True/.test(o) && hasRscript(target),
  o.trim().split('\n').slice(-1)[0]);

console.log('  -- 9. 产物在别处（<parent>\R-4.6.1）：搬过去');
fs.rmSync(target, { recursive: true, force: true });
const nested2 = mk('workdir', 'R-4.6.1');
o = place(target, nested2);
t('返回 True 且产物落到 r-portable', /RET=True/.test(o) && hasRscript(target),
  o.trim().split('\n').slice(-1)[0]);

console.log('  -- 10. 源目录其实没有 Rscript：拒绝动手，目标原封不动');
fs.rmSync(target, { recursive: true, force: true });
mk('workdir', 'r-portable');
const keepSize = fs.statSync(path.join(target, 'bin', 'Rscript.exe')).size;
const emptySrc = mkdirOnly('workdir', 'R-9.9.9');           // 没有 bin\Rscript.exe
o = place(target, emptySrc);
t('返回 False', /RET=False/.test(o), o.trim().split('\n').slice(-1)[0]);
t('目标目录没被牵连（还是原来那个文件）',
  hasRscript(target) && fs.statSync(path.join(target, 'bin', 'Rscript.exe')).size === keepSize, '被殃及');

console.log('  -- 11. 目标已存在且不可用时：改名保留，不是删除');
fs.rmSync(path.join(parent, 'R-9.9.9'), { recursive: true, force: true });
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });                  // 空壳，Test-Runtime 会说不通
fs.writeFileSync(path.join(target, 'marker.txt'), 'mine');   // 用户自己的东西
const nested3 = mk('workdir', 'R-4.6.1');
o = place(target, nested3);
const survivors = fs.readdirSync(parent).join(',');
t('返回 True', /RET=True/.test(o), o.trim().split('\n').slice(-1)[0]);
t('旧目录被改名保留（出现 .invalid-*），而不是被删',
  /\.invalid-/.test(survivors), survivors);
t('用户留下的 marker.txt 还在备份里',
  fs.readdirSync(parent).some((d) => d.includes('.invalid-') &&
    fs.existsSync(path.join(parent, d, 'marker.txt'))), survivors);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 系统会清 */ }
console.log('\n──────── ' + pass + ' 通过 / ' + fails.length + ' 失败 ────────');
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
console.log('RESULT pass=' + pass + ' fail=0');
