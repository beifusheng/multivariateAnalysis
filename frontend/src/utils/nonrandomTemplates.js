/**
 * Non-random PERMANOVA（受限/分层/空间置换）演示模板
 * ---------------------------------------------------------------------------
 * 与 medTemplates.js 同一套路：文件里只存「实验设计规格」，数据由确定性伪随机
 * 生成器在运行时合成 —— 同一 id 每次生成完全相同的数据，p 值可复现。
 *
 * 这些模板的教学重点是「置换方案会改变结论」：
 *   标准 PERMANOVA 的零假设是样本可以任意乱序。当采样设计本身有结构
 *   （批次 / 站点 / 时间层 / 空间邻近）时，任意乱序会造出一个现实中不存在的
 *   零分布，p 值偏乐观。受限置换只在设计允许的范围内交换标签。
 * 因此每个 spec 都带 expect：{ free, constrained } = 'sig' | 'ns'，
 * 由 r-scripts/tools/verify_nonrandom_templates.mjs 实跑 R 逐条断言。
 *
 * 三种典型形态：
 *   both sig    —— 组间差异是真的，换哪种置换都拦不住
 *   free sig / constrained ns —— 先前的显著性来自分层结构（假阳性，最该演示的一类）
 *   both ns     —— 本来就没差异，受限置换不会凭空造出显著
 *
 * 角色约定（喂给 r-scripts/nonrandom_permanova.R）：
 *   communityData  样本 × 物种（非负计数；presenceAbsence 时会被二值化）
 *   sampleData     行对象数组 [{sample, group, strata, ...}]
 *   formula        固定效应右侧式，如 "group" 或 "group + phase"
 *   strata         分层变量名（scheme=stratified 时在其内部交换）
 *   coordinates    [[x,y],...]（scheme=spatial 时用于定义邻域）
 */

import { makeRng, zscore } from './rng.js';

// ---------------------------------------------------------------- 设计要素

/**
 * 生成分组标签。
 * confound ∈ [0,1]：0 = 组别与区组完全平衡；1 = 区组几乎决定组别
 * （这正是「自由置换显著、受限置换不显著」的结构性前提）
 */
function assignGroups(n, strataVec, groups, confound, rand) {
  if (!confound || confound <= 0) {
    // 平衡且不相关：按组循环铺满后再洗牌
    const base = Array.from({ length: n }, (_, i) => groups[i % groups.length]);
    return shuffle(base, rand);
  }
  const S = Math.max(...Array.from(new Set(strataVec)), 0);
  const nBlocks = S + 1;
  const out = new Array(n);
  for (let b = 0; b < nBlocks; b++) {
    const idx = [];
    for (let i = 0; i < n; i++) if (strataVec[i] === b) idx.push(i);
    // 该区组的倾向：把区组归一化到 [-0.5, 0.5]，乘以 confound 得到偏向第一组的幅度
    const skew = nBlocks > 1 ? (b / (nBlocks - 1) - 0.5) * 2 : 0;   // -1..1
    const pFirst = Math.min(0.98, Math.max(0.02, 0.5 + skew * confound * 0.48));
    for (const i of idx) {
      const r = rand();
      if (r < pFirst) out[i] = groups[0];
      else out[i] = groups[1 + Math.floor(rand() * (groups.length - 1))];
    }
  }
  return out;
}

/** 与分组正交（或轻微共线）的第二因素，例如采样时段 */
function assignPhase(n, groups, groupVec, phaseLevels, weakConfound, rand) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const gi = groups.indexOf(groupVec[i]);
    const bias = weakConfound ? gi * 0.15 * weakConfound : 0;
    const k = Math.floor(rand() * phaseLevels.length);
    out[i] = phaseLevels[Math.min(phaseLevels.length - 1, Math.max(0, k + Math.round(bias)))];
  }
  return out;
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 空间坐标：把区组摆在互相远离的斑块上，邻域限定后自然等价于「区组内交换」 */
function makeCoordinates(n, strataVec, nBlocks, spread, rand) {
  const out = new Array(n);
  const side = Math.ceil(Math.sqrt(nBlocks));
  for (let i = 0; i < n; i++) {
    const b = strataVec[i];
    const bx = (b % side) * spread;
    const by = Math.floor(b / side) * spread;
    out[i] = [
      Math.round((bx + rand() * spread * 0.55) * 1000) / 1000,
      Math.round((by + rand() * spread * 0.55) * 1000) / 1000
    ];
  }
  return out;
}

// ---------------------------------------------------------------- 数据合成

/**
 * 按规格合成一份 Non-random PERMANOVA 输入
 * @param {object} spec 模板规格
 * @returns {object} 可直接作为 IPC params 的 payload + 供 UI 展示的 summary
 */
export function buildNonrandomTemplateData(spec) {
  const n = Math.max(24, Math.min(spec.n || 60, 180));
  const taxa = spec.taxa || 40;
  const groups = spec.groups || ['Control', 'Treatment'];
  const { rand, poisson } = makeRng(spec.seed || 1);

  // ---- 区组（strata）----
  const nBlocks = spec.strata || 0;
  const strataVec = new Array(n);
  if (nBlocks > 0) {
    const per = Math.floor(n / nBlocks);
    for (let i = 0; i < n; i++) strataVec[i] = Math.min(nBlocks - 1, Math.floor(i / per));
  }

  // ---- 分组 ----
  const groupVec = assignGroups(n, nBlocks ? strataVec : new Array(n).fill(0), groups, spec.confound || 0, rand);

  // ---- 第二因素（可选）----
  const phaseVec = spec.phase
    ? assignPhase(n, groups, groupVec, spec.phase.levels, spec.phase.confound || 0, rand)
    : null;

  // ---- 测序深度：区组/样本层面差异，用来演示 controlCoverage ----
  const depth = new Array(n);
  const covSpread = spec.coverageSpread || 0;
  for (let i = 0; i < n; i++) {
    const b = nBlocks ? strataVec[i] : 0;
    const blockFactor = 1 + covSpread * ((b % 2 === 0 ? 1 : -1) * 0.9 * Math.min(1, covSpread > 0 ? 1 : 0));
    depth[i] = Math.max(0.2, blockFactor * Math.exp((rand() - 0.5) * covSpread));
  }

  // ---- 物种矩阵 ----
  // 组间真信号：前 groupTaxa 个物种按组偏移；区组干扰：紧接的 strataTaxa 个物种按区组偏移
  const gOffsets = spec.groupOffsets || [0, 3];
  const sOffsets = spec.strataOffsets || null;
  const base = spec.baseLambda || 5;
  const nGroupTaxa = spec.groupTaxa || 4;
  const nStrataTaxa = spec.strataTaxa || 6;

  const comm = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(taxa);
    const gi = groups.indexOf(groupVec[i]);
    const b = nBlocks ? strataVec[i] : 0;
    for (let t = 0; t < taxa; t++) {
      let lam;
      if (t < nGroupTaxa && spec.groupBase != null) {
        // 检出频率型效应：低基线 + 组间抬升，二值化（Jaccard / 存在缺失）后仍能看清
        lam = spec.groupBase + (gOffsets[gi % gOffsets.length] || 0);
      } else {
        lam = base * (t < 6 ? 2.2 : t < 14 ? 1.2 : 0.6);   // 丰度长尾，更像真实 OTU 表
        if (t < nGroupTaxa) lam += gOffsets[gi % gOffsets.length] || 0;
      }
      if (sOffsets && t >= nGroupTaxa && t < nGroupTaxa + nStrataTaxa) {
        lam += sOffsets[b % sOffsets.length] || 0;
      }
      if (phaseVec && t >= nGroupTaxa + nStrataTaxa && t < nGroupTaxa + nStrataTaxa + (spec.phase.taxa || 3)) {
        lam += spec.phase.effect * phaseVec[i].slice(-1);       // 用 P1/P2 的尾字符做弱梯度
      }
      lam = Math.max(0.05, lam * depth[i]);
      row[t] = poisson(lam);
    }
    comm.push(row);
  }

  const matrixCols = (m) => {
    const cols = {};
    for (let t = 0; t < taxa; t++) cols[(spec.taxonPrefix || 'OTU') + (t + 1)] = m.map((r) => r[t]);
    return cols;
  };

  const sampleData = [];
  for (let i = 0; i < n; i++) {
    const row = {
      sample: (spec.samplePrefix || 'S') + (i + 1),
      group: groupVec[i]
    };
    if (nBlocks) row.strata = 'B' + (strataVec[i] + 1);
    if (phaseVec) row.phase = phaseVec[i];
    if (spec.numericCovariate) {
      // 连续协变量：与区组相关，检验「连续变量不被误当因子」
      row[spec.numericCovariate.name] = Math.round(((nBlocks ? strataVec[i] : 0) * 0.8 + rand() * 2) * 100) / 100;
    }
    sampleData.push(row);
  }

  const formula = spec.formula || 'group';
  const scheme = spec.scheme || (nBlocks ? 'stratified' : 'free');
  const coordinates = scheme === 'spatial'
    ? makeCoordinates(n, strataVec, Math.max(1, nBlocks), spec.spatialSpread || 40, rand)
    : null;

  const payload = {
    communityData: comm,
    sampleData,
    formula,
    strata: nBlocks > 0 ? 'strata' : undefined,
    scheme,
    coordinates,
    spatialBand: spec.spatialBand,
    distance: spec.distance || 'bray',
    presenceAbsence: !!spec.presenceAbsence,
    controlCoverage: !!spec.controlCoverage,
    permutations: spec.permutations || 999,
    seed: spec.rng || 12345,
    // 空间/分层方案下若区组过小会被丢弃，这里保留给 UI 提示
    _blocks: nBlocks
  };

  const designDesc = [
    groups.length + ' 组 × ' + n + ' 样本',
    nBlocks ? nBlocks + ' 个区组' : '无区组',
    spec.confound ? '分组与区组混淆度 ' + Math.round(spec.confound * 100) + '%' : '分组与区组平衡',
    spec.distance && spec.distance !== 'bray' ? spec.distance.toUpperCase() + ' 距离' : 'Bray-Curtis 距离',
    spec.presenceAbsence ? '存在/缺失' : '',
    spec.controlCoverage ? '含测序深度校正' : '',
    scheme === 'spatial' ? '空间邻域受限' : ''
  ].filter(Boolean).join('，');

  return {
    payload,
    n,
    taxa,
    scheme,
    design: designDesc,
    expect: spec.expect || null,
    note: spec.note || '',
    // 供 UI 直接展示的前几列
    previewColumns: {
      group: groupVec,
      strata: nBlocks ? strataVec.map((b) => 'B' + (b + 1)) : null,
      phase: phaseVec,
      depth: depth.map((d) => Math.round(d * 100) / 100)
    },
    matrixCols: matrixCols(comm)
  };
}

// ---------------------------------------------------------------- 模板清单
// 每条 expect 都被 verify_nonrandom_templates.mjs 实跑断言，改数值必须重跑。
export const NR_TEMPLATE_GROUPS = [
  {
    id: 'teaching',
    name: '🎓 教学：置换方案为什么会改变结论',
    items: [
      {
        id: 'confoundedBlock', icon: '🚧', label: '批次混淆 → 自由置换假阳性',
        tip: 'B1 几乎全是处理组、B3 几乎全是对照组，真实效应只在批次上。自由置换 p 很小，受限置换 p 很大',
        spec: { n: 90, taxa: 30, seed: 5150, groups: ['A', 'B'], strata: 3, confound: 1.0,
          groupOffsets: [0, 0], groupTaxa: 0, strataOffsets: [8, 4, 0], strataTaxa: 13,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'ns' },
          note: '这是最该给学生看的一个：同一份数据、同一个 F，换零分布就换结论' }
      },
      {
        id: 'balancedBlock', icon: '⚖️', label: '平衡区组设计（真效应）',
        tip: '组别与区组正交，真组间效应存在，两种置换方案都显著',
        spec: { n: 72, taxa: 36, seed: 2101, groups: ['Control', 'Treatment'], strata: 4, confound: 0,
          groupOffsets: [0, 5], groupTaxa: 6, strataOffsets: [4, -4, 2, -2], strataTaxa: 8,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' },
          note: '设计良好的区组实验：受限置换只是把结论变得可信，而不是变严' }
      },
      {
        id: 'noSignal', icon: '🌫️', label: '只有区组噪声，无组间差异',
        tip: '分组平衡且无真效应，两种方案都不显著（检验没有虚警）',
        spec: { n: 66, taxa: 32, seed: 3301, groups: ['A', 'B'], strata: 3, confound: 0,
          groupOffsets: [0, 0], groupTaxa: 0, strataOffsets: [5, -5, 0], strataTaxa: 9,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'ns', constrained: 'ns' },
          note: '对照组：证明前面那个假阳性不是脚本乱给 p' }
      },
      {
        id: 'spatialField', icon: '🗺️', label: '空间自相关：邻域内交换',
        tip: '样方按斑块分布，邻近样方更相似；用坐标定义邻域做受限置换',
        spec: { n: 80, taxa: 28, seed: 4402, groups: ['Upstream', 'Downstream'], strata: 4, confound: 0.95,
          groupOffsets: [0, 0], groupTaxa: 0, strataOffsets: [7, 3, -3, -7], strataTaxa: 10,
          scheme: 'spatial', spatialSpread: 50, permutations: 999,
          expect: { free: 'sig', constrained: 'ns' },
          note: '空间版本的上一个案例：显著性来自空间结构而非处理' }
      }
    ]
  },
  {
    id: 'envBatch',
    name: '🏭 批次与站点（环境与工业）',
    items: [
      {
        id: 'wwtpMonths', icon: '🚰', label: '污水处理厂 × 月份',
        tip: '同一批反应器跨月采样，月份是强区组；比较进出水菌群',
        spec: { n: 72, taxa: 48, seed: 501, groups: ['Influent', 'Effluent'], strata: 6, confound: 0,
          groupOffsets: [0, 4], groupTaxa: 7, strataOffsets: [5, 3, 1, -1, -3, -5], strataTaxa: 10,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' } }
      },
      {
        id: 'soilSites', icon: '🌱', label: '多站点土壤 pH 梯度',
        tip: '5 个站点各自有群落基线；站点内比较施肥处理',
        spec: { n: 80, taxa: 44, seed: 502, groups: ['Control', 'NPK'], strata: 5, confound: 0.35,
          groupOffsets: [0, 6], groupTaxa: 9, strataOffsets: [6, 2, 0, -2, -6], strataTaxa: 12,
          numericCovariate: { name: 'pH' }, formula: 'group',
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' },
          note: 'pH 只作为连续列展示：本模块的距离基 F 只支持因子项，连续协变量会被 R 脚本明确拒绍（而不是给你一个看不懂的数）' }
      },
      {
        id: 'fermentBatches', icon: '🍶', label: '发酵批次（弱效应）',
        tip: '批次差异远大于菌剂差异，容易读出假阳性',
        spec: { n: 60, taxa: 30, seed: 503, groups: ['S', 'L'], strata: 4, confound: 0.85,
          groupOffsets: [0, 1.2], groupTaxa: 3, strataOffsets: [7, 4, -4, -7], strataTaxa: 9,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'ns' } }
      },
      {
        id: 'extractionKit', icon: '🧫', label: 'DNA 提取试剂盒偏倚',
        tip: '试剂盒批次与处理组部分重合，考察方法学偏倚是否制造假显著',
        spec: { n: 64, taxa: 34, seed: 504, groups: ['KitA-Proc1', 'KitA-Proc2'], strata: 4, confound: 0.9,
          groupOffsets: [0, 1.0], groupTaxa: 3, strataOffsets: [6, 3, -3, -6], strataTaxa: 10,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'ns' } }
      },
      {
        id: 'airSeason', icon: '🌬️', label: '城市空气微生物 × 季节',
        tip: '季节是强区组，比较交通路口与公园',
        spec: { n: 72, taxa: 36, seed: 505, groups: ['Roadside', 'Park'], strata: 4, confound: 0.5,
          groupOffsets: [0, 5], groupTaxa: 6, strataOffsets: [5, 1, -1, -5], strataTaxa: 9,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' } }
      }
    ]
  },
  {
    id: 'cohort',
    name: '🏥 人群队列与多中心',
    items: [
      {
        id: 'multicenterDiet', icon: '🍽️', label: '多中心饮食干预',
        tip: '3 个中心各自建库深度不同；中心内比较高低纤维',
        spec: { n: 96, taxa: 40, seed: 601, groups: ['HighFiber', 'LowFiber'], strata: 3, confound: 0.2,
          groupOffsets: [0, 4.5], groupTaxa: 7, strataOffsets: [4, 0, -4], strataTaxa: 8,
          coverageSpread: 0.3, controlCoverage: true,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' },
          note: '测序深度差异用 controlCoverage 校正，而不是 rarefaction 丢弃数据' }
      },
      {
        id: 'icuWard', icon: '🛏️', label: 'ICU 病房聚集',
        tip: '同病房患者菌群高度相似；比较两种抗生素方案',
        spec: { n: 60, taxa: 32, seed: 602, groups: ['Mero', 'Pipe'], strata: 5, confound: 0.95,
          groupOffsets: [0, 0.8], groupTaxa: 3, strataOffsets: [6, 3, 0, -3, -6], strataTaxa: 10,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'ns' } }
      },
      {
        id: 'birthCohort', icon: '👶', label: '分娩方式 × 出生队列',
        tip: '队列（年份批次）差异大，比较剖宫产与顺产婴儿肠道菌群',
        spec: { n: 84, taxa: 38, seed: 603, groups: ['CS', 'VB'], strata: 6, confound: 0.6,
          groupOffsets: [0, 2.6], groupTaxa: 5, strataOffsets: [5, 3, 1, -1, -3, -5], strataTaxa: 9,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' } }
      },
      {
        id: 'transplantCenters', icon: '🫀', label: '移植多中心（弱组效应）',
        tip: '中心效应主导，处理效应微弱 —— 受限置换下不再显著',
        spec: { n: 72, taxa: 36, seed: 604, groups: ['FMT', 'Std'], strata: 4, confound: 0.9,
          groupOffsets: [0, 1.1], groupTaxa: 3, strataOffsets: [7, 3, -3, -7], strataTaxa: 11,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'ns' } }
      },
      {
        id: 'twinsSite', icon: '🧬', label: '双生子 × 采血批次',
        tip: '同批次样本处理条件一致；比较胖瘦对（存在/缺失矩阵）',
        spec: { n: 66, taxa: 40, seed: 605, groups: ['LeanTwin', 'FatTwin'], strata: 3, confound: 0.3,
          groupOffsets: [0, 2.5], groupTaxa: 12, groupBase: 0.5, strataOffsets: [0.6, 0.2, -0.3], strataTaxa: 8,
          presenceAbsence: true, distance: 'jaccard',
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' },
          note: 'Jaccard + 存在/缺失：把基线压低，组间差异体现在「能不能检出」而不是多多少少' }
      }
    ]
  },
  {
    id: 'agri',
    name: '🌾 农业与食品体系',
    items: [
      {
        id: 'varietyPlots', icon: '🚜', label: '品种 × 地块（裂区设计）',
        tip: '地块是天然区组；品种内比较根际菌群',
        spec: { n: 80, taxa: 42, seed: 701, groups: ['Var-A', 'Var-B'], strata: 8, confound: 0.1,
          groupOffsets: [0, 3.2], groupTaxa: 6, strataOffsets: [4, 2, 0, -2, -4, 1, -1, 3], strataTaxa: 10,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' } }
      },
      {
        id: 'storageTemp', icon: '❄️', label: '储藏温度 × 货架批次',
        tip: '批次时间效应强；比较 4℃ 与 25℃ 的菌群演替',
        spec: { n: 64, taxa: 30, seed: 702, groups: ['4C', '25C'], strata: 4, confound: 0.85,
          groupOffsets: [0, 1.3], groupTaxa: 3, strataOffsets: [6, 2, -2, -6], strataTaxa: 9,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'ns' } }
      },
      {
        id: 'manureRate', icon: '💩', label: '施肥量三水平 × 田块',
        tip: '三组比较（0/90/180 kg N），区组内做多重梯度',
        spec: { n: 90, taxa: 40, seed: 703, groups: ['N0', 'N90', 'N180'], strata: 3, confound: 0.25,
          groupOffsets: [-2, 0, 3], groupTaxa: 7, strataOffsets: [5, 0, -5], strataTaxa: 10,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' },
          note: '三水平组别：df=2，F 的自由度会随置换方案一致' }
      },
      {
        id: 'silagePhase', icon: '🌿', label: '青贮发酵双因素',
        tip: '添加剂 + 发酵时段（phase）同时进入公式',
        spec: { n: 96, taxa: 36, seed: 704, groups: ['None', 'LAB'], strata: 4, confound: 0.1,
          groupOffsets: [0, 3], groupTaxa: 6, strataOffsets: [4, 1, -1, -4], strataTaxa: 8,
          phase: { levels: ['P1', 'P2', 'P3'], effect: 1.5, taxa: 4, confound: 0.4 },
          formula: 'group + phase', scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' } }
      }
    ]
  },
  {
    id: 'aquatic',
    name: '🌊 水体与海洋',
    items: [
      {
        id: 'cruiseStations', icon: '🚢', label: '航次 × 站位',
        tip: '站位差异是主要结构来源；比较表层与深层',
        spec: { n: 84, taxa: 46, seed: 801, groups: ['Surface', 'Deep'], strata: 7, confound: 0.3,
          groupOffsets: [0, 4.2], groupTaxa: 8, strataOffsets: [4, 2, 1, 0, -1, -2, -4], strataTaxa: 12,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' } }
      },
      {
        id: 'estuaryTransect', icon: '🏞️', label: '河口盐度梯度（空间受限）',
        tip: '沿河口的连续空间自相关，用坐标邻域限制置换',
        spec: { n: 72, taxa: 34, seed: 802, groups: ['Brackish', 'Fresh'], strata: 4, confound: 0.9,
          groupOffsets: [0, 0.9], groupTaxa: 3, strataOffsets: [6, 2, -2, -6], strataTaxa: 9,
          scheme: 'spatial', spatialSpread: 45, permutations: 999,
          expect: { free: 'sig', constrained: 'ns' } }
      },
      {
        id: 'coralTransect', icon: '🪸', label: '珊瑚礁样带（健康 vs 白化）',
        tip: '多条样带各自成区组；比较共生菌群',
        spec: { n: 78, taxa: 40, seed: 803, groups: ['Healthy', 'Bleached'], strata: 6, confound: 0.45,
          groupOffsets: [0, 3.4], groupTaxa: 7, strataOffsets: [5, 3, 0, -3, -5, 2], strataTaxa: 10,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' } }
      },
      {
        id: 'lakeDepth', icon: '🏔️', label: '湖泊深度带 × 季节（双因素）',
        tip: '深度带与季节都进公式，季节是区组',
        spec: { n: 96, taxa: 38, seed: 804, groups: ['Epilimnion', 'Hypolimnion'], strata: 4, confound: 0.15,
          groupOffsets: [0, 3.8], groupTaxa: 7, strataOffsets: [4, 2, -2, -4], strataTaxa: 9,
          phase: { levels: ['P1', 'P2'], effect: 1.2, taxa: 3 },
          formula: 'group + phase', scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' } }
      }
    ]
  },
  {
    id: 'robustness',
    name: '🔬 方法与稳健性（边界条件）',
    items: [
      {
        id: 'tinyBlocks', icon: '🧩', label: '大量二样本微区组',
        tip: '每个区组只有 2 个样本：可交换空间极小，检验保守性',
        spec: { n: 40, taxa: 26, seed: 901, groups: ['Case', 'Ctrl'], strata: 20, confound: 0.5,
          groupOffsets: [0, 5.5], groupTaxa: 6, strataOffsets: [3, -3], strataTaxa: 6,
          scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' },
          note: '配对设计：每个区组内恰好交换两个标签，等价于符号检验式的极小零分布' }
      },
      {
        id: 'euclidean4', icon: '📐', label: '四组比较 + 欧氏距离',
        tip: '欧氏距离对丰度绝对值敏感；4 水平组别',
        spec: { n: 96, taxa: 32, seed: 902, groups: ['Q1', 'Q2', 'Q3', 'Q4'], strata: 4, confound: 0.2,
          groupOffsets: [-3, -1, 1, 3], groupTaxa: 6, strataOffsets: [4, 1, -1, -4], strataTaxa: 8,
          distance: 'euclidean', scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' } }
      },
      {
        id: 'wsDistance', icon: '🌡️', label: 'Bray-Curtis 相异度（WS）',
        tip: '定量比较用 Bray-Curtis，避免 Jaccard 被稀有类群主导',
        spec: { n: 72, taxa: 36, seed: 903, groups: ['Exposed', 'Ref'], strata: 4, confound: 0.3,
          groupOffsets: [0, 5], groupTaxa: 5, strataOffsets: [5, 2, -2, -5], strataTaxa: 9,
          distance: 'ws', scheme: 'stratified', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' } }
      },
      {
        id: 'freeOnly', icon: '🎲', label: '无区组设计（仅自由置换）',
        tip: '完全没有分层变量时的常规用法，作为方法基线',
        spec: { n: 60, taxa: 30, seed: 904, groups: ['A', 'B'], strata: 0, confound: 0,
          groupOffsets: [0, 4], groupTaxa: 6, strataOffsets: null, strataTaxa: 0,
          scheme: 'free', permutations: 999,
          expect: { free: 'sig', constrained: 'sig' },
          note: 'scheme=free 时 constrained 与 free 是同一次检验，p 必然相同' }
      }
    ]
  }
];

export const NR_TEMPLATE_MAP = NR_TEMPLATE_GROUPS.reduce((acc, g) => {
  g.items.forEach((it) => { acc[it.id] = { ...it, group: g.name }; });
  return acc;
}, {});

export const NR_TEMPLATE_COUNT = Object.keys(NR_TEMPLATE_MAP).length;

export function getNonrandomTemplate(id) {
  return NR_TEMPLATE_MAP[id] || null;
}
