#!/usr/bin/env node
/**
 * Home.vue 的方法卡片状态 vs 真实代码状态 一致性检查
 *
 * 起因：Non-random PERMANOVA 已经能用（引擎 + 26 模板回归 + 界面），首页卡片却还挂着
 * "（开发中）"；反过来如果哪天把没验收的 GMR⁴ 标成"可用"，用户点了就是假结果。
 * 这类漂移靠肉眼改文案一定会再犯，所以把"卡片说什么"和"代码有什么"绑成断言。
 *
 * 用法：node r-scripts/tools/test_home_status.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0;
const fails = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (detail ? ` —— ${detail}` : '')); console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
}

// ---------- 1. 路由：真正注册了什么（注释掉的不算） ----------
const routerSrc = read('frontend/src/router/routerMap.js');
const liveRoutes = [];      // { path, view }
const commentedRoutes = []; // path
for (const line of routerSrc.split('\n')) {
  const isComment = /^\s*\/\//.test(line);
  const m = line.match(/path:\s*'(\/r-analysis\/[^']+)'/);
  if (m) { (isComment ? commentedRoutes : liveRoutes).push(m[1]); }
}
// 路由 path -> 视图文件（import 路径），只在未注释行里找
const viewByPath = {};
{
  const blocks = routerSrc.split(/\n\s*\{\s*\n/).filter((b) => !/^\s*\/\//.test(b));
  for (const b of blocks) {
    const p = b.match(/path:\s*'(\/r-analysis\/[^']+)'/);
    const v = b.match(/import\(['"]@\/views\/([^'"]+)['"]\)/);
    if (p && v) viewByPath[p[1]] = `frontend/src/views/${v[1]}`;
  }
}

// ---------- 2. 引擎脚本：存在 ≠ 验收过 ----------
const engineDir = 'r-scripts';
const harnessFiles = fs.readdirSync(path.join(ROOT, 'r-scripts/tools'))
  .filter((f) => /^(verify|test)_[a-z0-9_]+\.(R|mjs)$/.test(f));
const validatedEngines = new Set(
  harnessFiles.flatMap((f) => {
    const src = read(`r-scripts/tools/${f}`);
    // 只认字面 `r-scripts/x.R` 不够：R 里常用 file.path("r-scripts", "x.R")。
    // 上一版就因为 verify_era_engine.R 用了 file.path 写法，明明 40 项验收跑过了，
    // 首页这边却当它"没人验收过"——工具看不见自己，这类错最难发现。
    const lit = (src.match(/r-scripts\/([a-z0-9_]+\.R)/g) || []).map((x) => x.split('/')[1]);
    const joined = (src.match(/file\.path\(\s*"r-scripts"\s*,\s*"([a-z0-9_]+\.R)"/g) || [])
      .map((x) => (x.match(/"([a-z0-9_]+\.R)"/) || [])[1]);
    return [...lit, ...joined].filter(Boolean);
  })
);

// ---------- 3. Home.vue 的卡片 ----------
const home = read('frontend/src/views/Home.vue');
const cards = (home.match(/<el-card[\s\S]*?<\/el-card>/g) || []).filter((b) => /class="method-card/.test(b));
if (cards.length < 5) { console.error(`只解析到 ${cards.length} 张方法卡片，解析可能失效`); process.exit(1); }

const parsed = cards.map((b) => {
  const name = (b.match(/class="method-name">([^<]+)</) || [])[1]?.trim() || '?';
  const route = (b.match(/(?:navigateTo|\$router\.push)\(['"]([^'"]+)['"]\)/) || [])[1] || null;
  return {
    name,
    route,
    comingSoon: /showComingSoon\(/.test(b),
    availTag: /✅ 可用/.test(b),
    devTag: /🚧 开发中/.test(b),
    // 判据要打在真正生效的那一层：卡片里的 HTML 注释提到这几个字，
    // 不代表标签还在 —— 先剥注释再测（本轮就这么误报过一次）。
    algoTag: /算法未验收/.test(b.replace(/<!--[\s\S]*?-->/g, '')),
    block: b
  };
});

console.log(`\n解析到 ${parsed.length} 张卡片、${liveRoutes.length} 条 r-analysis 路由\n`);

// 3a) 每张卡片：状态标签与点击行为必须一致
for (const c of parsed) {
  check(`${c.name}：可用/开发中标签二选一`, c.availTag !== c.devTag, `avail=${c.availTag} dev=${c.devTag}`);
  check(`${c.name}：标「可用」就必须有注册路由和视图文件`, !c.availTag || (!!c.route && liveRoutes.includes(c.route) && !!viewByPath[c.route] && fs.existsSync(path.join(ROOT, viewByPath[c.route]))),
    `route=${c.route}`);
  check(`${c.name}：标「开发中」就不能点到界面`, !c.devTag || (c.comingSoon && !c.route));
}

// 3b) 反向：已注册的路由不能在家目录里缺席，也不能还挂着「开发中」
for (const r of liveRoutes) {
  const hit = parsed.find((c) => c.route === r);
  check(`路由 ${r} 在首页有对应卡片`, !!hit);
  if (hit) check(`卡片「${hit.name}」没有误标开发中`, !hit.devTag);
}

// 3c) 注释掉的路由（GMR⁴ / Bayesian ERA）说明它们确实还没上线，首页不得出现同名可用卡片
// GMR⁴ 今天上线了，所以这条不能再写死 >=2：
// 断言要盯着"还剩哪个没上线"，而不是"注释有几条"，否则上线一个就要来改一次测试。
check('Bayesian ERA 仍留在 routerMap 注释里（还没上线）', /bayesian-era/.test(commentedRoutes.join('|')),
  commentedRoutes.join(','));
check('gmr4 不再以注释形式留在路由表里（已上线就不该两头都占着）',
  !/gmr4/.test(commentedRoutes.join('|')), commentedRoutes.join(','));

/** 从 Home.vue 的 showComingSoon 映射里取某个模块的"缺什么"说明 */
function homeTipOf(name) {
  // 不用 new RegExp 拼字符串：拼进字符串里的 \s 会被 JS 自己先吐掉（变成 s），
  // 正则当场失效而匹配不到 -> 返回空串 -> 两条断言一起红，看起来像“说明写错了”。
  const key = "'" + name + "'";
  // 必须从 showComingSoon 之后再找：'GMR⁴' 这个键在文件里更早就出现过（卡片标题），
  // 不划范围就会拿到那之后的第一个引号串（实测抓到 @element-plus/icons-vue）。
  // 锚点要用 detail 那张表本身：showComingSoon 在模板里就被调用过
  // （@click="showComingSoon('GMR⁴')"），从它开始找会先命中那里，
  // 于是取到的"说明"其实是下一个引号串（实测拿到 @element-plus/icons-vue）。
  const from = home.indexOf('const detail = {');
  const at = home.indexOf(key, from);
  if (at < 0) return '';
  const colon = home.indexOf(':', at + key.length);
  const q1 = home.indexOf("'", colon + 1);
  const q2 = home.indexOf("'", q1 + 1);
  return q1 > colon && q2 > q1 ? home.slice(q1 + 1, q2) : '';
}

// 3d) 「算法未验收」标签必须真的对应有待办的引擎
const gmr = parsed.find((c) => c.name.startsWith('GMR'));
const era = parsed.find((c) => c.name.startsWith('Bayesian'));
for (const [c, script] of [[gmr, 'gmr4.R'], [era, 'bayesian_era_mediation.R']]) {
  if (!c) continue;
  const exists = fs.existsSync(path.join(ROOT, engineDir, script));
  // "脚本存在 => 必须标开发中"是错的规则：脚本早就存在，能不能上线取决于
  // 它是否只是占位、以及有没有界面。GMR⁴ 上线时这条会把红打得像回归被破坏。
  const engSrc = exists ? read(path.join(engineDir, script)) : '';
  const st = (/#\s*STATUS:\s*(implemented|placeholder)/i.exec(engSrc) || [])[1];
  // STATUS 说的是**引擎**，卡片能不能点说的是**界面**。上一版把两者绑成一条断言
  // （implemented 就必须可用），于是“引擎刚验收完、界面还没写”这个中间状态无处表达：
  // 要么骗用户说界面可用（点进去白屏），要么逼着把 STATUS 退回 placeholder
  // （把已经跑通的验收说成没做）。现在拆开：可用性 ⇔ 视图存在；标签/说明 ⇔ STATUS。
  // 视图文件名跟 routerMap 里注释的那条保持一致（Bayesian_ERA.vue，不是 BayesianERA.vue）：
  // 上一版这里写的是另一个名字，真建了视图它还会报“视图缺失”。
  const viewFile = path.join(ROOT, 'frontend/src/views/r-analysis',
    script === 'gmr4.R' ? 'GMR4.vue' : 'Bayesian_ERA.vue');
  const hasView = fs.existsSync(viewFile);
  check(`${c.name}：卡片可用性只跟界面存在一致（hasView=${hasView}）`,
    hasView ? !c.devTag : c.devTag, `devTag=${c.devTag}, hasView=${hasView}`);
  check(`${c.name}：「算法未验收」标签必须与引擎状态一致（STATUS=${st}）`,
    st === 'implemented' ? !c.algoTag : c.algoTag,
    `algoTag=${c.algoTag}, STATUS=${st} —— 引擎已过验收还挂着这个标签就是对外报假信息`);
  if (validatedEngines.has(script)) {
    // 缺什么的说明写在 Home.vue 的 showComingSoon 里，不是卡片字段：
    // 那里若还留着“简化/占位/未验收”，就是过时说明（用户会以为引擎也没做）。
    const tip = homeTipOf(c.name);
    // 卡片已经可用时 showComingSoon 里那条说明就是死代码，文案断言只对仍在开发中的卡片生效
    if (c.devTag) {
      check(`${c.name}：引擎已验收后，弹窗说明不能再写"简化占位/未验收"`,
        !!tip && !/简化|占位|未验收|需根据论文完善/.test(tip), tip.slice(0, 90));
      check(`${c.name}：弹窗说明必须点出真正缺的那一件（界面/路由）`,
        /界面|路由/.test(tip), tip.slice(0, 90));
    } else {
      check(`${c.name}：已上线 -> comingSoon 的 detail 表里不应再留它的条目`,
        !home.slice(home.indexOf("const detail = {")).match(new RegExp("'" + c.name + "'\s*:")),
        "卡片可点了还留着“开发中说明”，下一个人会以为还有两条实现路径");
    }
  } else {
    // 这条曾经是 check(..., true) —— 一张恒真绿卡，摆在那儿什么也不拦。
    // 现在真去扫 harness：确实没人引用，才允许以"未验收"为由标开发中。
    const refs = harnessFiles.filter((f) => read(`r-scripts/tools/${f}`).includes(script));
    check(`${c.name}：${script} 未被任何验收 harness 引用 -> 才能以"未验收"为由标开发中`,
      refs.length === 0 && c.devTag,
      refs.length ? `其实被引用于：${refs.join(', ')}（那就不能算未验收）` : `devTag=${c.devTag}`);
  }
  // 脚本若自称简化实现，卡片就不许标“可用”；反之若已去掉占位注释，就该重新跑验收
  if (exists) {
    const src = read(path.join(engineDir, script));
    // 判据必须是机器可读的状态行，不能 grep 注释里的词：
    // 我重写 gmr4.R 时在文件头写了"旧版是简化版占位"的历史说明，
    // 于是这条检测被**自己的注释**误触发，结论恰好对、理由完全错。
    const m = /#\s*STATUS:\s*(implemented|placeholder)/i.exec(src);
    if (!m) {
      check(`${c.name}：${script} 必须有 STATUS: implemented|placeholder 状态行`, false,
        '没有状态行就不该由散文推断实现进度');
    }
    const stub = !m || /placeholder/i.test(m[1]);
    check(`${c.name}：${script} ${stub ? '是占位实现 -> 卡片必须「开发中」' : '已无占位标记 -> 该重新验收了'}`,
      stub ? c.devTag : true, `stub=${stub}, devTag=${c.devTag}`);
  }
}

console.log(`\n──────── ${pass} 通过 / ${fails.length} 失败 ────────`);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
