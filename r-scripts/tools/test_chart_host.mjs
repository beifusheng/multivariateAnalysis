#!/usr/bin/env node
/**
 * chartHost.js 回归：「初次分析图表不画、切 tab 才画」这一类 bug 的守门人
 * ---------------------------------------------------------------
 * 旧代码在三处各写过 `if (!el) return;`：DOM 只晚一帧到，就永久静默不画。
 * 这里不需要浏览器：nextTick 用微任务模拟，echarts 用注入的假模块。
 *   node r-scripts/tools/test_chart_host.mjs
 */
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(import.meta.dirname, '../..');
const mod = await import(pathToFileURL(path.join(ROOT, 'frontend/src/utils/chartHost.js')).href);
const { hostWhenReady, drawWhenReady } = mod;

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (detail ? ` —— ${detail}` : '')); console.log('  ✗ ' + name + (detail ? `\n      ${detail}` : '')); }
};
// 微任务版 nextTick：真实 Vue 也是 microtask，语义对齐
const nextTick = (cb) => Promise.resolve().then(cb);
const fakeEcharts = (calls) => ({
  getInstanceByDom: (el) => calls.byDom.get(el) || null,
  init: (el) => {
    const inst = { setOption: (o, rep) => calls.setOption.push({ o, rep }), resize: () => calls.resize++ };
    calls.byDom.set(el, inst);
    return inst;
  }
});

console.log('\n=== 1. 容器晚到几帧也要画出来 ===');
{
  let n = 0;
  const r = await hostWhenReady(() => (n++ >= 2 ? { tag: 'el' } : null), nextTick);
  check('第 3 帧拿到容器', r.el && r.el.tag === 'el', JSON.stringify(r));
  check('等到的帧数被记下来（提示文案要用）', r.waited === 2, String(r.waited));
}
{
  const r = await hostWhenReady(() => null, nextTick);
  check('试满有界重试后承认拿不到（不会无限等）', r.el === null && r.waited === 3, JSON.stringify(r));
}
{
  const r = await hostWhenReady(() => ({ tag: 'ok' }), nextTick);
  check('容器已存在时不等任何帧', r.el && r.waited === 0);
}
{
  const r = await hostWhenReady(() => { throw new Error('getHost 自己炸了'); }, nextTick);
  check('getHost 抛异常时不炸穿渲染链路', r.el === null && r.waited === 3, JSON.stringify(r));
}

console.log('\n=== 2. drawWhenReady：真正下单给 ECharts ===');
{
  const calls = { byDom: new Map(), setOption: [], resize: 0 };
  let n = 0;
  const r = await drawWhenReady({
    getHost: () => (n++ >= 1 ? { tag: 'div' } : null),
    nextTick,
    option: { xAxis: {}, series: [{ type: 'bar' }] },
    importEcharts: async () => fakeEcharts(calls)
  });
  check('晚一帧也能画成', r.ok === true, JSON.stringify(r));
  check('setOption 收到真实 option', calls.setOption.length === 1 && calls.setOption[0].o.series[0].type === 'bar');
  check('setOption 第二参数是 replace（旧图元必须清掉）', calls.setOption[0].rep === true, String(calls.setOption[0].rep));
  check('立即调了一次 resize（之后还有一次补的，见第 4 段）', calls.resize >= 1, String(calls.resize));
}
{
  const calls = { byDom: new Map(), setOption: [], resize: 0 };
  const r = await drawWhenReady({
    getHost: () => null, nextTick, option: { series: [] },
    importEcharts: async () => fakeEcharts(calls)
  });
  check('拿不到容器 -> ok:false 且 reason=no-host', r.ok === false && r.reason === 'no-host', JSON.stringify(r));
  check('拿不到容器时绝不 import echarts', calls.setOption.length === 0 && calls.resize === 0);
}
{
  const calls = { byDom: new Map(), setOption: [], resize: 0 };
  const r = await drawWhenReady({
    getHost: () => ({ tag: 'div' }), nextTick, option: null,
    importEcharts: async () => fakeEcharts(calls)
  });
  check('没有 option -> reason=no-option（跟"容器没就绪"区分开）', r.ok === false && r.reason === 'no-option', JSON.stringify(r));
}
{
  const calls = { byDom: new Map(), setOption: [], resize: 0 };
  const el = { tag: 'div' };
  await drawWhenReady({ getHost: () => el, nextTick, option: { a: 1 }, importEcharts: async () => fakeEcharts(calls) });
  const r2 = await drawWhenReady({ getHost: () => el, nextTick, option: { a: 2 }, importEcharts: async () => fakeEcharts(calls) });
  check('第二次复用同一实例（不重复 init）', calls.byDom.size === 1 && calls.setOption.length === 2 && r2.ok === true);
  check('第二次拿到的是更新后的 option', calls.setOption[1].o.a === 2, JSON.stringify(calls.setOption[1]));
}

console.log('\n=== 3. 三个视图都得走这条路（不许再各写各的 if (!el) return）===');
{
  const fs = await import('node:fs');
  const views = {
    Nonrandom_PERMANOVA: 'renderChart',
    PERMANOVA_Med: 'renderCurrentChart',
    PERMANOVA: 'renderCurrentChart'
  };
  // 先刮掉注释：解释旧代码的注释里就写着 `if (!el) return;`，不刮会误判成没修
  const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [f, fn] of Object.entries(views)) {
    const src = fs.readFileSync(path.join(ROOT, 'frontend/src/views/r-analysis', f + '.vue'), 'utf8');
    check(`${f} 引入了 chartHost`, /utils\/chartHost/.test(src));
    const code = noComments(src);
    // 函数体：从方法名开始，到下一个 4 空格缩进的方法头为止（别拿隔居方法的代码算在头上）
    const i = code.search(new RegExp('^    (async )?' + fn + '\\(', 'm'));
    const rest = code.slice(i);
    const nxt = rest.slice(4).search(/^    (async )?[A-Za-z_$][\w$]*\(/m);
    const body = nxt > 0 ? rest.slice(0, nxt + 4) : rest;
    check(`${f}.${fn} 不再静默 return 空容器`,
      !/if \(!el[^)]*\)\s*return;/.test(body) && !/Container not found/.test(body), body.slice(0, 50));
    check(`${f}.${fn} 有「等几帧」的出口`, /hostWhenReady|drawWhenReady/.test(body), body.slice(0, 50).replace(/\s+/g, ' '));
    check(`${f}.${fn} 拿不到容器时会告诉用户（不是沉默）`,
      /no-host|warning/.test(body), body.slice(0, 60).replace(/\s+/g, ' '));
  }
}

console.log('\n=== 4. 容器存但量不出尺寸（ECharts 不报错，只画个看不见的空图）===');
{
  const zero = { clientWidth: 0, clientHeight: 0 };
  const r = await hostWhenReady(() => zero, nextTick);
  check('0 宽/0 高 当“没就绪”，不直接把 echarts 送上去坑用户',
    r.el === null && r.zeroSized === true, JSON.stringify(r));

  // 晚几帧尺寸才出来（真实的布局晚到场景）
  let n = 0;
  const grow = () => {
    n++;
    return n >= 2 ? { clientWidth: 920, clientHeight: 520 } : { clientWidth: 0, clientHeight: 0 };
  };
  const calls = { byDom: new Map(), setOption: [], resize: 0 };
  const rr = await drawWhenReady({
    getHost: grow, nextTick, option: { series: [] }, importEcharts: async () => fakeEcharts(calls)
  });
  check('布局晚到几帧后仍然画成（等得到尺寸才 init）', rr.ok === true && rr.waited >= 1, JSON.stringify(rr));

  // 拿不到尺寸时的回报形式必须是 zero-size，而不是混在 no-host 里
  const calls2 = { byDom: new Map(), setOption: [], resize: 0 };
  const rz = await drawWhenReady({
    getHost: () => ({ clientWidth: 0, clientHeight: 520 }), nextTick,
    option: { series: [] }, importEcharts: async () => fakeEcharts(calls2)
  });
  check('始终 0 宽 -> reason=zero-size（与 no-host 区分）',
    rz.ok === false && rz.reason === 'zero-size', JSON.stringify(rz));
  check('量不出尺寸时不白跑一次 import echarts', calls2.setOption.length === 0);

  // setOption 后量到宽度 0：要把它报成 empty，让视图能提醒（以前是“ok:true + 屏幕空白”）
  const flat = { byDom: new Map(), setOption: [], resize: 0, width: 0 };
  const fakeZeroChart = {
    setOption() { flat.setOption.push(1); }, resize() { flat.resize++; }, getWidth: () => flat.width
  };
  flat.width = 0;
  const re = await drawWhenReady({
    // 有 clientWidth 但 echarts 自己量到 0：两层都要查
    getHost: () => ({ clientWidth: 600, clientHeight: 520 }), nextTick, option: { series: [] },
    importEcharts: async () => ({ getInstanceByDom: () => fakeZeroChart, init: () => fakeZeroChart })
  });
  check('echarts 宽度为 0 时返回 empty:true（视图据此提醒）',
    re.ok === true && re.empty === true && re.width === 0, JSON.stringify(re));

  // 没有尺寸属性的对象（SSR / 测试替身）不该被当成 0 尺寸
  const nc = { byDom: new Map(), setOption: [], resize: 0 };
  const rn = await drawWhenReady({
    getHost: () => ({ tag: 'div' }), nextTick, option: { series: [] }, importEcharts: async () => fakeEcharts(nc)
  });
  check('无尺寸属性的容器照旧能画（不把 SSR/测试误退化成永远不就绪）',
    rn.ok === true && nc.setOption.length === 1, JSON.stringify(rn));

  check('setOption 后安排了一次补 resize（布局晚到的保险）', nc.resize >= 2, String(nc.resize));
}

console.log('\n=== 5. 三个视图都必须“数据驱动重画”，不能只赌那一帧 ===');
{
  const fs = await import('node:fs');
  const want = {
    Nonrandom_PERMANOVA: ['chartData() {', 'renderChart'],
    PERMANOVA_Med: ['chartData() {', 'renderCurrentChart'],
    PERMANOVA: ['analysisResult(v) {', 'renderCurrentChart']
  };
  for (const [f, [watchKey, fn]] of Object.entries(want)) {
    const src = fs.readFileSync(path.join(ROOT, 'frontend/src/views/r-analysis', f + '.vue'), 'utf8');
    const wm = src.match(/watch: \{[\s\S]*?\n  \},/);
    check(`${f} 有 watch 块`, !!wm, (wm || ['(无)'])[0].slice(0, 40));
    check(`${f} 监听数据本身（${watchKey}）而不是只靠 run 里一次性 nextTick`,
      !!wm && wm[0].includes(watchKey) && wm[0].includes(fn), (wm || [''])[0].replace(/\s+/g, ' ').slice(0, 90));
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check(`${f} 宽度为 0 时会告诉用户`, /getWidth|empty/.test(code), '');
  }
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
process.exit(fails.length ? 1 : 0);
