/**
 * 确定性伪随机数与统计小工具（共享模块）
 * ---------------------------------------------------------------
 * 演示模板必须「同一 id 每次生成完全相同的数据」，否则回归断言与用户复现都会失效，
 * 所以所有模板模块统一从这里取随机源，不各自实现。
 *
 * 注意：本文件里的实现是从 medTemplates.js 逐字抽出来的，
 * 抽出后 25 个中介模板的统计量与抽之前完全一致（verify_med_templates.mjs 25/25）。
 * 改动这里的任何数值路径都会让既有模板的标定失效，务必先跑回归。
 */

// ---------------------------------------------------------------- 伪随机数
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const rand = mulberry32(seed);
  // Box-Muller 正态
  const normal = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  // Knuth 泊松（lambda 较小，够用）
  const poisson = (lambda) => {
    const L = Math.exp(-Math.min(lambda, 30));
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rand();
    } while (p > L);
    return k - 1;
  };
  return { rand, normal, poisson };
}

const zscore = (v) => {
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1;
  return v.map((x) => (x - m) / sd);
};

const round4 = (x) => Math.round(x * 1e4) / 1e4;

export { mulberry32, makeRng, zscore, round4 };
