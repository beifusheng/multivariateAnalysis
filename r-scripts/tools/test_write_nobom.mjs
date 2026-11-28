#!/usr/bin/env node
/**
 * Write-NoBom：生成的 .R 必须能被真 Rscript 读进去
 * ------------------------------------------------
 * 现场报错（另一台机器，日志 development-doc/log.txt）：
 *   ==> 按 lockfile 安装 R 包
 *   错误: 意外的输入在""里
 *   停止执行
 * 根因不在 R、不在网络、不在代理：生成装包脚本时用的是
 *   Set-Content -Encoding UTF8
 * 而 PowerShell 5.1 的 "-Encoding UTF8" 会写入 BOM（EF BB BF），Rscript 解析器
 * 读到文件头 BOM 直接报"意外的输入"。本机用同一条命令复现过，报错一字不差。
 *
 * 所以这个测试做两件事：证明写出来的前三个字节不是 BOM，并且真 Rscript 能跑它。
 * 全程离线，不装任何包。
 *
 *   node r-scripts/tools/test_write_nobom.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const raw = fs.readFileSync(path.join(ROOT, 'scripts/setup-r-runtime.ps1'), 'utf8').replace(/^\uFEFF/, '');
const NL = String.fromCharCode(13, 10);

function grab(n) {
  const withParen = raw.indexOf('function ' + n + '(');
  const bare = raw.indexOf('function ' + n + ' {');
  const start = withParen >= 0 ? withParen : bare;
  if (start < 0) throw new Error('找不到函数 ' + n + '（改名了就同步这个测试）');
  const next = raw.indexOf(NL + 'function ', start + 1);
  const b = raw.slice(start, next < 0 ? raw.length : next);
  return b.slice(0, b.lastIndexOf('}') + 1);
}

const isWin = process.platform === 'win32';
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable', 'bin', isWin ? 'Rscript.exe' : 'Rscript');
if (!fs.existsSync(RSCRIPT)) {
  console.log('[SKIP] 没有 r-portable（' + RSCRIPT + '），这个测试需要真 Rscript');
  console.log('RESULT pass=0 fail=0 skipped=1');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nobom-'));
const rFile = path.join(tmp, 'demo.R');

// 模拟脚本里的写法：多行内容交给 Write-NoBom
const psLines = ['[Console]::OutputEncoding = [System.Text.Encoding]::UTF8']
  .concat([grab('Write-NoBom')], [
    '$body = @"',
    'cat("hello from R\\n")',
    'x <- c(1, 2, 3)',
    'cat("sum=", sum(x), "\\n")',
    '"@',
    'Write-NoBom "' + rFile + '" $body',
    'Write-Output "WROTE=ok"',
  ]).join(NL + NL);
const ps1 = path.join(tmp, 'gen.ps1');
fs.writeFileSync(ps1, '\uFEFF' + psLines + NL, 'utf8');
const g = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
  { encoding: 'utf8', timeout: 120000 });

let pass = 0; const fails = [];
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' —— ' + extra : '')); console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
};

console.log('\n=== Write-NoBom 产出的文件 ===');
t('PowerShell 侧写入成功', /WROTE=ok/.test(String(g.stdout || '') + String(g.stderr || '')),
  String(g.stdout || '').trim().split('\n').slice(-1)[0]);
const bytes = fs.existsSync(rFile) ? fs.readFileSync(rFile) : Buffer.alloc(0);
const hasBom = bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
t('前三个字节不是 EF BB BF（BOM 正是现场那条「意外的输入」的来源）',
  bytes.length > 0 && !hasBom, hasBom ? '仍然是 BOM' : 'bytes=' + bytes.length);
t('文件里没有孤立 CR（换行干净）', !bytes.includes(Buffer.from([13, 13])));

const r = spawnSync(RSCRIPT, [rFile], { encoding: 'utf8', timeout: 120000 });
const rout = String(r.stdout || '') + String(r.stderr || '');
console.log('\n=== 真 Rscript 读它 ===');
console.log('  输出：' + rout.trim().split('\n').join(' / '));
t('Rscript 正常执行（现场那次是"意外的输入 + 停止执行"）', r.status === 0, 'exit=' + r.status);
t('输出里有 cat 的结果', /hello from R/.test(rout) && /sum=\s*6/.test(rout));
t('没有"意外的输入"（含英文对应用词 unexpected input）',
  !/意外的输入/.test(rout) && !/unexpected input/i.test(rout));

// 反向证据：同一份内容改成带 BOM 写，必须复现现场报错——否则这条判据是空转的
const bomFile = path.join(tmp, 'bom.R');
fs.writeFileSync(bomFile, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), bytes]));
const rb = spawnSync(RSCRIPT, [bomFile], { encoding: 'utf8', timeout: 120000 });
const bout = String(rb.stdout || '') + String(rb.stderr || '');
console.log('\n=== 反向验证（加回 BOM 应当复现故障）===');
console.log('  输出：' + bout.trim().split('\n').slice(0, 2).join(' / '));
t('带 BOM 时 Rscript 确实报错（说明判据抓的是真东西）', rb.status !== 0 || /意外的输入|unexpected input/i.test(bout),
  'exit=' + rb.status);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n──────── ' + pass + ' 通过 / ' + fails.length + ' 失败 ────────');
if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
console.log('RESULT pass=' + pass + ' fail=0');
