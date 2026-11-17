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

// 3d) 「算法未验收」标签必须真的对应有待办的引擎
const gmr = parsed.find((c) => c.name.startsWith('GMR'));
const era = parsed.find((c) => c.name.startsWith('Bayesian'));
for (const [c, script] of [[gmr, 'gmr4.R'], [era, 'bayesian_era_mediation.R']]) {
  if (!c) continue;
  const exists = fs.existsSync(path.join(ROOT, engineDir, script));
  check(`${c.name}：脚本存在性(${script}) 与「开发中」自述一致`, exists ? c.devTag : true);
  check(`${c.name}：${script} 未被任何验收 harness 引用 -> 才能标未验收`, !validatedEngines.has(script) || !c.devTag,
    `${script} 已被 verify_* 引用，卡片还标开发中`);
  // 脚本若自称简化实现，卡片就不许标“可用”；反之若已去掉占位注释，就该重新跑验收
  if (exists) {
    const src = read(path.join(engineDir, script));
    const stub = /简化版|需根据论文完善|待完善|TODO/.test(src);
    check(`${c.name}：${script} ${stub ? '是占位实现 -> 卡片必须「开发中」' : '已无占位标记 -> 该重新验收了'}`,
      stub ? c.devTag : true, `stub=${stub}, devTag=${c.devTag}`);
  }
}

console.log(`\n──────── ${pass} 通过 / ${fails.length} 失败 ────────`);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
