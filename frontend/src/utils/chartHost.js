/**
 * 图表容器就绪等待（三个分析界面共用）
 * ---------------------------------------------------------------
 * 症状：「初次分析时图表没绘制，切换图表类型才画出来」。用户已经报了两次。
 * 两类原因都会导致它，而且都不在 ECharts 里：
 *   1) 结果区是 `v-if="analysisResult"` 刚出现的，同一帧里 DOM 可能还没挂载；
 *   2) DOM 挂上了但**量不出尺寸**（0 宽/0 高）——ECharts 对这种情况不报错，
 *      只是 init 出一个空图，等下一次 resize()（例如切 tab）才补上，看起来就是“没画”。
 * 旧代码三份 `renderChart` 都写着 `if (!el) return;`：静默放弃，之后再没第二次机会。
 *
 * 这里把「等一下再看一次」变成显式、有界、可测的行为：
 *   - 拿到可测量的容器：resolve({ el, waited })
 *   - 试满仍不行：resolve({ el: null, waited, zeroSized })，由调用方决定说什么
 * 不用 requestAnimationFrame：$nextTick 在 Node（harness）里也能跑，rAF 不行。
 */

/**
 * 尺寸量不出来就算没就绪。
 * 注意：没有 clientWidth/clientHeight 属性的对象（SSR、测试里的替身）不参与该判断，
 * 否则会把“根本没有布局环境”误判成“永远不就绪”。
 */
function isZeroSized(el) {
  return typeof el.clientWidth === 'number' && typeof el.clientHeight === 'number' &&
    (el.clientWidth === 0 || el.clientHeight === 0);
}

/**
 * @param {() => any} getHost              取 DOM 容器（每轮重新取，别缓存）
 * @param {(cb: Function) => void} nextTick Vue 的 this.$nextTick
 * @param {{ attempts?: number }} [opts]    最多重试几帧
 */
export function hostWhenReady(getHost, nextTick, opts = {}) {
  const attempts = opts.attempts ?? 3;
  let waited = 0;
  return new Promise((resolve) => {
    const step = () => {
      let el = null;
      try {
        el = getHost() || null;
      } catch (e) {
        el = null;              // getHost 自己炸了也算「还没就绪」，不要把渲染链路打挂
      }
      if (el && !isZeroSized(el)) return resolve({ el, waited });
      if (waited >= attempts) return resolve({ el: null, waited, zeroSized: !!el });
      waited += 1;
      nextTick(step);
    };
    step();
  });
}

/**
 * 三个视图共用的画图入口：等容器 -> import echarts -> setOption -> resize。
 * 抽出来的理由：三份 renderXxx 各写各的，同一个时序 bug 修了 A 忘了 B。
 *
 * @param {object} p
 * @param {() => any} p.getHost
 * @param {(cb: Function) => void} p.nextTick
 * @param {object} p.option                 已经算好的 ECharts option
 * @param {(name: string) => Promise<any>} [p.importEcharts]  便于测试注入
 */
export async function drawWhenReady(p) {
  const { getHost, nextTick, option } = p;
  const importEcharts = p.importEcharts || (() => import('echarts'));
  const { el, waited, zeroSized } = await hostWhenReady(getHost, nextTick, p);
  if (!el) return { ok: false, reason: zeroSized ? 'zero-size' : 'no-host', waited };
  if (!option) return { ok: false, reason: 'no-option', waited };
  const echarts = await importEcharts();
  const chart = echarts.getInstanceByDom(el) || echarts.init(el);
  chart.setOption(option, true);
  chart.resize();
  // 布局本身也可能晚到（滚动、折叠展开、字体回流）：下一帧再 resize 一次兜住
  if (typeof nextTick === 'function') {
    nextTick(() => { try { chart.resize(); } catch (e) { /* 组件已销毁就算了 */ } });
  }
  // 自己量一下：init 在 0 尺寸容器上不会报错，只会画个看不见的空图。
  // 不检查的话用户看到的就是“空白但什么提示也没有”，这跟静默 return 同罪。
  let width = null;
  try {
    width = typeof chart.getWidth === 'function' ? chart.getWidth() : null;
  } catch (e) {
    width = null;
  }
  return { ok: true, waited, width, empty: width === 0 };
}
