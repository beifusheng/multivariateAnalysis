/**
 * GUI 端到端（真 Electron + CDP，零新增依赖）
 *
 * 为什么非得是"真界面"：本项目最近两个 bug 都藏在 GUI 层 ——
 *   (a) methods 里有两个 confirmExport，后者静默覆盖前者，导出的 JSON 从来没走 spec；
 *   (b) ee-bin 的 win64 只跑 electron-builder，把几周前的脚手架 bundle 打进了安装包；
 *   (c) frontend/index.html 的 <title> 是空的，标题栏显示什么只有真打开窗口才知道。
 * 这三条在源码级断言里全是绿的：代码写得对、配置也写了。**只有真的点开一次才会露馅。**
 *
 * 实现：这台机器没外网装不了 Playwright，但仓库里已经有
 *   - node_modules/electron/dist/electron.exe（39.8.10）
 *   - node_modules/ws（8.21.3）
 * 所以直接用 CDP：启动真应用 -> /json/list 拿 page target -> WebSocket ->
 * Runtime.evaluate 驱动真实 DOM 点击，下载目录用 Page.setDownloadBehavior 指到临时目录，
 * 于是"导出有没有真的产生文件"变成可以断言的事。
 *
 * 用法：node r-scripts/tools/test_e2e_gui.mjs [--headed] [--keep] [--skip-run]
 *   --skip-run 跳过"跑一次真分析"（最慢的一段，约 1-3 分钟）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require_ = createRequire(path.join(ROOT, 'package.json'));
const WebSocket = require_('ws');

const isWin = process.platform === 'win32';
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', isWin ? 'electron.exe' : 'electron');
const PORT = Number(process.env.E2E_PORT || 9333);
const HEADED = process.argv.includes('--headed');
const KEEP = process.argv.includes('--keep');
const SKIP_RUN = process.argv.includes('--skip-run');
const BOOT_MS = Number(process.env.E2E_BOOT_MS || 90000);
const RUN_MS = Number(process.env.E2E_RUN_MS || 300000);

let pass = 0; const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else {
    fails.push(name + (detail ? ` —— ${detail}` : ''));
    console.log('  \u2717 ' + name + (detail ? `  [${String(detail).slice(0, 220)}]` : ''));
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, label) => Promise.race([
  p, new Promise((res) => setTimeout(() => res({ __timeout: label }), ms))
]);

if (!fs.existsSync(ELECTRON)) {
  console.log('[SKIP] 没有本地 electron 可执行文件：' + ELECTRON);
  console.log('RESULT pass=0 fail=0');
  process.exit(0);
}

// 独立 userData：config.default.ts 里 singleLock=true，与桌面上正在跑的实例共用目录时
// 第二个进程会直接退出 —— 表现为"e2e 起不来"这种假故障，必须先排除。
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-profile-'));
const dlDir = path.join(profile, 'downloads');
fs.mkdirSync(dlDir, { recursive: true });

console.log('\n=== 1. 启动真应用 ===');
const child = spawn(ELECTRON, [
  '.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`
].filter(Boolean), { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

let log = '';
child.stdout.on('data', (d) => { log += d.toString(); });
child.stderr.on('data', (d) => { log += d.toString(); });

async function waitForTarget(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* CDP 还没监听 */ }
    if (child.exitCode !== null) return null;
    await sleep(400);
  }
  return null;
}

const target = await waitForTarget(60000);
check('CDP 连上了应用页面（真主进程 + 真渲染进程）', !!target,
  target ? '' : '启动日志尾部：' + log.slice(-400));

let ws = null;
let seq = 0;
const pending = new Map();
const pageErrors = [];

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

async function evalJs(expression, awaitPromise = false) {
  const r = await withTimeout(send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }), 30000, 'eval-timeout');
  if (r && r.__timeout) return { ok: false, value: null, err: r.__timeout };
  if (r.exceptionDetails) {
    const d = r.exceptionDetails.exception?.description || r.exceptionDetails.text;
    pageErrors.push(d);
    return { ok: false, value: null, err: d };
  }
  return { ok: true, value: r.result?.value };
}
const js = (expr) => evalJs(expr).then((r) => r.value);

/** 等页面满足条件（真界面异步渲染，sleep 硬等是不可靠的） */
async function waitJs(expr, ms, desc) {
  const end = Date.now() + ms;
  let last = null;
  while (Date.now() < end) {
    last = await js(expr);
    if (last) return last;
    if (child.exitCode !== null) break;
    await sleep(500);
  }
  return null;
}

if (target) {
  ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
  await withTimeout(new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); }), 15000, 'ws-timeout');
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
  });
  await send('Runtime.enable');
  // 下载落到我们的临时目录，"导出真的产生了文件"才变得可断言
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir }).catch(() => {});

  console.log('\n=== 2. 首页（真 DOM，不是 jsdom 近似）===');
  const cards = await waitJs(
    'document.querySelectorAll(".method-cards .el-card").length >= 5 ? document.querySelectorAll(".method-cards .el-card").length : 0',
    BOOT_MS, 'cards');
  check('\u9996\u9875\u6e32\u67d3\u51fa 5 \u5f20\u65b9\u6cd5\u5361\u7247', Number(cards) >= 5, 'cards=' + cards);

  // 标题必须与 electron 配置一致：以前 index.html 的 <title> 是空的，
  // 而页面 title 会盖掉 windowsOption.title —— 只有真开窗口才看得出来。
  const cfg = fs.readFileSync(path.join(ROOT, 'electron/config/config.default.ts'), 'utf8');
  const cfgTitle = (cfg.match(/title:\s*'([^']+)'/) || [])[1] || '';
  const docTitle = String(await js('document.title') || '');
  check('\u9875\u9762\u6807\u9898\u4e0e windowsOption.title \u4e00\u81f4\uff08\u4e0d\u662f\u7a7a\u4e32\u3001\u4e0d\u662f ee\uff09',
    docTitle !== '' && docTitle === cfgTitle, `document.title=${JSON.stringify(docTitle)} cfg=${JSON.stringify(cfgTitle)}`);
  check('\u6807\u9898\u680f\u4e0d\u5e26\u7f72\u540d\uff08\u7528\u6237\u51b3\u5b9a\uff1a\u7f72\u540d\u53ea\u8fdb\u9996\u9875\u4e0e\u5143\u6570\u636e\uff09',
    !/design for/.test(docTitle), docTitle);

  const note = String(await js('Array.from(document.querySelectorAll(".app-design-note")).map(e=>e.textContent).join("|")') || '');
  check('\u7f72\u540d\u5728\u754c\u9762\u4e0a\u771f\u7684\u770b\u5f97\u89c1', note.includes('design for'), JSON.stringify(note));
  const scaffold = await js('document.body.innerText.includes("ElectronEgg") || document.body.innerText.includes("Hello World")');
  check('\u4e0d\u662f\u8001\u811a\u624b\u67b6\u9875\u9762\uff08\u4eca\u5929\u6253\u8fdb\u5b89\u88c5\u5305\u7684\u5c31\u662f\u5b83\uff09', scaffold === false, String(scaffold));

  console.log('\n=== 3. \u771f\u70b9\u51fb\uff1a\u8def\u7531 -> \u6a21\u677f -> \u8fd0\u884c\u5206\u6790 ===');
  await js('location.hash = "#/r-analysis/permanova"; 1');
  const ta = await waitJs('document.querySelectorAll("textarea").length', 60000, 'textarea');
  check('PERMANOVA \u9875\u771f\u6b63\u6e32\u67d3\uff08\u6709\u8f93\u5165\u6846\uff09', Number(ta) >= 2, 'textarea=' + ta);

  const btnTexts = JSON.parse(await js('JSON.stringify(Array.from(document.querySelectorAll("button")).map(b=>b.innerText.trim()).filter(Boolean))') || '[]');
  check('\u6a21\u677f\u6309\u94ae\u7531 JSON \u6e32\u67d3\u51fa\u6765\uff08\u4e0d\u662f\u5199\u6b7b\u7684 33 \u4e2a button\uff09',
    btnTexts.filter((t) => /^[^\x00-\x7F]/.test(t)).length >= 10, 'btns=' + btnTexts.length);

  // 点 🧬 显式因子 + 协变量：这条模板有已知答案（R²=0.58982 / F=3.8345）
  const clicked = await js(
    '(() => { const b = Array.from(document.querySelectorAll("button")).find(x => x.innerText.includes("\u663e\u5f0f\u56e0\u5b50"));' +
    ' if (!b) return "not-found"; b.click(); return "ok"; })()');
  check('\u70b9\u51fb\u6a21\u677f\u6309\u94ae\u6210\u529f', clicked === 'ok', String(clicked));

  const filled = await waitJs(
    'Array.from(document.querySelectorAll("textarea")).some(t => t.value && t.value.length > 100) ? "filled" : 0',
    30000, 'filled');
  check('\u6a21\u677f\u6570\u636e\u771f\u6b63\u586b\u8fdb\u4e86\u8f93\u5165\u6846', filled === 'filled', String(filled));

  if (!SKIP_RUN) {
    const enabled = await waitJs(
      '(() => { const b = document.querySelector(".btn-run"); return b && !b.disabled ? 1 : 0; })()',
      30000, 'run-enabled');
    check('\u6570\u636e\u5408\u6cd5\u540e"\u8fd0\u884c\u5206\u6790"\u81ea\u5df1\u53d8\u53ef\u7528\uff08\u4e0d\u662f\u4eba\u5de5\u5f00\u542f\uff09', !!enabled, String(enabled));

    if (enabled) {
      await js('document.querySelector(".btn-run").click(); 1');
      const got = await waitJs(
        '/0\\.5898/.test(document.body.innerText) ? "shown" : 0', RUN_MS, 'result');
      check('\u70b9\u8fd0\u884c -> IPC -> \u771f R -> \u754c\u9762\u51fa\u73b0 R\u00b2=0.5898\uff08\u7aef\u5230\u7aef\uff09',
        got === 'shown', 'result=' + got);
    }
  } else {
    console.log('  - \u8df3\u8fc7\u771f\u5206\u6790\uff08--skip-run\uff09');
  }

  console.log('\n=== 4. \u5bfc\u51fa\uff1a\u6587\u4ef6\u5fc5\u987b\u771f\u843d\u5730 ===');
  if (!SKIP_RUN) {
    // 侧工具栏默认收起，收起时靠 visibility:hidden 藏 —— innerText 会尊重 CSS
    // 可见性返回空串，于是“按文字找按钮”直接失效。jsdom 不做这层过滤，
    // 这种差异只有真浏览器里才暴露（本轮就是靠它发现 selector 写歪的）。
    await js('(() => { const t = document.querySelector(".toolbar-toggle"); if (t) t.click(); return 1; })()');
    await waitJs('(() => { const b = Array.from(document.querySelectorAll("button")).find(x => (x.textContent||"").includes("\u5bfc\u51fa")); return b && (b.innerText||"").length > 0 ? 1 : 0; })()', 8000, 'toolbar-open');

    const opened = await js(
      '(() => { const all = Array.from(document.querySelectorAll("button"));' +
      ' const bs = all.filter(b => (b.textContent||"").includes("\u5bfc\u51fa"));' +
      ' if (!bs.length) return "no-btn|" + JSON.stringify(all.map(b=>(b.textContent||"").trim()).filter(Boolean).slice(0,30));' +
      ' const b = bs.find(x => !x.disabled);' +
      ' if (!b) return "disabled|" + bs.map(x => (x.textContent||"").trim()).join(",");' +
      ' b.click(); return "ok"; })()');
    check('\u5c55\u5f00\u4fa7\u5de5\u5177\u680f\u540e\u70b9\u5f97\u5230"\u5bfc\u51fa\u7ed3\u679c"', opened === 'ok', String(opened));

    const dlg = await waitJs('!!document.querySelector(".el-dialog") ? document.querySelectorAll(".el-checkbox").length : 0', 20000, 'dialog');
    check('\u5bfc\u51fa\u5bf9\u8bdd\u6846\u5f39\u51fa\u6765\u4e14\u6709\u52fe\u9009\u9879', Number(dlg) >= 2, 'checkbox=' + dlg);

    const before = fs.readdirSync(dlDir).length;
    const conf = await js(
      '(() => { const d = document.querySelector(".el-dialog"); if (!d) return "no-dialog";' +
      ' const b = Array.from(d.querySelectorAll("button")).find(x => (x.textContent||"").trim() === "\u5bfc\u51fa");' +
      ' if (!b) return "no-confirm|" + Array.from(d.querySelectorAll("button")).map(x=>(x.textContent||"").trim()).join(",");' +
      ' if (b.disabled) return "disabled"; b.click(); return "ok"; })()');
    check('\u70b9\u5bf9\u8bdd\u6846\u91cc\u7684"\u5bfc\u51fa"\u786e\u8ba4', conf === 'ok', String(conf));

    const t0 = Date.now();
    let files = [];
    // 不能“看到 json 就收工”：任务表是 json 在前、xlsx 在后，
    // 上一版 json 一到就跳出循环，xlsx 还在写，于是报了一条假缺陷。
    while (Date.now() - t0 < 90000) {
      files = fs.readdirSync(dlDir);
      const nPng = files.filter((f) => f.endsWith('.png')).length;
      if (files.some((f) => f.endsWith('.json')) && files.some((f) => f.endsWith('.xlsx')) && nPng >= 2) break;
      await sleep(1000);
    }
    await sleep(2000);   // 再给最后一张图写盘留点时间
    files = fs.readdirSync(dlDir);
    check('\u5bfc\u51fa\u771f\u7684\u4ea7\u751f\u4e86\u6587\u4ef6\uff08\u4e0d\u662f\u53ea\u6253\u4e86\u4e00\u53e5"\u5bfc\u51fa\u6210\u529f"\uff09',
      files.length > before, 'files=' + files.join(','));
    const jsonf = files.find((f) => f.endsWith('.json'));
    if (jsonf) {
      const txt = fs.readFileSync(path.join(dlDir, jsonf), 'utf8');
      let obj = null; try { obj = JSON.parse(txt); } catch { /* 断言会接住 */ }
      check('JSON \u6587\u4ef6\u53ef\u89e3\u6790\u4e14\u5e26 R\u00b2/F/p\uff08\u5bfc\u51fa\u7684\u662f\u771f\u7ed3\u679c\uff09',
        !!obj && obj.R2 !== undefined && obj.F_model !== undefined, jsonf + ' keys=' + Object.keys(obj || {}).slice(0, 8).join(','));
      console.log('  \u5bfc\u51fa\u7684\u6587\u4ef6\uff1a' + jsonf + '\uff08' + txt.length + ' \u5b57\u8282\uff09');
    }
    const xl = files.filter((f) => f.endsWith('.xlsx'));
    const png = files.filter((f) => f.endsWith('.png'));
    const dlgErr = String(await js(
      '(() => { const a = document.querySelector(".el-dialog .el-alert"); return a ? a.textContent.trim() : ""; })()') || '');
    check('xlsx 也一起落地（默认勾选里有表格）', xl.length >= 1,
      'files=' + files.join(',') + (dlgErr ? ' | 对话框报错：' + dlgErr : ''));
    // 以前这里只能导出一张图（当前 tab），得手动切五次。
    check('\u56fe\u8868 PNG \u6279\u91cf\u843d\u5730\uff08\u4e0d\u6b62\u5f53\u524d tab\uff09', png.length >= 2,
      'png=' + png.length + ' \u5f20: ' + png.map((f) => f.replace(/^\u5206\u6790\u56fe\u8868_/, '').replace(/\.png$/, '')).join(','));
  } else {
    console.log('  - \u8df3\u8fc7\uff08\u6ca1\u8dd1\u5206\u6790\u5c31\u6ca1\u7ed3\u679c\u53ef\u5bfc\uff09');
  }

  console.log('\n=== 4.5 其余四个模块的渲染冒烟 ===');
  {
    const mods = ['permanova-med', 'nonrandom-permanova', 'gmr4', 'bayesian-era'];
    for (const m of mods) {
      const before = pageErrors.length;
      await js(`location.hash = "#/r-analysis/${m}"; 1`);
      const shown = await waitJs(
        '(() => { const t = document.body.innerText; return (t.length > 800 && document.querySelectorAll("textarea, .el-select, button").length > 3) ? 1 : 0; })()',
        40000, m);
      check(`${m} 页面渲染出来了（不是空白或报错页）`, !!shown, 'shown=' + shown);
      check(`${m} 没有页面异常`, pageErrors.length === before, pageErrors.slice(before).join(' ; ').slice(0, 180));
    }
  }

  console.log('\n=== 5. \u5168\u7a0b\u62a5\u9519\u76d1\u63a7 ===');
  check('\u6ca1\u6709\u672a\u6355\u83b7\u7684\u9875\u9762\u5f02\u5e38\uff08\u5b83\u4eec\u6b64\u524d\u53ea\u8868\u73b0\u4e3a"\u5143\u7d20\u4e0d\u5b58\u5728"\uff09',
    pageErrors.length === 0, pageErrors.join(' ; ').slice(0, 300));
}

console.log('\n=== 6. \u6536\u5c3e ===');
if (!KEEP) {
  await withTimeout(send('Browser.close').catch(() => {}), 5000, 'close-skip');
  await sleep(500);
  if (child.exitCode === null) { try { child.kill('SIGTERM'); } catch { /* \u5df2\u9000 */ } }
  console.log('  (electron \u5df2\u5173\u95ed\uff1b--keep \u53ef\u4fdd\u7559)');
}
try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { /* \u5360\u7528\u4e0b\u6b21\u518d\u6e05 */ }
console.log(`\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 ${pass} \u901a\u8fc7 / ${fails.length} \u5931\u8d25 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
if (fails.length) { console.log('\u5931\u8d25\u9879\uff1a'); fails.forEach((x) => console.log('  - ' + x)); }
console.log('RESULT pass=' + pass + ' fail=' + fails.length);
process.exit(fails.length ? 1 : 0);
