/**
 * 用户场景的离线回归：手动放好的 R 安装器必须被认可，而不是被删。
 *
 * 现场日志（development-doc/log.txt）里的形状：
 *   [WARN] 清除不完整残留 87.5 MB (目标 0 MB)
 *   [info] 进度 87.5 MB 160964870.2%
 * 根因是 HEAD 跟随重定向拿到的假 Content-Length（几十 KB）被当成了真大小，
 * 于是删掉用户花力气放好的文件，再赌 BITS 重下 —— 而 BITS 在代理环境下时好时坏。
 *
 * 这个测试不需要网络也不需要 BITS：目标路径放一个 21MB + MZ 头的文件，
 * Get-File 必须直接认它。跑一次约一秒。
 *
 *   node r-scripts/tools/test_getfile_reuse.mjs
 */
// HEAD 拿不到可信大小（现场是假数字，离线是超时）——此时绝不能删文件，
// 也不能去赌 BITS，应当直接认定可用并返回 True。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const raw = fs.readFileSync(path.join(ROOT, 'scripts/setup-r-runtime.ps1'), 'utf8').replace(/^\uFEFF/, '');
const grab = (n) => {
  const start = raw.indexOf('function ' + n + '(');
  if (start < 0) throw new Error('找不到函数 ' + n + '（改名了就同步这个测试）');
  const next = raw.indexOf('\nfunction ', start + 1);
  const b = raw.slice(start, next < 0 ? raw.length : next);
  return b.slice(0, b.lastIndexOf('}') + 1);
};
const NL = String.fromCharCode(13, 10);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reuse-'));
const target = path.join(tmp, 'R-4.6.1-win.exe');

// 真装一个"像安装器"的文件：MZ 头 + 21MB
const big = Buffer.alloc(21 * 1024 * 1024, 0x41);
big[0] = 0x4D; big[1] = 0x5A;
fs.writeFileSync(target, big);
const sizeBefore = fs.statSync(target).size;

const body = ['[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  "$ProgressPreference = 'SilentlyContinue'"]
  .concat(['Step', 'Ok', 'Warn', 'Fail', 'Info', 'Test-InstallerHint', 'Get-File'].map(grab), [
    // 地址故意用一个不存在的：证明"认文件"这条路根本不依赖网络
    '$ret = Get-File "http://127.0.0.1:9/R-4.6.1-win.exe" "' + target + '" 5 10',
    'Write-Output ("RESULT=" + $ret)',
    'Write-Output ("SIZE=" + (Get-Item "' + target + '").Length)',
  ]).join(NL + NL);
const f = path.join(tmp, 'h.ps1');
fs.writeFileSync(f, '\uFEFF' + body + NL, 'utf8');
const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f],
  { encoding: 'utf8', timeout: 150000 });
const out = String(r.stdout || '') + String(r.stderr || '');
// 完整输出留一份在失败时看，平时安静
  if (process.env.GETFILE_VERBOSE) console.log(out.trim());

let pass = 0; const fails = [];
const t = (n, c, e = '') => { if (c) { pass++; console.log('✓ ' + n); } else { fails.push(n + ' ' + e); console.log('✗ ' + n + '  ' + e); } };
console.log('=== 手动放好的安装器：认可、保留、不碰网络 ===');
t('返回 True（手动放好的文件被认可）', /RESULT=True/.test(out));
t('文件没有被删掉', fs.existsSync(target) && fs.statSync(target).size === sizeBefore,
  fs.existsSync(target) ? fs.statSync(target).size + ' 字节' : '文件没了');
t('走了"像个完整安装器"这条分支', /像个完整安装器/.test(out), '');
t('没有输出"清除…残留"', !/清除.*残留/.test(out), '');
t('没去动 BITS（整条路零网络依赖）', !/BITS/.test(out),
  (out.split('\n').find((l) => /BITS/.test(l)) || '').trim());

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n---- ' + pass + ' 通过 / ' + fails.length + ' 失败 ----');
process.exit(fails.length ? 1 : 0);
