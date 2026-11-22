#!/usr/bin/env node
/**
 * MCMC 诊断（尺子）冒烟：把 R 侧的 verify_era_engine.R 接进 node 套件循环
 * ---------------------------------------------------------------
 *   node r-scripts/tools/test_era_diagnostics.mjs
 *
 * 为什么需要这一层：`verify_*.R` 在本仓库里**没有任何自动入口**，只能手跑。
 * 项目已经因为这个吃过一次（7740c80：两条运行时冒烟一直在空转，
 * 全绿是"没人跑"换来的）。尺子如果坏在抽屉里，比没有尺子更危险 ——
 * 它会稳定地输出"看起来通过"的结论。
 *
 * 所以这里断言的不是统计量本身（那是 R 侧 16 项的职责），而是三件更容易坏的事：
 *   1) 脚本还在、还能起跑（Rscript 找得到、路径对）；
 *   2) 它真的跑完了并且自己报 PASS，**还报了项数**；
 *   3) 项数不许悄悄变少（有人删测试也能全绿，那次的教训就是"绿得越少越好看"）。
 */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const RSCRIPT = process.env.RSCRIPT || path.join(ROOT, 'r-portable/bin/Rscript.exe');
const VERIFY = path.join('r-scripts', 'tools', 'verify_era_engine.R');
// 尺子自检 16 项（T1–T16）+ 引擎验收 24 项（E1–E24）。
// 故意写死：R 侧加/删测试时这里必须跟着改，否则“悄悄少跑了一段”没人发现。
const EXPECT_TESTS = 40;

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (detail ? ` —— ${detail}` : '')); console.log(`  ✗ ${name}\n      ${String(detail).slice(0, 300)}`); }
};

console.log('\n=== 尺子（mcmc_diagnostics.R）的自动运行入口 ===');
{
  check(`验收脚本存在（${VERIFY}）`, fs.existsSync(path.join(ROOT, VERIFY)), '文件不在，R 侧 16 项等于没跑');
  check('诊断实现文件存在（引擎与本脚本共用同一份）',
    fs.existsSync(path.join(ROOT, 'r-scripts/mcmc_diagnostics.R')), '');
  check('Rscript 可用', fs.existsSync(RSCRIPT), RSCRIPT);

  let out = '', code = 0;
  try {
    out = execFileSync(RSCRIPT, [VERIFY], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 600000 });
  } catch (e) {
    code = (e && e.status) || 1;
    out = String((e && e.stdout) || '') + String((e && e.stderr) || '') + String((e && e.message) || '');
  }
  check('R 侧 verify_era_engine.R exit=0', code === 0, `exit=${code}\n${out.slice(-400)}`);

  const m = /\[PASS\] (\d+) 项全过/.exec(out);
  check('R 侧自己报了 PASS 且带项数（"跑完了"不等于"跑对了"）', !!m, out.slice(-300));
  const n = m ? Number(m[1]) : 0;
  check(`项数 = ${EXPECT_TESTS}（不许悄悄减少：删测试也能全绿的那种事发生过）`,
    n === EXPECT_TESTS, n ? `实得 ${n} 项` : '没解析到项数');

  // 尺子的三类判据必须都在：干净不许红 / 脏了必须红 / 报警能定位。
  // 少任何一类，坏尺子就能从中间溜过去（本轮 rowMeans 版就是靠"只有单向阈值"活下来的）
  check('含"干净时不许红"的断言（iid R̂ 区间）', /iid \u94fe\u7684 split-R/.test(out), '');
  check('含"脏了必须红"的断言（链间分离 / 随机游走）',
    /\u9010\u94fe\u504f\u79fb/.test(out) && /\u968f\u673a\u6e38\u8d70/.test(out), '');
  check('含"报警能定位到具体那一列"的断言', /\u53ea\u6709\u7b2c 3 \u5217\u810f/.test(out), '');
  check('含"报错文案必须出自我们"的断言（NA 守卫）',
    /\u77e9\u9635\u542b NA/.test(out) && /\u5411\u91cf\u7248\u540c\u7406/.test(out), '');
  // 引擎那 24 项不能因为一个 if 跳过就“也算全绿”：三句必须真的出现在输出里
  check('引擎验收段真的跑了（契约 / 恒等式 / 外部锚点 / 退化形状）',
    /\u5f15\u64ce\uff1a\u6b63\u5e38\u8def\u5f84\u4e0e\u8f93\u51fa\u5951\u7ea6/.test(out) &&
      /E6 \u6052\u7b49\u5f0f/.test(out) &&
      /vegan::rda \u7ea6\u675f\u60ef\u91cf\u6bd4\u4e00\u81f4/.test(out) &&
      /E15 p=k=q=1 \u9000\u5316\u5f62\u72b6/.test(out),
    'R 侧输出里没有引擎段——多半是 b$code != 0 把整段 if 跳过了');
  check('报错拦截段真的跑了（NA / 样本数 / 行数 / 缺 M / 常量列）',
    /E16 \u542b NA/.test(out) && /E19 \u6ca1\u6709\u4e2d\u4ecb\u8868/.test(out) &&
      /E20 \u5e38\u91cf\u5217/.test(out), '');
  check('高维实测行在（默认迭代数必须有实测依据，不许口头保证）',
    /\u9ad8\u7ef4\u5b9e\u6d4b\uff1a\u7528\u65f6/.test(out), '');

  /* 引擎进度跟尺子分开报：上一版我把两件事塞进一条断言，结果 Rscript 语法报错时
     这条也跟着红 —— 一个报两件事的断言只会让人花时间去猜到底是哪件坏了。*/
  const eng = fs.readFileSync(path.join(ROOT, 'r-scripts/bayesian_era_mediation.R'), 'utf8');
  const engHead = eng.split('\n')[0] || '';
  const implemented = /STATUS: implemented/.test(engHead);
  check('R 侧必须打印引擎状态行（不许静默跳过还没验收的部分）',
    /\u5f15\u64ce\u72b6\u6001/.test(out), '输出里没有引擎状态');
  check('STATUS 与验收进度一致：标了 implemented 就必须有恒等式/锚点段',
    !implemented || /\u6052\u7b49\u5f0f/.test(out),
    `引擎首行是 implemented，但 R 侧只跑了尺子自检 —— 要么补上 §2，要么把 STATUS 改回 placeholder`);
  if (!implemented) {
    check('引擎仍是 placeholder（尺子先行的预期状态）', /placeholder/.test(engHead), engHead);
  }
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
process.exit(fail ? 1 : 0);
