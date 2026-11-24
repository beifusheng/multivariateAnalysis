/**
 * 一键跑完全部验收：22 个 node 套件 + 4 个 R 尺子，给一张表和一个退出码。
 *
 * 为什么不用 shell 循环：Windows 的 cmd / PowerShell 与 bash 的 glob、引号规则都不一样，
 * 而这套测试是交付前的最后一道门 —— 它必须能在任何一台开发机上敲同一条命令。
 *
 * 用法：
 *   node r-scripts/tools/run_all_tests.mjs            # node 套件 + R 尺子
 *   node r-scripts/tools/run_all_tests.mjs --node     # 只跑 node（快，不起 R 分析）
 *   node r-scripts/tools/run_all_tests.mjs --r        # 只跑 R 尺子
 *   node r-scripts/tools/run_all_tests.mjs --only era # 名字含 era 的都跑
 *   node r-scripts/tools/run_all_tests.mjs --strict   # 把 stderr 也打出来（排错用）
 *
 * 退出码：0 全过；1 有套件失败
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLS = path.join(ROOT, 'r-scripts', 'tools');
const args = process.argv.slice(2);
const onlyNode = args.includes('--node');
const onlyR = args.includes('--r');
const strict = args.includes('--strict');
const iOnly = args.indexOf('--only');
const filter = iOnly >= 0 ? String(args[iOnly + 1] || '').toLowerCase() : '';

const isWin = process.platform === 'win32';
const RSCRIPT = process.env.RSCRIPT ||
  path.join(ROOT, 'r-portable', 'bin', isWin ? 'Rscript.exe' : 'Rscript');

const files = fs.readdirSync(TOOLS).sort();
const nodeSuites = files.filter((f) => /^(test|verify)_[a-z0-9_]+\.mjs$/.test(f));
const rSuites = files.filter((f) => /^verify_[a-z0-9_]+\.R$/.test(f));

const summary = [];
let bad = 0;

/** 从输出里抓「N 通过 / M 失败」或「[PASS] N 项全过」，抓不到就当失败（不许空过） */
function parseResult(out) {
  const failLine = /(\d+) 通过 \/ (\d+) 失败/.exec(out);
  if (failLine) return { pass: Number(failLine[1]), fail: Number(failLine[2]), parsed: true };
  // 机器可读契约行（新加入的套件请优先用它，别再让解析器猜散文）
  const mres = /RESULT pass=(\d+) fail=(\d+)/.exec(out);
  if (mres) return { pass: Number(mres[1]), fail: Number(mres[2]), parsed: true };
  const passLine = /\[PASS\] (\d+) 项全过/.exec(out);
  if (passLine) return { pass: Number(passLine[1]), fail: 0, parsed: true };
  const rfail = /\[FAIL\] (\d+) 项通过 \/ (\d+) 失败/.exec(out);
  if (rfail) return { pass: Number(rfail[1]), fail: Number(rfail[2]), parsed: true };
  if (/全部通过/.test(out)) return { pass: null, fail: 0, parsed: true };
  if (/所有模板统计量一致/.test(out)) return { pass: null, fail: 0, parsed: true };
  // verify_med_templates.mjs 的收尾是三行 "运行成功 : 25/25"：全部 X/X 才算过
  // verify_nonrandom_templates.mjs 收尾是 "通过 26 / 26　耗时 55.1s"（中间是全角空格）

  // 各套件的收尾格式必须统一成「N 通过 / M 失败」—— 曾有两个套件用散文式收尾
  // ("运行成功 : 25/25"、"通过 26 / 26　耗时")，让运行器只能猜；已改成让它们输出标准行。
  return { pass: null, fail: null, parsed: false };
}

function run(kind, name, cmd, cargs, opts = {}) {
  const t0 = Date.now();
  let r;
  try {
    r = spawnSync(cmd, cargs, { cwd: ROOT, encoding: 'utf8', timeout: opts.timeout || 2400000, maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    summary.push({ kind, name, state: 'CRASH', detail: String(e.message).slice(0, 90), secs: 0 });
    bad++;
    return;
  }
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const parsed = parseResult(out);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  let state, detail;
  if (r.error) { state = 'CRASH'; detail = String(r.error.message).slice(0, 90); }
  else if (!parsed.parsed) {
    // 没抓到汇总行 = 这套测试自己没报告结果。当成失败处理，不许"静默通过"。
    state = 'NO-SUMMARY';
    detail = (out.trim().split('\n').pop() || '无输出').slice(0, 90);
  } else if (parsed.fail) { state = 'FAIL'; detail = `${parsed.pass} 通过 / ${parsed.fail} 失败`; }
  else { state = 'PASS'; detail = parsed.pass == null ? 'ok' : `${parsed.pass} 项`; }
  if (r.status !== 0 && state === 'PASS') { state = 'FAIL'; detail = `退出码 ${r.status}（与汇总不一致）`; }
  if (state !== 'PASS') {
    bad++;
    if (strict) console.log(out.split('\n').slice(-40).join('\n'));
  }
  summary.push({ kind, name, state, detail, secs });
  console.log(`  ${state === 'PASS' ? '\u2713' : '\u2717'} ${name.padEnd(34)} ${state.padEnd(11)} ${String(detail).padEnd(26)} ${secs}s`);
}

const wantNode = !onlyR;
const wantR = !onlyNode;

if (wantNode) {
  console.log('\n=== node 套件（视图渲染 / spec 对账 / 运行时链路）===');
  for (const f of nodeSuites) {
    if (filter && !f.toLowerCase().includes(filter)) continue;
    run('node', f, process.execPath, [path.join(TOOLS, f)]);
  }
}
if (wantR) {
  console.log('\n=== R 尺子（统计口径的已知答案）===');
  if (!fs.existsSync(RSCRIPT)) {
    console.log(`  \u2717 Rscript 不存在：${RSCRIPT}`);
    console.log('    下一步：npm run setup:r（或 node r-scripts/tools/check_env.mjs 看缺什么）');
    bad++;
  } else {
    for (const f of rSuites) {
      if (filter && !f.toLowerCase().includes(filter)) continue;
      run('r', f, RSCRIPT, [path.join('r-scripts', 'tools', f)], { timeout: 2400000 });
    }
  }
}

console.log('\n──────── 汇总 ────────');
const by = {};
for (const s of summary) by[s.state] = (by[s.state] || 0) + 1;
console.log('  ' + Object.entries(by).map(([k, v]) => `${k}=${v}`).join('  '));
if (bad) {
  console.log('\n  失败/异常项：');
  summary.filter((s) => s.state !== 'PASS')
    .forEach((s) => console.log(`    - [${s.kind}] ${s.name}: ${s.state} ${s.detail}`));
  console.log('\n[FAIL] 有套件未通过');
  process.exit(1);
}
console.log(`\n[PASS] ${summary.length} 个套件全部通过`);
