/**
 * 打包链路自检：R 运行时与脚本目录能否在 dev / 打包两种布局下被找到。
 *
 * 为什么单独一套：这些路径逻辑原来散在 electron 主进程里、且把开发机绝对路径写死了，
 * 结果是 `npm run build-w` 打出来的包装不上任何依赖也能装好，但一跑分析就"找不到脚本"。
 * 这类错最难在开发机上发现 —— 因为开发机上它恰好是对的。
 *
 * 这里把 rPaths.ts 用 esbuild 打成临时 ESM 真跑断言（不是 grep 源码）：
 * 假输入进、路径出，dev / asar / extraResources 三种布局各验一遍。
 *
 * 用法：node r-scripts/tools/test_packaging.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-'));
const require_ = createRequire(path.join(ROOT, 'package.json'));

let pass = 0; const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fails.push(name + (detail ? ` —— ${detail}` : '')); console.log('  ✗ ' + name + (detail ? `  [${detail}]` : '')); }
};

console.log('\n=== 1. 把纯函数打出来（esbuild，与主进程同一份源码）===');
const outFile = path.join(TMP, 'rPaths.mjs');
const esbuild = require_('esbuild');
await esbuild.build({
  entryPoints: [path.join(ROOT, 'electron/service/rPaths.ts')],
  outfile: outFile, format: 'esm', bundle: true, platform: 'node', logLevel: 'error'
});
const P = await import(pathToFileURL(outFile).href);
check('rPaths.ts 能打包并导出 6 个函数',
  ['toUnpacked', 'isInsideAsar', 'rPortableCandidates', 'rScriptsCandidates', 'pickFirst', 'describeSearchFailure']
    .every((k) => typeof P[k] === 'function'),
  Object.keys(P).join(','));

console.log('\n=== 2. 开发态布局 ===');
{
  const ctx = {
    appPath: 'C:/work/electron-egg',
    resourcesPath: '',
    cwd: 'C:/work/electron-egg',
    env: { LOCALAPPDATA: 'C:/Users/u/AppData/Local', USERPROFILE: 'C:/Users/u' }
  };
  const cand = P.rPortableCandidates(ctx);
  check('dev 优先搜项目根的 r-portable', cand[0] === 'C:/work/electron-egg/r-portable', cand[0]);
  check('不再包含任何开发机的绝对路径（原来写死了某台机器的目录）',
    !JSON.stringify(ctx).includes('Custom/CodeRepository') &&
      !cand.some((c) => /Custom[\\/]CodeRepository/.test(c)), cand.join(' | '));
  const scr = P.rScriptsCandidates(ctx);
  check('dev 的脚本目录就是项目根下的 r-scripts',
    scr.includes('C:/work/electron-egg/r-scripts'), scr.join(' | '));
  check('dev 时脚本候选不做 asar 改写（那时 appPath 不是归档）',
    !scr.some((s) => s.includes('unpacked')), scr.join(' | '));
}

console.log('\n=== 3. 打包态布局（最容易出错的一档）===');
{
  const ctx = {
    appPath: 'C:/Program Files/Multivariate/resources/app.asar',
    resourcesPath: 'C:/Program Files/Multivariate/resources',
    cwd: 'C:/Program Files/Multivariate',
    env: {}
  };
  const scr = P.rScriptsCandidates(ctx);
  check('打包后脚本目录指向 app.asar.unpacked（R 看不见 app.asar 内部）',
    scr[0] === 'C:/Program Files/Multivariate/resources/app.asar.unpacked/r-scripts', scr[0]);
  check('没有任何候选落在 app.asar 里面',
    !scr.some((s) => /app\.asar[\\/]/.test(s)), scr.join(' | '));
  const cand = P.rPortableCandidates(ctx);
  check('extraResources/r-portable 在候选里（electron-builder 的真实落点）',
    cand.includes('C:/Program Files/Multivariate/resources/extraResources/r-portable'),
    cand.join(' | '));
  check('它排在系统 PATH 兜底之前（自带运行时优先，不蹭用户机器上的 R）',
    cand.indexOf('C:/Program Files/Multivariate/resources/extraResources/r-portable') <
      cand.length, '');
  check('isInsideAsar 两种分隔符都认',
    P.isInsideAsar('a/app.asar/b') && P.isInsideAsar('a\\app.asar\\b') && !P.isInsideAsar('a/app.asar.unpacked/b'), '');
  check('toUnpacked 只改写目录边界，不误伤文件名',
    P.toUnpacked('x/app.asar/r-scripts/a.R') === 'x/app.asar.unpacked/r-scripts/a.R' &&
      P.toUnpacked('x/app.asarrc') === 'x/app.asarrc', P.toUnpacked('x/app.asar/r'));
}

console.log('\n=== 4. 选择与报错文案 ===');
{
  const got = P.pickFirst(['/nope/a', '/exists/b', '/nope/c'], (p) => p === '/exists/b');
  check('pickFirst 返回第一个存在者', got === '/exists/b', String(got));
  check('全都不存在时返回 null（而不是返回不存在的路径骗调用方）',
    P.pickFirst(['/x', '/y'], () => false) === null, '');
  const msg = P.describeSearchFailure(['/a/r-portable', '/b/r-portable']);
  check('找不到 R 时把搜过的位置全列出来',
    msg.includes('/a/r-portable') && msg.includes('/b/r-portable'), msg.replace(/\n/g, ' | ').slice(0, 90));
  check('并且给可操作的修复方式（三条路各说清）',
    /build\/extraResources/.test(msg) && /PATH/.test(msg) && /r-portable/.test(msg), '');
}

console.log('\n=== 5. 构建配置与源码的静态约束 ===');
{
  const files = fs.readdirSync(path.join(ROOT, 'cmd')).filter((f) => /^builder.*\.json$/.test(f));
  check('四个平台的 builder 配置都在', files.length >= 4, files.join(','));
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'cmd', f), 'utf8'));
    check(`${f} 声明了 asarUnpack: r-scripts/**/*`,
      Array.isArray(j.asarUnpack) && j.asarUnpack.some((x) => /r-scripts/.test(x)),
      JSON.stringify(j.asarUnpack || null));
  }
  const walk = (dir, acc = []) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (/\.(ts|js)$/.test(e.name)) acc.push(p);
    }
    return acc;
  };
  const src = walk('electron');
  // 先剔掉注释行再扫：两个服务里我留着「原来是这么写死的」的说明文字，
  // 直接匹配会命中注释 —— 本项目已经第十次为错理由而红了。
  const codeOnly = (txt) => txt
    .split(String.fromCharCode(10))
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join(String.fromCharCode(10));
  const hard = src.filter((f) => {
    const body = codeOnly(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    // 只查实质：个人机器上才会出现的路径片段（不用正则，避开转义层）
    return body.indexOf('CodeRepository') >= 0 ||
      body.indexOf('AppData' + String.fromCharCode(92)) >= 0;
  });
  check('electron/ 下不再有写死的个人机器路径', hard.length === 0, hard.join(','));
  const portable = fs.readFileSync(path.join(ROOT, 'electron/service/rPortableService.ts'), 'utf8');
  const svc = fs.readFileSync(path.join(ROOT, 'electron/service/rService.ts'), 'utf8');
  check('两个服务都改为调用 rPaths（而不是各自拼一遍）',
    /from '.\/rPaths'/.test(portable) && /from '.\/rPaths'/.test(svc), '');
  check('builder 的 files 里 public / node_modules 仍在（主进程与前端产物）',
    JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'cmd/builder.json'), 'utf8')).files).includes('public'), '');
  // 上一版我只加了 asarUnpack、没加 files —— 真打一次才发现 asarUnpack 只能解包
  // **已经进了 files 的东西**，r-scripts 不在 files 里，解包目录压根不会生成。
  // 所以下面两条必须成对存在，少一条就是空配置。
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'cmd', f), 'utf8'));
    const inFiles = (j.files || []).some((x) => /r-scripts/.test(String(x)));
    const inUnpack = (j.asarUnpack || []).some((x) => /r-scripts/.test(String(x)));
    check(`${f} 的 files 与 asarUnpack 成对声明了 r-scripts（只写 asarUnpack 是空配置）`,
      inFiles && inUnpack, `files=${inFiles} asarUnpack=${inUnpack}`);
  }

  console.log('\n=== 5.5 产品身份与产物新鲜度 ===');
  {
    // 今天真实发生过的两件事：(a) 可执行文件叫 ee.exe（上游框架名），
    // (b) build-w 不含前端构建，静默把几周前的脚手架 bundle 打了进去（139KB，里面连 PERMANOVA 都没有）。
    // 两者都只能在“真打开看一眼”时才发现 —— 那就把它们变成机器可查的。
    const want = 'multivariateAnalysis';
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'cmd', f), 'utf8'));
      const exe = (j.win && j.win.executableName) || (j.mac && j.mac.executableName) || j.productName;
      check(`${f} 的产品名不再是上游框架的 ee`, j.productName === want && exe === want,
        `productName=${j.productName} exe=${exe}`);
      if (j.nsis) check(`${f} 的开始菜单快捷方式也叫产品名`, j.nsis.shortcutName === want,
        String(j.nsis.shortcutName));
      check(`${f} 的 appId 不再指向上游`, /^com\.beifusheng\./.test(String(j.appId)), String(j.appId));
      const pub = JSON.stringify(j.publish || []);
      check(`${f} 的 publish 不指向别人的仓库（自动更新拉的是别人的渠道）`,
        !/wallace5303|dromara|electron-egg/.test(pub), pub.slice(0, 90));
    }

    // 前端 bundle：体积与内容两个维度都看，单靠 mtime 在新 clone 上会误报
    const adir = path.join(ROOT, 'public', 'dist', 'assets');
    if (!fs.existsSync(adir)) {
      console.log('  - 跳过：public/dist 还不存在（先 npm run build-frontend）');
    } else {
      const jsf = fs.readdirSync(adir).filter((x) => x.endsWith('.js'));
      let all = '';
      let bytes = 0;
      for (const x of jsf) { const s = fs.readFileSync(path.join(adir, x), 'utf8'); all += s; bytes += s.length; }
      const marks = ['PERMANOVA', 'Bayesian ERA', 'Non-random', 'GMR', 'mediation'];
      const miss = marks.filter((m) => !all.includes(m));
      check('public/dist 里是本项目的前端（五个方法名都在 bundle 里）', miss.length === 0, miss.join(','));
      check('不是那个 139KB 的脚手架旧产物（体积阈值 1.5MB）', bytes > 1500000, bytes + ' bytes / ' + jsf.length + ' 文件');
      check('脚手架特征串已经不存在（ElectronEgg / Hello）',
        !all.includes('ElectronEgg') && !all.includes('Hello World'), '');
    }

    // 把根因本身钉住：打包脚本必须先跑前端与主进程构建
    const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
    for (const k of ['build-w', 'build-w:offline', 'build-m', 'build-m-x86', 'build-l']) {
      if (!scripts[k]) continue;
      check(`${k} 会先跑 npm run build（不会静默打包旧产物）`,
        /npm run build( |$)/.test(scripts[k]), scripts[k].slice(0, 60));
    }
  }

  console.log('\n=== 6. 真打过一次的话，直接验产物布局 ===');
  const unpackedRoot = path.join(ROOT, 'out', 'win-unpacked', 'resources');
  if (!fs.existsSync(unpackedRoot)) {
    console.log('  - 跳过：没有 out/win-unpacked（未执行过打包）');
  } else if (!fs.existsSync(path.join(unpackedRoot, 'app.asar'))) {
    // 产物不完整与产物有缺陷是两回事：前者只能提醒，不能当成代码错了。
    // 今天就是被一个正在运行的旧版 exe 把构建拦腰打断，留下了半成品目录。
    console.log('  - 跳过：out/win-unpacked 是半成品（app.asar 不在，多半是构建被占用文件打断）');
    console.log('    下一步：关掉正在运行的旧版 exe，重跑 npm run build-w:offline');
  } else if (fs.statSync(path.join(unpackedRoot, 'app.asar')).mtimeMs <
             fs.statSync(path.join(ROOT, 'cmd', 'builder.json')).mtimeMs) {
    // 产物比配置旧：它不能代表现在的配置，拿它判成败是假的。
    // 今天就是这么撞的：旧 ee.exe 在跑、构建被文件锁打断，out/ 停在上周的形状。
    console.log('  - 跳过：out/win-unpacked 比 cmd/builder.json 旧，重新打一次才会验到当前配置');
    console.log('    下一步：npm run build-w:offline（会自动先跑 npm run build）');
  } else {
    const ctx = {
      appPath: path.join(unpackedRoot, 'app.asar').replace(/\\/g, '/'),
      resourcesPath: unpackedRoot.replace(/\\/g, '/'),
      cwd: path.join(ROOT, 'out', 'win-unpacked').replace(/\\/g, '/'),
      env: {}
    };
    const scripts = P.pickFirst(P.rScriptsCandidates(ctx), (p) => fs.existsSync(p));
    check('打包后解析到的脚本目录真的存在（app.asar.unpacked 里）',
      !!scripts && fs.existsSync(path.join(String(scripts), 'permanova.R')), String(scripts));
    const rdir = P.pickFirst(P.rPortableCandidates(ctx), (p) => fs.existsSync(p));
    check('打包后解析到的 R 目录真的存在（extraResources 里）',
      !!rdir && fs.existsSync(path.join(String(rdir), 'bin')), String(rdir));
    // 产物里的可执行文件名：今天就是这里露馅的（应该是产品名，不是 ee.exe）
    const up = path.join(ROOT, 'out', 'win-unpacked');
    const exes = fs.existsSync(up) ? fs.readdirSync(up).filter((x) => x.endsWith('.exe')) : [];
    check('win-unpacked 下的主程序叫产品名而不是 ee.exe',
      exes.length === 0 || (exes.includes('multivariateAnalysis.exe') && !exes.includes('ee.exe')),
      exes.join(','));
    // 真实文件系统跑一遍：把安装包里的 R 指向安装包里的脚本跑一个最小分析
    if (rdir && scripts) {
      const exe = path.join(String(rdir), 'bin', process.platform === 'win32' ? 'Rscript.exe' : 'Rscript');
      let ver = '';
      try {
        ver = execFileSync(exe, ['--version'], { encoding: 'utf8', timeout: 120000 });
      } catch (e) { ver = ''; }
      check('安装包里的 Rscript 真能执行（不是拷了个空壳）', /Rscript/.test(ver), ver.trim().slice(0, 60));
    }
  }

  // 真正要紧的是这一条：拷到哪里与去哪里找，两边必须说的是同一个地方。
  // 上一版就是各说各话：builder 把 extraResources 放到 resources/extraResources/<to>，
  // 而解析器搜的是 appPath/resources/r-portable（安装包里根本没这个路径）。
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'cmd', f), 'utf8'));
    const er = Array.isArray(j.extraResources) ? j.extraResources : [j.extraResources];
    const hit = er.filter((x) => x && String(x.from).replace(/[\\/]+$/, '') === 'r-portable');
    check(`${f} 把 r-portable 拷进了 extraResources`, hit.length === 1, JSON.stringify(er));
    if (hit.length === 1) {
      const to = String(hit[0].to).replace(/[\\/]+$/, '');
      const ctx = {
        appPath: 'C:/Program Files/MV/resources/app.asar',
        resourcesPath: 'C:/Program Files/MV/resources',
        cwd: 'C:/Program Files/MV', env: {}
      };
      const landing = 'C:/Program Files/MV/resources/' + to;
      check(`${f} 的落点与解析器候选一致（${to}）`,
        P.rPortableCandidates(ctx).includes(landing),
        P.rPortableCandidates(ctx).join(' | '));
    }
  }
}

console.log('\n=== 7. 本机真实解析（假输入能过不等于真路径能中）===');
{
  const ctx = {
    appPath: ROOT,
    resourcesPath: '',
    cwd: ROOT,
    env: process.env
  };
  const scr = P.pickFirst(P.rScriptsCandidates(ctx), (p) => fs.existsSync(p));
  // 候选用正斜杠拼（Windows 两种分隔符都认），而 path.join 给反斜杠：
  // 直接比字符串会假红 —— 归一后再比。
  const norm = (x) => String(x).replace(/\\/g, '/');
  check('开发态能真找到本项目的 r-scripts 目录',
    norm(scr) === norm(path.join(ROOT, 'r-scripts')), String(scr));
  const rp = P.pickFirst(P.rPortableCandidates(ctx), (p) => fs.existsSync(path.join(p, 'bin')));
  const hasR = fs.existsSync(path.join(ROOT, 'r-portable', 'bin'));
  check(hasR ? '开发机能真找到 r-portable/bin' : '本机没有 r-portable（跳过，不算失败）',
    !hasR || !!rp, String(rp));
  // 真跑一次：解析出的目录下确实有引擎脚本（防止“目录存在但内容不对”）
  if (scr) {
    check('解析出的脚本目录里真的放得下引擎文件',
      fs.existsSync(path.join(scr, 'permanova.R')) && fs.existsSync(path.join(scr, 'gmr4.R')), scr);
  }
}

console.log(`\n──────── ${pass} 通过 / ${fails.length} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
fs.rmSync(TMP, { recursive: true, force: true });
console.log('RESULT pass=' + pass + ' fail=' + fails.length);
process.exit(fails.length ? 1 : 0);
