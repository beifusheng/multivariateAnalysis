/**
 * PERMANOVA-med 中介分析常用模板
 *
 * 与 PERMANOVA 模板的区别：
 *   PERMANOVA 模板内嵌「距离矩阵 + 样本数据」，矩阵小(10~12 样本)。
 *   中介模板需要「中介矩阵 M(样本 × 物种) + 暴露 X + 结局 Y (+ 协变量 Z)」，
 *   矩阵大得多，因此这里只存「实验设计规格」，数据由确定性伪随机数生成器
 *   在运行时合成 —— 同一 id 每次生成完全相同的数据，结果可复现。
 *
 * 生成的数据带有真实的中介结构：X → M → Y（Y 同时受 M 与 X 直接影响），
 * 因此运行后通常能检测到显著中介效应，便于演示与教学。
 *
 * LDM 的角色约定（与直觉相反）：公式左侧矩阵才是「中介变量」
 *   M(OTU 表) ~ 暴露 X + 结局 Y        （混杂校正： M|Z ~ X + Y）
 */

import { mulberry32, makeRng, zscore, round4 } from './rng.js';

// ---------------------------------------------------------------- 数据合成
/**
 * 按规格合成一份中介分析输入数据
 * @param {object} spec 模板规格
 * @returns {{mediatorData:number[][], predictorData:number[][], outcomeData:number[][],
 *            covariates?:number[][], n:number, taxa:number, formula:string}}
 */
export function buildMedTemplateData(spec) {
  // 默认样本量按功效规则上调（与 R 侧标定结果一致）：
  //   • 二分类结局检验功效低 → ×1.6
  //   • 多分类（≥3 程度）暴露产生的群落梯度较缓 → ×1.4
  let n = spec.n;
  if ((spec.y || []).some((v) => v.binary)) n = Math.round(n * 1.6);
  if ((spec.x || []).some((v) => v.levels && v.levels >= 3)) n = Math.round(n * 1.4);
  n = Math.max(36, Math.min(n, 90));
  const taxa = spec.taxa;
  const { normal, poisson, rand } = makeRng(spec.seed);

  // ---- 协变量 Z（混杂：同时影响 M 与 Y）----
  const Z = (spec.z || []).map((v) =>
    v.binary
      ? Array.from({ length: n }, (_, i) => (i < n / 2 ? 0 : 1))
      : Array.from({ length: n }, () => round4((v.sd ?? 1) * normal()))
  );

  // ---- 暴露 X ----
  const X = (spec.x || []).map((v) => {
    if (v.binary) return Array.from({ length: n }, (_, i) => (i < n / 2 ? 0 : 1));
    if (v.levels) {
      const g = Math.max(2, v.levels);
      return Array.from({ length: n }, (_, i) => round4(((i % g) - (g - 1) / 2) * (v.step || 0.8)));
    }
    return Array.from({ length: n }, () => round4((v.sd ?? 1) * normal()));
  });
  const driver = X[0].length ? zscore(X[0]) : new Array(n).fill(0);
  const zDriver = Z.length ? zscore(Z[0]) : new Array(n).fill(0);

  // ---- 中介矩阵 M：前 resp 个变量响应 X（正负交替），其余为背景噪声 ----
  // coef 默认 0.10：经 R 侧标定，该强度下 F(X)≈2.15、F(Y|X)≈2.41，
  // 与 LDM 官方示例的均衡形态一致；coef 过大会让群落轴被 X 完全解释，
  // 而 LDM 为序贯检验，Y 只剩残余变异 -> 中介检验不显著。
  const resp = spec.responsive ?? Math.max(3, Math.round(taxa * 0.55));
  const base = spec.base ?? 8;
  const coef = spec.coef ?? 0.1;
  const zCoef = spec.zCoef ?? 0.06;

  const M = Array.from({ length: n }, () => new Array(taxa).fill(0));
  for (let k = 0; k < taxa; k++) {
    if (k < resp) {
      const sign = k % 2 === 0 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const lam = Math.max(
          0.4,
          base * Math.exp(sign * coef * driver[i] + zCoef * zDriver[i])
        );
        M[i][k] = poisson(Math.min(lam, 28));
      }
    } else {
      for (let i = 0; i < n; i++) M[i][k] = poisson(base);
    }
  }

  // ---- 群落中介轴：响应变量的标准化均值（这才是真正传给 Y 的中介信号）----
  const community = zscore(
    Array.from({ length: n }, (_, i) => {
      let s = 0;
      for (let k = 0; k < resp; k++) {
        // 让正/负响应的 taxa 同号叠加，形成与 X 一致的群落梯度
        const sign = k % 2 === 0 ? 1 : -1;
        s += sign * M[i][k];
      }
      return s / resp;
    })
  );

  // ---- 结局 Y：受中介轴 + X 直接效应 + （混杂 Z）影响 ----
  const aMed = spec.medStrength ?? 1.8;
  const bDir = spec.directStrength ?? 0.4;
  const noise = spec.noise ?? 0.4;
  const Y = (spec.y || [{ name: 'Y', binary: false }]).map((v) => {
    const latent = Array.from(
      { length: n },
      (_, i) => aMed * community[i] + bDir * driver[i] + (Z.length ? 0.3 * zDriver[i] : 0) + noise * normal()
    );
    if (v.binary) {
      const cut = [...latent].sort((p, q) => p - q)[Math.floor(n / 2)];
      return latent.map((x) => (x > cut ? 1 : 0));
    }
    return latent.map((x) => round4(x));
  });

  // ---- 公式展示串（LDM 组语法：一个 '+' 项为一组，组内多变量加括号）----
  const grp = (names) => (names.length === 1 ? names[0] : `(${names.join(' + ')})`);
  const xNames = X.map((_, i) => `X${i + 1}`);
  const yNames = Y.map((_, i) => `Y${i + 1}`);
  const zNames = Z.map((_, i) => `Z${i + 1}`);
  const lhs = zNames.length ? `${spec.lhs || 'M'}|${zNames.join('+')}` : (spec.lhs || 'M');
  const formula = `${lhs} ~ ${grp(xNames)} + ${grp(yNames)}`;

  const toCols = (mat) => mat[0].map((_, i) => mat.map((row) => row[i]));

  return {
    mediatorData: M,
    predictorData: toCols(X),
    outcomeData: toCols(Y),
    covariates: Z.length ? toCols(Z) : undefined,
    formula,
    n,
    taxa,
    sampleLabels: spec.samples || null,
    varLabels: {
      x: (spec.x || []).map((v) => v.name),
      y: (spec.y || []).map((v) => v.name),
      z: (spec.z || []).map((v) => v.name)
    },
    note: spec.note || '',
    // 便于 UI 直接展示为「列向量」形式
    asColumns: { X: toCols(X), Y: toCols(Y), Z: Z.length ? toCols(Z) : null }
  };
}

// ---------------------------------------------------------------- 模板目录
// 25 个模板，覆盖与 PERMANOVA 相同的学科方向
export const MED_TEMPLATE_GROUPS = [
  {
    title: '🔬 生物/医学方向',
    items: [
      {
        id: 'gutDrugMed', icon: '💊', label: '药物→菌群→指标',
        tip: '肠道菌群介导药物对代谢指标的影响',
        spec: { n: 40, taxa: 30, seed: 101,
          x: [{ name: 'Treatment', binary: true }],
          y: [{ name: 'HbA1c' }],
          note: 'X=用药/对照，M=肠道菌群 OTU 表，Y=血糖指标' }
      },
      {
        id: 'dietObesityMed', icon: '🍔', label: '饮食→菌群→体重',
        tip: '高脂饮食经肠道菌群影响体重',
        spec: { n: 45, taxa: 35, seed: 102,
          x: [{ name: 'Diet', binary: true }],
          y: [{ name: 'Weight' }],
          note: '经典肠-营养轴中介设计' }
      },
      {
        id: 'antibioticObesityMed', icon: '🧫', label: '抗生素→菌群→肥胖',
        tip: '早期抗生素暴露经菌群介导致肥胖',
        spec: { n: 40, taxa: 40, seed: 103,
          x: [{ name: 'Antibiotic', binary: true }],
          y: [{ name: 'BMI' }],
          note: '暴露为二分类（是否用抗生素）' }
      },
      {
        id: 'inflammationMed', icon: '🔥', label: '菌群介导炎症',
        tip: '菌群介导吸烟/暴露对炎症因子的影响',
        spec: { n: 42, taxa: 32, seed: 104,
          x: [{ name: 'Smoking', binary: true }],
          y: [{ name: 'CRP' }],
          z: [{ name: 'Age', sd: 12 }],
          note: '含年龄混杂，需协变量校正' }
      },
      {
        id: 'multiExposureMed', icon: '📊', label: '多因素暴露中介',
        tip: '多个暴露共同作用于菌群与结局',
        spec: { n: 45, taxa: 36, seed: 105,
          x: [{ name: 'Treatment', binary: true }, { name: 'Age', sd: 10 }],
          y: [{ name: 'Response', binary: true }],
          note: '暴露组含 2 个变量，结局为二分类' }
      },
      {
        id: 'probioticMed', icon: '🥛', label: '益生菌干预中介',
        tip: '益生菌经菌群重构改善症状评分',
        spec: { n: 36, taxa: 28, seed: 106,
          x: [{ name: 'Probiotic', binary: true }],
          y: [{ name: 'Score' }],
          z: [{ name: 'Baseline' }],
          note: '基线值为混杂' }
      },
      {
        id: 'pco2Med', icon: '🌫️', label: 'PM2.5→菌群→肺功能',
        tip: '气道菌群介导颗粒物对肺功能的影响',
        spec: { n: 44, taxa: 30, seed: 107,
          x: [{ name: 'PM25', sd: 15 }],
          y: [{ name: 'FEV1' }],
          note: '连续型暴露' }
      }
    ]
  },
  {
    title: '🌾 农业/林业/生态方向',
    items: [
      {
        id: 'fertilizerYieldMed', icon: '🌱', label: '施肥→土壤菌→产量',
        tip: '土壤微生物介导施肥对产量的效应',
        spec: { n: 40, taxa: 34, seed: 201,
          x: [{ name: 'Fertilizer', levels: 3 }],
          y: [{ name: 'Yield' }],
          note: '施肥为三水平梯度' }
      },
      {
        id: 'rotationDiseaseMed', icon: '🔄', label: '轮作→菌群→病害',
        tip: '连作/轮作经土传菌群影响发病率',
        spec: { n: 38, taxa: 30, seed: 202,
          x: [{ name: 'Rotation', binary: true }],
          y: [{ name: 'Disease' }],
          note: 'X=轮作/连作' }
      },
      {
        id: 'pesticideEnzymeMed', icon: '🧪', label: '农药→菌群→酶活',
        tip: '土壤菌群介导农药残留对酶活性的影响',
        spec: { n: 42, taxa: 32, seed: 203,
          x: [{ name: 'Dose', sd: 1 }],
          y: [{ name: 'Enzyme' }],
          z: [{ name: 'pH', sd: 0.5 }],
          note: 'pH 为混杂因子' }
      },
      {
        id: 'forestRootMed', icon: '🌲', label: '林龄→根际菌→生长',
        tip: '根际微生物介导林龄对树木生长的影响',
        spec: { n: 40, taxa: 36, seed: 204,
          x: [{ name: 'StandAge', sd: 12 }],
          y: [{ name: 'DBH' }],
          note: 'X=林龄，Y=胸径' }
      },
      {
        id: 'compostMed', icon: '♻️', label: '工艺→菌群→腐熟度',
        tip: '微生物群落演替介导堆肥工艺效果',
        spec: { n: 36, taxa: 40, seed: 205,
          x: [{ name: 'Process', binary: true }],
          y: [{ name: 'Maturity' }],
          note: 'X=两条堆肥工艺' }
      }
    ]
  },
  {
    title: '🐟 海洋/淡水/昆虫方向',
    items: [
      {
        id: 'coralBleachingMed', icon: '🪸', label: '水温→共生菌→白化',
        tip: '珊瑚共生菌群介导升温对白化的影响',
        spec: { n: 42, taxa: 34, seed: 301,
          x: [{ name: 'Temp', sd: 1.5 }],
          y: [{ name: 'Bleaching' }],
          note: '连续暴露（水温 anomaly）' }
      },
      {
        id: 'fishGutGainMed', icon: '🐟', label: '饲料→肠菌→增重',
        tip: '肠道菌群介导不同饲料对增重率的影响',
        spec: { n: 40, taxa: 30, seed: 302,
          x: [{ name: 'Feed', levels: 3 }],
          y: [{ name: 'SGR' }],
          note: '三种配方饲料' }
      },
      {
        id: 'aquacultureWaterMed', icon: '💧', label: '密度→菌群→水质',
        tip: '水体菌群介导养殖密度对水质的影响',
        spec: { n: 38, taxa: 32, seed: 303,
          x: [{ name: 'Density', sd: 2 }],
          y: [{ name: 'NH4' }],
          note: 'X=放养密度' }
      },
      {
        id: 'insectResistanceMed', icon: '🦗', label: '寄主→共生菌→抗药',
        tip: '昆虫共生菌介导寄主植物对抗药性的影响',
        spec: { n: 40, taxa: 28, seed: 304,
          x: [{ name: 'HostPlant', binary: true }],
          y: [{ name: 'Resistance', binary: true }],
          coef: 0.05,
          note: '两端均为二分类（降 coef 后实测 p=0.0198）' }
      }
    ]
  },
  {
    title: '🧬 组学/神经/临床方向',
    items: [
      {
        id: 'metabolomeMed', icon: '⚗️', label: '基因→代谢物→表型',
        tip: '中介矩阵为代谢物谱（此处以非负强度表示）',
        spec: { n: 44, taxa: 26, seed: 401,
          x: [{ name: 'Genotype', levels: 3 }],
          y: [{ name: 'Phenotype' }],
          lhs: 'METAB',
          note: 'M=代谢物矩阵，行=样本 列=代谢物' }
      },
      {
        id: 'singleCellMed', icon: '🔬', label: '刺激→细胞群→因子',
        tip: '细胞群组成介导刺激对细胞因子水平的影响',
        spec: { n: 40, taxa: 45, seed: 402,
          x: [{ name: 'Stimulation', binary: true }],
          y: [{ name: 'Cytokine' }],
          note: 'M=细胞亚群计数矩阵' }
      },
      {
        id: 'brainGutMed', icon: '🧠', label: '应激→肠菌→行为',
        tip: '肠脑轴：菌群介导慢性应激对行为学评分的影响',
        spec: { n: 36, taxa: 30, seed: 403,
          x: [{ name: 'Stress', binary: true }],
          y: [{ name: 'Behavior' }],
          z: [{ name: 'Weight', sd: 8 }],
          note: '体重为混杂' }
      },
      {
        id: 'subtypeMed', icon: '🏥', label: '分期→菌群→预后',
        tip: '菌群介导疾病分期对预后的影响',
        spec: { n: 45, taxa: 34, seed: 404,
          x: [{ name: 'Stage', levels: 3 }],
          y: [{ name: 'Outcome', binary: true }],
          coef: 0.05,
          note: 'X=临床分期，Y=预后事件（实测 p=0.0099）' }
      }
    ]
  },
  {
    title: '🍽️ 食品科学方向',
    items: [
      {
        id: 'fermentationFlavorMed', icon: '🫙', label: ' starter→菌群→风味',
        tip: '菌群介导发酵剂添加对风味物质的影响',
        spec: { n: 38, taxa: 32, seed: 501,
          x: [{ name: 'Starter', binary: true }],
          y: [{ name: 'Flavor' }],
          note: 'X=是否接种发酵剂' }
      },
      {
        id: 'foodSafetyMed', icon: '🦠', label: '温度→菌群→致病菌',
        tip: '菌群结构介导贮运温度对致病菌检出的影响',
        spec: { n: 40, taxa: 28, seed: 502,
          x: [{ name: 'StorageTemp', sd: 3 }],
          y: [{ name: 'Detected', binary: true }],
          coef: 0.08, responsive: 6, medStrength: 3.0,
          note: '连续暴露 + 二分类检出（实测 p=0.0297）' }
      }
    ]
  },
  {
    title: '🌍 环境科学方向',
    items: [
      {
        id: 'wastewaterMed', icon: '🏭', label: '工艺→菌群→去除率',
        tip: '活性污泥菌群介导运行工艺对去除率的影响',
        spec: { n: 42, taxa: 36, seed: 601,
          x: [{ name: 'Process', binary: true }],
          y: [{ name: 'Removal' }],
          z: [{ name: 'HRT', sd: 2 }],
          note: 'HRT（水力停留时间）为混杂' }
      },
      {
        id: 'landUseDiversityMed', icon: '🗺️', label: '土地利用→菌群→多样性',
        tip: '土壤菌群介导土地利用方式对植物多样性的影响',
        spec: { n: 44, taxa: 34, seed: 602,
          x: [{ name: 'LandUse', levels: 4 }],
          y: [{ name: 'Shannon' }],
          note: '四种类：耕作/草地/林地/裸地' }
      },
      {
        id: 'climateCO2Med', icon: '🌡️', label: '增温CO2→菌群→呼吸',
        tip: '土壤菌群介导增温与 CO₂ 富集对生态系统呼吸的影响',
        spec: { n: 40, taxa: 32, seed: 603,
          x: [{ name: 'Warming', binary: true }, { name: 'CO2', sd: 120 }],
          y: [{ name: 'Rh' }],
          note: '暴露组含增温与 CO₂ 两个变量' }
      }
    ]
  }
];

// 扁平索引：id -> { ...item, spec }
export const MED_TEMPLATE_MAP = MED_TEMPLATE_GROUPS.reduce((acc, g) => {
  g.items.forEach((it) => { acc[it.id] = it; });
  return acc;
}, {});

export const MED_TEMPLATE_COUNT = Object.keys(MED_TEMPLATE_MAP).length;

export function getMedTemplate(id) {
  return MED_TEMPLATE_MAP[id] || null;
}
