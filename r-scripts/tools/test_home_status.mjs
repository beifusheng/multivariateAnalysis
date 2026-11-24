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
// 要拿真模板数量，所以必须走跟其它套件同一个前端加载器（避开“手写一个数”）
import { loadFrontendUtils } from './load_frontend_utils.mjs';

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
    // 能力标签（effect="plain"）：先剥注释再取，否则注释里的尖括号会把匹配带偏。
    plainTags: [...b.replace(/<!--[\s\S]*?-->/g, '')
      .matchAll(/effect="plain">\s*([^<]+?)\s*<\/el-tag>/g)].map((m) => m[1].trim()),
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

// 3c) 注释里的路由 = “还没上线”的清单。GMR⁴ 与 Bayesian ERA 先后上线后，
// 断言要么逐模块点名（上线一个就要来改一次测试，而且改测试的人很容易干脆删掉了事），
// 要么盯住真正的不变量。这里选后者：r-analysis 路由表里不该再有任何注释着的条目 ——
// 注释着的条目会让下一个人以为还有模块没做，而它实际上只是没擦干净的旧状态。
check('routerMap 里不再有任何被注释掉的 r-analysis 路由（上线了就把它那行删掉）',
  commentedRoutes.filter((x) => /r-analysis/.test(x)).length === 0,
  commentedRoutes.join(' | ') || '（干净）');

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

console.log('\n=== 3e) 卡片上的能力标签必须真有其事 ===');
{
  // 上一轮用户指出：五张卡片里只有两张带能力标签，其余三张光秃秃只有一个「可用」。
  // 只把文案补齐不够——这些标签里含**可验的数字与锦点**（25/26/6 套模板、对齐 vegan::adonis2/rda），
  // 它们会腐烂：GMR⁴ 的 rank1 模板就写着“80 样本”而 spec 其实是 40。所以标签必须能被对账。
  const counts = await loadFrontendUtils(['medTemplates', 'nonrandomTemplates', 'gmr4SheetSpec', 'eraSheetSpec']);
  // PERMANOVA 的模板住在 JSON 里（不在 utils/*Templates.js），所以直接数 JSON。
  // 这个数量以前无人对账：视图里是 32 个硬编码 loadTemplate('...') 按钮，
  // JSON 里 33 套 —— 两边靠人记，加一套漏一边都不会有人发现。
  const PM_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/src/data/permanova-templates.json'), 'utf8'));
  globalThis.__PM_IDS = null;
  const PM_IDS = PM_JSON.categories.flatMap((c) => c.templates.map((t) => t.id));
  globalThis.__PM_IDS = PM_IDS;
  const REAL_COUNT = {
    'PERMANOVA': PM_IDS.length,
    'PERMANOVA-med': counts.medTemplates.MED_TEMPLATE_COUNT,
    'Non-random PERMANOVA': counts.nonrandomTemplates.NR_TEMPLATE_COUNT,
    'GMR⁴': counts.gmr4SheetSpec.GMR4_TEMPLATE_COUNT,
    'Bayesian ERA': counts.eraSheetSpec.ERA_TEMPLATE_COUNT
  };
  // 卡片上的“对齐 X”必须能在对应验收脚本里找到 **X 本词**。
  // 上一版只问“脚本里有没有 rda/adonis2”，于是卡片改成“对齐 vegan::cca”照样绿
  // —— 那是在验脚本，不是在验卡片说的对不对。
  const ANCHOR_EVIDENCE = {
    'Non-random PERMANOVA': 'r-scripts/tools/verify_nonrandom_engine.R',
    'Bayesian ERA': 'r-scripts/tools/verify_era_engine.R',
    'GMR⁴': 'r-scripts/tools/verify_gmr4_engine.R'
  };

  // PERMANOVA 主引擎以前**根本没有尺子**，而卡片一直标着“可用”——这不是洁癖问题：
  // 用户实机报回来的误判（公式里用 Habitat 被拒，理由是“每样本一个水平”，
  // 而那一列其实只有 3 个水平）只能靠人手测发现，因为它根本没有机器在验。
  // 现在尺子逐节点名：“位置守卫换成取值守卫”这个修复一旦回退，下面直接红。
  const pmEngine = read('r-scripts/permanova.R');
  const pmRuler = read('r-scripts/tools/verify_permanova_engine.R');
  check('permanova.R 头部有 STATUS: implemented',
    /STATUS: implemented/.test(pmEngine.split('\n').slice(0, 5).join('\n')),
    pmEngine.split('\n').slice(0, 3).join(' | ').slice(0, 90));
  const PM_LOCKS = {
    '首列是否 ID 看取值不看位置': /\u770b\u53d6\u503c\u4e0d\u770b\u4f4d\u7f6e/,
    'adonis2 锚点（R² 与 F 独立算一遗）': /adonis2/,
    '演示模式虚构分组必须出声': /\u865a\u6784/,
    '行数与矩阵不符必须拒': /12 \u4e2a\u6837\u672c.*9 \u884c|9 \u884c/,
    '固定种子逐字节复现': /\u540c\u8f93\u5165\u540c\u8f93\u51fa/,
    '分项（边际）检验与 R² 相加恒等式': /per_term|\u5206\u9879/
  };
  const pmLost = Object.keys(PM_LOCKS).filter((kk) => !PM_LOCKS[kk].test(pmRuler));
  check('主引擎尺子五个章节逐点名都在（丢哪节红哪条）',
    pmLost.length === 0, `缺失：${pmLost.join(' / ') || '无'}`);
  check('引擎拒单理由里的数字来自数据本身（不是背模板句）',
    /12 个样本有 12 个不同取值/.test(pmRuler) &&
      !/\u6bcf\u4e2a\u6837\u672c\u4e00\u4e2a\u6c34\u5e73.*\u8bf7\u628a\u516c\u5f0f\u6539\u6210\u5206\u7ec4\u5217\uff08\u5982 Group\uff09/.test(pmEngine), '');
  check('主引擎输出用全精度（digits = NA）—— 否则外部核对看到的是自己的舍入',
    /auto_unbox = TRUE, pretty = TRUE, digits = NA/.test(pmEngine), '仍被截位');
  const variants = (tok) => [tok, tok.replace(/^[a-zA-Z]+::/, ''), tok.replace(/^vegan::/, '')]
    .filter((v, i, a) => v && a.indexOf(v) === i);

  // 事后检验（pairwise PERMANOVA）以前在前台用 Math.random() 造 p 并标成「校正 p 值」。
  // 它不是任何一张卡片的“主引擎”，所以单独挂一条：声明可交付就得有机器可查的尺子。
  const phEngine = read('r-scripts/permanova_posthoc.R');
  const phRuler = read('r-scripts/tools/verify_posthoc_engine.R');
  check('permanova_posthoc.R 头部有 STATUS: implemented',
    /STATUS: implemented/.test(phEngine.split('\n').slice(0, 4).join('\n')),
    phEngine.split('\n').slice(0, 3).join(' | ').slice(0, 90));
  check('事后检验的尺子存在、用 shQuote 调引擎、且有 vegan::adonis2 锚点',
    /shQuote\(engine\)/.test(phRuler) && /adonis2/.test(phRuler) &&
      /p\.adjust\([^)]*"BH"/.test(phRuler), '');
  check('尺子自己写明“前置条件不成立时必须红”（防空表通过）',
    /前置条件失败，未验证/.test(phRuler), '');
  // 数量锁：今天发生过一件事——切片时把 §5 那 8 条整段弄丢了，
  // 而同期新加的 §4b 正好也是 8 条，总数从 57 变成 65 看着反而“涨了”，跑结果全绿。
  // 所以光看汇总项数不够，必须按**具体判据关键词**点名：丢哪一节就红哪一条。
  const PH_SECTIONS = {
    '手算核对': /\u624b\u7b97\u53ef\u6838\u5bf9\u7684 pseudo_F|pseudo-F \u624b\u7b97\u6838\u5bf9/,
    'adonis2 锚点': /adonis2/,
    '零假设校准': /KS|\u5747\u5300\u5206\u5e03/,
    'p 的 +1 代数核对': /1 \+ n_ge|\(1 \+ n_ge\)|n_ge/,
    'BH 与 p.adjust 逐位': /p\.adjust\([^)]*method\s*=\s*"BH"/,
    'Bonferroni 公式': /min\(1, m\*p\)|pmin\(1,/,
    '口径切换': /primary=\$\{pm\}|primary = pm/,
    '两组时数组不降级': /\u53ea\u6709 1 \u4e2a\u5bf9\u5b50\u65f6 p_raw|\u4e0d\u8bb8\u964d\u7ea7/,
    '逐字节可复现': /\u9010\u5b57\u8282\u76f8\u540c/,
    '坏输入拒绝': /\u574f\u8f93\u5165\u5fc5\u987b\u5f53\u573a\u62d2\u7edd/
  };
  const lostSections = Object.keys(PH_SECTIONS).filter((kk) => !PH_SECTIONS[kk].test(phRuler));
  check('事后检验尺子十个章节逐点名都在（丢哪节红哪条，而不是只看总数）',
    lostSections.length === 0, `缺失：${lostSections.join(' / ') || '无'}`);
  const nOk = (phRuler.match(/\bok\(/g) || []).length;
  check('事后检验尺子的 ok() 调用数不缩水（60 条起步）',
    nOk >= 55, `实际 ${nOk}`);
  for (const c of parsed) {
    check(`${c.name}：带两个能力标签（不许只剩「可用」一个光标签）`,
      c.plainTags.length === 2, `[${c.plainTags.join(' | ')}]`);
    // 结构也要一致：上一轮顺手发现 PERMANOVA-med 连「立即使用」按钮都没有，
    // 另四张都有 —— 同一排卡片长得不一样，用户会以为它还没做完。
    check(`${c.name}：可用卡片都带「立即使用」按钮（同一排卡片不许结构不齐）`,
      !c.availTag || /立即使用/.test(c.block), c.availTag ? '标了可用却没有按钮' : 'n/a');
    const tplTag = c.plainTags.find((x) => /(\d+)\s*套设计模板/.test(x));
    if (tplTag) {
      const n = Number(/(\d+)/.exec(tplTag)[1]);
      const real = REAL_COUNT[c.name];
      check(`${c.name}：「${n} 套设计模板」必须等于 spec 真实数量`,
        real != null && n === real, `卡片写 ${n}，实际 ${real}`);
    }
    const anchorTag = c.plainTags.find((x) => /^对齐/.test(x));
    if (anchorTag) {
      const file = ANCHOR_EVIDENCE[c.name];
      const src = file ? read(file) : '';
      const toks = anchorTag.replace(/^对齐/, '').split(/[\/、,，\s]+/).filter((t) => t.length > 1);
      const found = toks.filter((tk) => variants(tk).some((v) => src.includes(v)));
      check(`${c.name}：「${anchorTag}」里说的东西必须真出现在 ${file || '（未登记）'} 里`,
        !!file && toks.length > 0 && found.length === toks.length,
        file ? `只能找到 ${found.length}/${toks.length} 个：${toks.join(' , ')}` : '没有登记的验收脚本');
    }
  }
  // 以前这条是"PERMANOVA 没有模板体系就不许写数量"。现在它确实有：
  // frontend/src/data/permanova-templates.json 里 33 套，视图里 33 个**硬编码**
  // loadTemplate('...') 按钮（没有 v-for）。两边靠人记迟早漂移，所以改成双向对账。
  const pm = parsed.find((x) => x.name === 'PERMANOVA');
  const pmTplTag = pm && pm.plainTags.find((t) => /(\d+)\s*套设计模板/.test(t));
  check('PERMANOVA 卡片现在必须写数量标签（有体系却不写 = 数字无人对账）',
    !!pmTplTag, pm ? pm.plainTags.join(' | ') : '找不到卡片');
  if (pmTplTag) {
    const n = Number(/(\d+)/.exec(pmTplTag)[1]);
    check(`PERMANOVA：「${pmTplTag}」必须等于 JSON 里的真实模板数`,
      n === PM_IDS.length, `卡片写 ${n}，JSON 有 ${PM_IDS.length}`);
  }
  // 这一节本来钉的是"两边都得有"：JSON 加了模板而视图没按钮 = 界面上点不到。
  // 后来把 33 个手写按钮换成了 v-for（JSON 成唯一来源），于是判据也要跟着换方向 ——
  // 现在钉的是**不许再出现硬编码 id**，否则漂移的可能又回来了。
  const viewSrc = read('frontend/src/views/r-analysis/PERMANOVA.vue');
  const hardIds = [...viewSrc.matchAll(/loadTemplate\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  check('PERMANOVA 模板按钮由 JSON 渲染，视图里不许再出现硬编码模板 id',
    hardIds.length === 0 && /v-for="t in cat.templates"/.test(viewSrc) &&
      /templateCats\(\)/.test(viewSrc), `硬编码 ${hardIds.length} 个：${hardIds.slice(0, 4).join(',')}`);
  check('每套模板都得有 tooltip 或 desc（悬停空白 = 用户不知道这点下去会发生什么）',
    PM_JSON.categories.flatMap((c) => c.templates)
      .every((t) => (t.tooltip && t.tooltip.length > 8) || (t.desc && t.desc.length > 8)),
    PM_JSON.categories.flatMap((c) => c.templates).filter((t) =>
      !(t.tooltip && t.tooltip.length > 8) && !(t.desc && t.desc.length > 8)).map((t) => t.id).join(','));
  // med 的 10 套是另一份 JSON（公式模板目录），同样得双向对上
  const medJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/src/data/permanova-med-templates.json'), 'utf8'));
  const medIds = medJson.categories.flatMap((c) => c.templates.map((t) => t.id));
  const medSrc = read('frontend/src/views/r-analysis/PERMANOVA_Med.vue');
  const medHard = [...medSrc.matchAll(/(?:applyTemplate|loadTemplate|selectTemplate)\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  const medNoBtn = medIds.filter((id) => !medHard.includes(id) && !new RegExp(`v-for[^>]*templates`).test(medSrc));
  check('PERMANOVA-med：JSON 里的模板在视图里可达（硬编码点名或 v-for 渲染，二选一）',
    medHard.length > 0 || /v-for[^>]*templates/.test(medSrc), `点名 ${medHard.length} 个，JSON ${medIds.length} 套`);
  check('PERMANOVA-med：点名引用的 id 必须在 JSON 里（野按钮点了填不出东西）',
    medHard.filter((id) => !medIds.includes(id)).length === 0,
    medHard.filter((id) => !medIds.includes(id)).join(','));
  // 每套模板都得能真用：三要素齐全 + 距离矩阵自洽 + 矩阵行数 == 样本数
  const all = PM_JSON.categories.flatMap((cat) => cat.templates);
  const badShape = [];
  for (const t of all) {
    const M = t.distanceMatrix, S = t.sampleData;
    if (!Array.isArray(M) || !M.length) { badShape.push(`${t.id}: 矩阵缺失`); continue; }
    if (!S || !Object.keys(S).length) { badShape.push(`${t.id}: 无样本表`); continue; }
    if (!String(t.formula || '').trim()) { badShape.push(`${t.id}: 无公式`); continue; }
    if (M.length !== M[0].length) { badShape.push(`${t.id}: 非方阵`); continue; }
    const nn = Math.max(...Object.values(S).map((v) => (v || []).length));
    if (nn !== M.length) { badShape.push(`${t.id}: 样本 ${nn} 行但矩阵 ${M.length}`); continue; }
    let asym = 0, diag = 0, neg = 0;
    for (let r = 0; r < M.length; r++) {
      if (Math.abs(M[r][r]) > 1e-9) diag++;
      for (let cc = 0; cc < M.length; cc++) {
        if (M[r][cc] == null || Number.isNaN(Number(M[r][cc]))) { asym = Infinity; break; }
        if (Math.abs(Number(M[r][cc]) - Number(M[cc][r])) > 1e-6) asym++;
        if (Number(M[r][cc]) < 0) neg++;
      }
    }
    if (asym) badShape.push(`${t.id}: 矩阵不对称/有洞`);
    if (diag) badShape.push(`${t.id}: 对角线非 0`);
    if (neg) badShape.push(`${t.id}: 有负距离`);
  }
  check('33 套模板逐个自洽（三要素齐全 + 方阵对称 + 对角为 0 + 行数与样本数一致）',
    badShape.length === 0, badShape.slice(0, 6).join(' ; '));
}



// ---------- 全局：每个 R 脚本都必须公开自己的状态 ----------
{
  const ALLOWED = ['implemented', 'library', 'partial', 'placeholder'];
  const scripts = fs.readdirSync(path.join(ROOT, 'r-scripts')).filter((f) => f.endsWith('.R'));
  const noStatus = [];
  const badStatus = [];
  for (const f of scripts) {
    const head = read(`r-scripts/${f}`).split('\n').slice(0, 8).join('\n');
    const m = /STATUS:\s*([a-z]+)/.exec(head);
    if (!m) noStatus.push(f);
    else if (!ALLOWED.includes(m[1])) badStatus.push(`${f}(${m[1]})`);
  }
  check(`每个 r-scripts/*.R 都在头部声明 STATUS（现在 ${scripts.length} 个脚本）`,
    noStatus.length === 0, `缺声明：${noStatus.join(', ')}`);
  check('STATUS 的取值只能来自白名单（自创词汇机器读不懂）',
    badStatus.length === 0, `非法取值：${badStatus.join(', ')}`);
  // 声明 implemented 就必须有尺子：这就是"可用"两个字的全部依据
  const implemented = scripts.filter((f) => /STATUS:\s*implemented/.test(read(`r-scripts/${f}`).split('\n').slice(0, 8).join('\n')));
  const unharness = implemented.filter((f) => !validatedEngines.has(f));
  check('每个声明 implemented 的引擎都被某个 harness 引用（否则"可用"没有依据）',
    unharness.length === 0, `无尺子的 implemented 引擎：${unharness.join(', ')}`);
}
console.log(`\n──────── ${pass} 通过 / ${fails.length} 失败 ────────`);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
