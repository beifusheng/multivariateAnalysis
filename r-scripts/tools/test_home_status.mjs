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
const validatedEngines = new Set(
  fs.readdirSync(path.join(ROOT, 'r-scripts/tools'))
    .filter((f) => /^verify_[a-z0-9_]+_(engine|templates)\.(R|mjs)$/.test(f))
    .map((f) => {
      const src = read(`r-scripts/tools/${f}`);
      return (src.match(/r-scripts\/([a-z0-9_]+\.R)/g) || []).map((x) => x.split('/')[1])[0];
    })
    .filter(Boolean)
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
check('未注册路由仍留在 routerMap 注释里（GMR⁴ / Bayesian ERA）', commentedRoutes.length >= 2,
  `只找到 ${commentedRoutes.length} 条注释路由`);

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
  check(`${c.name}：脚本存在性(${script}) 与「开发中」自述一致`, exists ? c.devTag : true);
  // 引擎是否已验收，与"能不能上线"是两回事。GMR4 今天把这一点顶出来了：
  // 引擎重写并通过 16 项验收，但 frontend/src/views/r-analysis/GMR4.vue 根本不存在，
  // 所以卡片必须仍然「开发中」——只是理由要从"算法未验收"换成"没有界面"。
  const viewFile = path.join(ROOT, 'frontend/src/views/r-analysis',
    script === 'gmr4.R' ? 'GMR4.vue' : 'BayesianERA.vue');
  const hasView = fs.existsSync(viewFile);
  if (validatedEngines.has(script)) {
    check(`${c.name}：引擎已验收但视图缺失 -> 卡片必须仍标开发中（否则点进去白屏）`,
      !hasView ? c.devTag : true, `hasView=${hasView}, devTag=${c.devTag}`);
    // 缺什么的说明写在 Home.vue 的 showComingSoon 里，不是卡片字段：
    // 那里若还留着"简化占位/未验收"，就是过时说明（用户会以为引擎也没做）。
    const tip = homeTipOf(c.name);
    check(`${c.name}：引擎已验收后，弹窗说明不能再写"简化占位/未验收"`,
      !!tip && !/简化|占位|未验收|需根据论文完善/.test(tip), tip.slice(0, 90));
    check(`${c.name}：弹窗说明必须点出真正缺的那一件（界面/路由）`,
      /界面|路由/.test(tip), tip.slice(0, 90));
  } else {
    check(`${c.name}：${script} 未被任何验收 harness 引用 -> 才能以"未验收"为由标开发中`, true);
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
