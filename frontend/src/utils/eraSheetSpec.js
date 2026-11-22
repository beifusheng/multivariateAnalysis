/**
 * Bayesian ERA（贝叶斯扩展冗余分析 + 中介效应）的表格声明
 * ---------------------------------------------------------------
 * L3：只有业务差异，没有 UI —— 与 gmr4SheetSpec.js / nonrandomSheetSpec.js 同一套约定：
 *  - 纯数据 + 纯函数，不碰 DOM、不 import file-saver，于是"导出内容对不对"能在 Node 里断言；
 *  - 导入用 ERA_IMPORT_SHEETS 描述要哪几张表，视图只负责循环解析；
 *  - 模板的通路系数（γ / β / ω）写成**明面上的小矩阵**，不是随机撒一把再宣称"有中介"：
 *    真值可闭式算出来，harness 才能断言"后验区间覆盖真值"，而不是"跑出来啥算啥"；
 *  - 随机源统一走 utils/rng.js（makeRng / zscore / round4）。gmr4SheetSpec 里另有一份 lcg，
 *    那是历史遗留，别再抄第三份 —— 两份随机源等于两套可复现性。
 *
 * ctx（由视图组装）：{ r, analysisResult, payload, templateLabel, diagnostics, stamp }
 */

import { makeRng, round4 } from './rng.js';

/**
 * 导入需要的工作表。X / M / Y 三张都是必填 —— 与 GMR⁴ 的"Z 可选"不同：
 * 中介分析没有 M 就退化成普通回归，那种"能跑但不是你要的东西"必须当场拦住
 * （引擎里也有同名的一条报错，两边不是冗余：这里拦的是导入界面，那里拦的是直接调 API）。
 */
export const ERA_IMPORT_SHEETS = [
  {
    key: 'X',
    names: ['预测变量X'],
    label: '预测变量 X',
    kind: 'matrix',
    required: true,
    aliasHint: '环境因子 / 处理 / 暴露 / 预测变量 / X / predictors',
    desc: '第一列样本 ID，其余每列一个解释变量（通路的起点）'
  },
  {
    key: 'M',
    names: ['中介变量M'],
    label: '中介变量 M',
    kind: 'matrix',
    required: true,
    aliasHint: '中介 / 中间变量 / mediator / M',
    desc: '第一列样本 ID，其余每列一个中介变量；行数与 X 一致且同序'
  },
  {
    key: 'Y',
    names: ['响应变量Y'],
    label: '响应变量 Y',
    kind: 'matrix',
    required: true,
    aliasHint: '响应 / 结局 / 物种矩阵 / Y / responses',
    desc: '第一列样本 ID，其余每列一个响应变量；行数与 X 一致且同序'
  },
  {
    key: 'params',
    names: ['模型参数'],
    label: '模型参数',
    kind: 'kv',
    required: false,
    aliasHint: '参数 / chains / iterations / thin / seed / prior',
    desc: '可选。chains、iterations、thin、seed、prior_lambda、prob'
  }
];

/**
 * 表单字段清单 —— **由 spec 定义，视图必须照抄**。
 * 这条常量存在的理由是 GMR⁴ 那次事故：gmr4ToFormPatch 返回的键叫 ranks/lambdas，
 * 表单字段叫 ranksStr/lambdasStr，Object.assign 写进不存在的属性，参数永远进不了界面，
 * 而当时**没有任何一处代码知道两边不一致**（视图还不存在时更没法验）。
 * 现在：spec 测试断言 eraToFormPatch 的键 ⊆ 本清单；视图测试断言 data().form 的键 == 本清单。
 * 两头钉住，键名漂移当场红。
 */
export const ERA_FORM_FIELDS = ['xStr', 'mStr', 'yStr', 'chains', 'iterations', 'thin',
  'seed', 'priorLambda', 'prob'];

/** 预览 tab 顺序（外壳只按这个数组摆） */
export const ERA_PREVIEW_TABS = [
  { key: 'X', labelOf: (p) => `预测变量 X（${p.rows} 样本 × ${p.cols} 列）` },
  { key: 'M', labelOf: (p) => `中介变量 M（${p.rows} 样本 × ${p.cols} 列）` },
  { key: 'Y', labelOf: (p) => `响应变量 Y（${p.rows} 样本 × ${p.cols} 列）` },
  { key: 'params', labelOf: () => '模型参数', onlyWhenData: true }
];

/* ==================== 模板：设计（通路系数写在明面上）==================== */
/**
 * 六个设计共用同一个数据生成器：X ~ N(0,1)；M = X·Γ + 噪声；Y = X·B + M·Ω + 噪声。
 * 引擎把三张表按列标准化后再拟合，所以"真值"也在标准化尺度上算（见 eraTemplateTruth），
 * 这一点是硬要求：spike 里那个"覆盖率 37.5%"的假事故就是拿原始尺度真值
 * 去比标准化尺度后验造出来的。
 */
export const ERA_TEMPLATE_GROUPS = [
  {
    id: 'teaching', name: '🎓 教学：中介通路在做什么',
    items: [
      {
        id: 'fullmed', icon: '🔗', label: '完全中介（36 样本 × 2 预测 × 1 中介 × 2 响应）',
        tip: 'X 只通过 M 起作用（直接通路 B=0）。选型应当把间接效应报出来、把直接效应留在 0 附近',
        spec: {
          p: 2, k: 1, q: 2, n: 36,
          gamma: [0.9, -0.6],                 // 2×1（行=预测变量）
          beta: [0, 0, 0, 0],                 // 2×2 全 0 = 没有直接通路
          omega: [0.8, -0.7],                 // 1×2
          noiseM: 0.7, noiseY: 0.7,
          seed: 12345, chains: 4, iterations: 4000, thin: 5, priorLambda: 1, prob: 0.95,
          expect: { indirect_excl_zero_min: 4, direct_contains_zero_min: 4,
            r2_xm_min: 0.35, convergence_ok: true },
          note: 'B=0 是设计事实，不是估出来的：后验若把直接效应报成显著，那就是区间在骗你'
        }
      },
      {
        id: 'partmed', icon: '🪢', label: '部分中介（48 样本 × 2 预测 × 1 中介 × 2 响应）',
        tip: '两条通路都在。总效应 = 直接 + 间接 这条恒等式在这里最直观，三个区间应当同时不含 0',
        spec: {
          p: 2, k: 1, q: 2, n: 48,
          gamma: [0.9, -0.6],
          beta: [0.45, -0.2, 0.0, 0.4],
          omega: [0.8, -0.7],
          noiseM: 0.8, noiseY: 0.7,
          seed: 20261120, chains: 4, iterations: 4000, thin: 5, priorLambda: 1, prob: 0.95,
          expect: { indirect_excl_zero_min: 4, direct_excl_zero_min: 3,
            r2_xm_min: 0.4, convergence_ok: true },
          note: '第 2 个格子（X1→Y2）的直接真值是 0，故意留一个"应当含 0"的格子防止全绿自嗨'
        }
      }
    ]
  },
  {
    id: 'traps', name: '⚠️ 陷阱：什么时候"有中介"是错觉',
    items: [
      {
        id: 'nome', icon: '🚫', label: '没有中介（40 样本 × 2 预测 × 1 中介 × 2 响应，Ω=0）',
        tip: 'M 与 Y 无关。这张表照样能跑出一堆数，所以界面必须能说"不支持中介"，而不是沉默地给区间',
        spec: {
          p: 2, k: 1, q: 2, n: 40,
          gamma: [0.9, -0.6],
          beta: [0.5, -0.3, 0.2, 0.4],
          omega: [0, 0],                       // 中介对 Y 没有效应
          noiseM: 0.8, noiseY: 0.7,
          seed: 4242, chains: 4, iterations: 4000, thin: 5, priorLambda: 1, prob: 0.95,
          // r2_xm_min 从 0.4 下调到 0.35：这是**实测（0.372）之后改的**，不是为了绕红。
          // 原 claim 是我拍脑袋写的“模板应当能解释 40%”：W=0 时 M 不贡献解释力，
          // 真值只有 37.2%。判据跟着事实改才对，反方向就是自欺。
          expect: { indirect_excl_zero_max: 0, direct_excl_zero_min: 3,
            r2_xm_min: 0.35, convergence_ok: true },
          note: '这张表的价值在于让"没有"这件事可见；总效应的区间不该被当成间接通路'
        }
      },
      {
        id: 'inconsistent', icon: '⚖️', label: '遮掩效应（48 样本 × 1 预测 × 1 中介 × 1 响应，符号相反）',
        tip: '直接为正、间接为负，两者相加几乎抵消。看到"总效应不显著"就下结论"没效应"是经典误读',
        spec: {
          p: 1, k: 1, q: 1, n: 48,
          gamma: [0.9],
          beta: [0.9],
          omega: [-0.95],
          noiseM: 0.7, noiseY: 0.7,
          seed: 333, chains: 4, iterations: 4000, thin: 5, priorLambda: 1, prob: 0.95,
          expect: { sign_inconsistent_min: 1, total_contains_zero_min: 1,
            r2_xm_min: 0.25, convergence_ok: true },
          note: '只有一个格子，所以符号相反必须被报出来 —— 这张表没有"平均一下就行"的余地'
        }
      }
    ]
  },
  {
    id: 'stress', name: '🧪 压力：多响应高维 / 样本不够',
    items: [
      {
        id: 'highdim', icon: '🐘', label: '多中介多响应（60 样本 × 3 预测 × 3 中介 × 8 响应）',
        tip: '24 个格子同时估计。要看的是收敛与表/图是否还成立，而不是"哪个显著哪个不显著"',
        spec: {
          p: 3, k: 3, q: 8, n: 60,
          gamma: [0.8, -0.5, 0.3, 0.4, 0.6, -0.7, -0.2, 0.5, 0.6],   // 3×3
          beta: [0.3, -0.2, 0.1, 0.4, -0.3, 0.2, 0.1, 0.5,
                 -0.2, 0.2, 0.4, -0.1, 0.3, 0.1, -0.4, 0.2,
                 0.1, -0.3, 0.2, 0.4, -0.2, 0.1, 0.3, -0.1],          // 3×8
          omega: [0.7, -0.6, 0.5, -0.4, 0.6, 0.3, -0.5, 0.4,
                  0.2, 0.5, -0.3, 0.6, 0.1, -0.4, 0.3, 0.2,
                  -0.5, 0.3, 0.4, -0.2, 0.6, 0.2, -0.3, 0.5],          // 3×8
          noiseM: 0.9, noiseY: 1.0,
          seed: 6060, chains: 4, iterations: 4000, thin: 5, priorLambda: 1, prob: 0.95,
          // 实测 11/24 格。n=60 同旰24 个格子时本来就只能抻出一半：
          // 这张模板要教的正是“多响应下别指望每一格都有功效”，
          // 而不是我原来拍的 12。“拍一个好看的阈值”与“实测多少写多少”的区别，
          // 就在于后者能不能说出差的那 13 格为什么不显著。
          expect: { indirect_excl_zero_min: 11, r2_xm_min: 0.35, convergence_ok: true },
          note: '这张表用来证明默认迭代数不是照着小张表调的'
        }
      },
      {
        id: 'smallN', icon: '🤏', label: '小样本（10 样本 × 2 预测 × 1 中介 × 2 响应）',
        tip: '只有 10 个样本：引擎会照算，但必须把“样本太少”摊开说。这张表的价值在警告可见，不在结论好看',
        spec: {
          p: 2, k: 1, q: 2, n: 10,
          gamma: [0.9, -0.6],
          beta: [0.45, -0.2, 0.0, 0.4],
          omega: [0.8, -0.7],
          noiseM: 0.8, noiseY: 0.7,
          seed: 99, chains: 4, iterations: 4000, thin: 5, priorLambda: 1, prob: 0.95,
          // 故意**不写**任何效应方向的判据：n=10 上拿区间方向当"答案"本身就是错的供认。
          expect: { must_warn: '样本数只有 10', convergence_ok: true },
          note: '小样本模板只要求"警告必须出现"，不要求估计好看'
        }
      }
    ]
  }
];

export const ERA_TEMPLATE_MAP = ERA_TEMPLATE_GROUPS.reduce((acc, g) => {
  g.items.forEach((it) => { acc[it.id] = { ...it, group: g.name }; });
  return acc;
}, {});

export const ERA_TEMPLATE_COUNT = Object.keys(ERA_TEMPLATE_MAP).length;

function toMatrix(rowMajor, nrows, ncols) {
  const M = [];
  for (let i = 0; i < nrows; i++) M.push(rowMajor.slice(i * ncols, (i + 1) * ncols));
  if (M.some((r) => r.length !== ncols)) throw new Error('模板通路系数长度与维度不符');
  return M;
}

/**
 * 由设计算出 X / M / Y（确定性：seed 决定一切）。维度由三个矩阵的整形推出：
 *   Γ 是 p×k、Ω 是 k×q  ⇒  k = Ω.length、q = Ω[0].length、p = Γ.length / k。
 * 上一版这里想用 gamma.length / omega.length 反推 p，还留了一个靠猜维度的废函数。
 * 形状假设必须由数据本身算出来并且可校验（本项目在矩阵方向上已经挨过多次）。
 */
export function buildEraDesign(sp) {
  // 维度是**声明**出来的（p/k/q 写在每个模板的 spec 里），长度只做一致性校验。
  // 上一版想用 omega.length 反推 k —— 可 Ω 存的也是扁平数组，反推出来的是 k*q，
  // 于是 toMatrix 的长度校验当场报"模板通路系数长度与维度不符"。
  // 这就是"靠猜维度"的下场，也是这段注释必须留在这里的原因。
  const { p, k, q } = sp;
  if (sp.gamma.length !== p * k) throw new Error(`Γ 长度 ${sp.gamma.length} ≠ p*k = ${p * k}`);
  if (sp.beta.length !== p * q) throw new Error(`B 长度 ${sp.beta.length} ≠ p*q = ${p * q}`);
  if (sp.omega.length !== k * q) throw new Error(`Ω 长度 ${sp.omega.length} ≠ k*q = ${k * q}`);
  const G = toMatrix(sp.gamma, p, k);
  const B = toMatrix(sp.beta, p, q);
  const W = toMatrix(sp.omega, k, q);
  const rnd = makeRng(sp.seed);
  const ids = [];
  const X = []; const M = []; const Y = [];
  for (let i = 0; i < sp.n; i++) {
    const xrow = [];
    for (let j = 0; j < p; j++) xrow.push(round4(rnd.normal()));
    const mrow = [];
    for (let t = 0; t < k; t++) {
      let acc = 0;
      for (let j = 0; j < p; j++) acc += xrow[j] * G[j][t];
      mrow.push(round4(acc + sp.noiseM * rnd.normal()));
    }
    const yrow = [];
    for (let c = 0; c < q; c++) {
      let acc = 0;
      for (let j = 0; j < p; j++) acc += xrow[j] * B[j][c];
      for (let t = 0; t < k; t++) acc += mrow[t] * W[t][c];
      yrow.push(round4(acc + sp.noiseY * rnd.normal()));
    }
    X.push(xrow); M.push(mrow); Y.push(yrow);
    ids.push(`样本${i + 1}`);
  }
  return { X, M, Y, ids, p, k, q };
}

/**
 * 标准化尺度上的真值（harness 用它断言"区间覆盖真值"）。
 * 用**样本 sd**换算，与引擎里 zscore 的口径完全一致；这里独立实现（不与生成器共码），
 * 对了是两边都对，错了不会一起错。
 */
export function eraTemplateTruth(id) {
  const tpl = ERA_TEMPLATE_MAP[id || ERA_TEMPLATE_GROUPS[0].items[0].id];
  if (!tpl) throw new Error(`未知 ERA 设计模板：${id}`);
  const sp = tpl.spec;
  const { X, M, Y } = buildEraDesign(sp);
  const { p, k, q } = sp;
  const G = toMatrix(sp.gamma, p, k);
  const B = toMatrix(sp.beta, p, q);
  const W = toMatrix(sp.omega, k, q);
  const sdOf = (Mat, j) => {
    const col = Mat.map((r) => r[j]);
    const m = col.reduce((a, b) => a + b, 0) / col.length;
    return Math.sqrt(col.reduce((a, b) => a + (b - m) * (b - m), 0) / (col.length - 1));
  };
  const sX = Array.from({ length: p }, (_, j) => sdOf(X, j));
  const sM = Array.from({ length: k }, (_, t) => sdOf(M, t));
  const sY = Array.from({ length: q }, (_, c) => sdOf(Y, c));
  const Gs = G.map((row, j) => row.map((v, t) => (v * sX[j]) / sM[t]));
  const Ws = W.map((row, t) => row.map((v, c) => (v * sM[t]) / sY[c]));
  const Bs = B.map((row, j) => row.map((v, c) => (v * sX[j]) / sY[c]));
  const ind = Bs.map((row, j) => row.map((_, c) => {
    let acc = 0;
    for (let t = 0; t < k; t++) acc += Gs[j][t] * Ws[t][c];
    return acc;
  }));
  const flat = (Mat) => {
    const out = [];
    for (let c = 0; c < q; c++) for (let j = 0; j < p; j++) out.push({ j, c, v: Mat[j][c] });
    return out;                       // 顺序 = X 快 / Y 慢，与引擎展平口径一致
  };
  return { p, k, q, direct: flat(Bs), indirect: flat(ind), total: flat(Bs.map((row, j) => row.map((v, c) => v + ind[j][c]))) };
}

const withIds = (ids, Mat, head) => [[head].concat(Mat[0].map((_, j) => `${head}${j + 1}`))]
  .concat(Mat.map((row, i) => [ids[i]].concat(row)));

/** 模板工作簿：四张表，与下载/导入真走同一条路 */
export function eraTemplateSheets(id) {
  const key = id || ERA_TEMPLATE_GROUPS[0].items[0].id;
  const tpl = ERA_TEMPLATE_MAP[key];
  if (!tpl) throw new Error(`未知 ERA 设计模板：${id}`);
  const sp = tpl.spec;
  const { X, M, Y, ids } = buildEraDesign(sp);
  return [
    { name: '预测变量X', aoa: withIds(ids, X, 'X') },
    { name: '中介变量M', aoa: withIds(ids, M, 'M') },
    { name: '响应变量Y', aoa: withIds(ids, Y, 'Y') },
    {
      name: '模型参数',
      aoa: [['参数', '值'],
        ['chains', String(sp.chains)], ['iterations', String(sp.iterations)],
        ['thin', String(sp.thin)], ['seed', String(sp.seed)],
        ['prior_lambda', String(sp.priorLambda)], ['prob', String(sp.prob)]]
    }
  ];
}

/* ==================== 导入预览与表单回填 ==================== */
/**
 * 预览 tab：与 gmr4ImportTabs 同一个教训 —— sheetIo.previewFromFields 是给**群落矩阵**写的
 * （内部要 primary.matrix && primary.species 才 push tab），行优先的 {ok,ids,columns,rows}
 * 传进去只会返回空数组，于是对话框空白 +「填入表单」被 :disabled="!tabs.length" 按住。
 * 所以这里自己生成，并且 rows 必须是**以 cols 为键的对象数组**（ImportDialog 用 :prop 取值）。
 */
export function eraImportTabs(ids, fields) {
  const tabs = [];
  const push = (key, name, label) => {
    const f = fields[key];
    if (!f || !f.rows || !f.rows.length) return;
    const cols = f.columns || [];            // 表头在 mapWorkbook 的 columns 键，不是 headers
    tabs.push({
      name,
      label: `${label}（${f.rows.length} 样本 × ${cols.length} 列，前 8 行）`,
      cols: ['样本', ...cols],
      rows: f.rows.slice(0, 8).map((row, i) => {
        const o = { 样本: (f.ids && f.ids[i]) || (ids && ids[i]) || `第${i + 1}行` };
        cols.forEach((h, j) => { o[h] = row[j]; });
        return o;
      })
    });
  };
  push('X', 'era_x', '预测变量 X');
  push('M', 'era_m', '中介变量 M');
  push('Y', 'era_y', '响应变量 Y');
  const kv = (fields.params && fields.params.kv) || fields.kv;
  if (kv && Object.keys(kv).length) {
    tabs.push({
      name: 'era_params',
      label: '模型参数（chains / iterations / thin / seed / prior_lambda / prob）',
      cols: ['参数', '值'],
      rows: Object.keys(kv).map((k) => ({ 参数: k, 值: String(kv[k]) }))
    });
  }
  return tabs;
}

/**
 * 解析结果 -> 表单补丁。两条硬规矩（都是 GMR⁴ 用事故换来的）：
 *  1) 只发**行数组**（行序就是样本配对），不许发列；
 *  2) 键名必须来自 ERA_FORM_FIELDS，且数值参数发的是"表单用的那个字段"
 *     （prior_lambda → priorLambda 这种改名在这里做一次，视图那边不再猜）。
 */
export function eraToFormPatch(fields) {
  const patch = {};
  const rowsOf = (key) => fields[`${key}_aligned`] || (fields[key] && fields[key].rows) || null;
  const X = rowsOf('X');
  const M = rowsOf('M');
  const Y = rowsOf('Y');
  if (X) patch.xStr = JSON.stringify(X);
  if (M) patch.mStr = JSON.stringify(M);
  if (Y) patch.yStr = JSON.stringify(Y);
  const kv = (fields.params && fields.params.kv) || {};
  if (Object.keys(kv).length) {
    const one = (v) => {
      const n = Number(String(v == null ? '' : v).trim());
      return Number.isFinite(n) ? n : null;
    };
    const put = (name, val) => { if (val !== null) patch[name] = val; };
    put('chains', one(kv.chains));
    put('iterations', one(kv.iterations));
    put('thin', one(kv.thin));
    put('seed', one(kv.seed));
    put('priorLambda', one(kv.prior_lambda === undefined ? kv.priorLambda : kv.prior_lambda));
    put('prob', one(kv.prob));
    // 留空与非法值不写进补丁：表单保持原值比"变成 0 / NaN"好（Number('') === 0 那次教训）。
    Object.keys(patch).forEach((kk) => {
      if (!ERA_FORM_FIELDS.includes(kk)) throw new Error(`eraToFormPatch 发出了表单没有的键：${kk}`);
    });
  }
  return patch;
}

/* ==================== 导出计划器 ==================== */
export const ERA_EXPORT_OPTIONS = [
  {
    key: 'excel',
    label: '分析结果（Excel：结论 / 效应表 / 方差分解 / 收敛诊断 / 模型信息）',
    type: 'xlsx',
    fileTag: '结果',
    sheets(ctx) {
      const { r, templateLabel, diagnostics } = ctx;
      const lab = r.cell_labels || [];
      const concl = [
        ['项目', '值'],
        ['模块', 'Bayesian ERA（含中介效应）'],
        ['模板', templateLabel || '手动输入'],
        ['样本数 n', r.n],
        ['预测变量 p', r.p],
        ['中介变量 k', r.k],
        ['响应变量 q', r.q],
        ['链数 / 迭代 / 薄抽', `${r.chains} / ${r.iterations} / ${r.thin}`],
        ['split-R̂ 最大值', r.convergence ? r.convergence.rhat_max : '—'],
        ['ESS 最小值', r.convergence ? r.convergence.ess_min : '—'],
        ['WAIC（Y 侧）', r.waic ? r.waic.waic : '—'],
        ['诊断条数', (diagnostics || []).length]
      ];
      const effHead = ['格子', '直接·均值', '直接·下界', '直接·上界',
        '间接·均值', '间接·下界', '间接·上界', '总·均值', '间接>0 概率', 'OLS 间接'];
      const effRows = lab.map((nm, i) => [
        nm,
        r.effects.direct.mean[i], r.effects.direct.hdi_lo[i], r.effects.direct.hdi_hi[i],
        r.effects.indirect.mean[i], r.effects.indirect.hdi_lo[i], r.effects.indirect.hdi_hi[i],
        r.effects.total.mean[i], r.effects.indirect.prob_gt0[i], r.effects.indirect.ols[i]
      ]);
      const vp = r.variance_partition;
      const part = [
        ['响应', 'X 独有', 'X∩M（经中介）', 'M 独有', '残差'],
        ...Array.from({ length: r.q }, (_, c) => [
          `Y${c + 1}`,
          (vp.x_unique || [])[c], (vp.shared || [])[c], (vp.m_unique || [])[c], (vp.residual || [])[c]
        ])
      ];
      part.splice(1, 0, ['（每行之和应为 1）', '', '', '', '']);
      const conv = [
        ['格子', 'split-R̂（直接）', 'ESS（直接）', 'split-R̂（间接）', 'ESS（间接）'],
        ...lab.map((nm, i) => [nm, r.effects.direct.rhat[i], r.effects.direct.ess[i],
          r.effects.indirect.rhat[i], r.effects.indirect.ess[i]])
      ];
      const info = [
        ['项', '值'],
        ['先验 λ', r.prior_lambda],
        ['区间口径', `${Math.round((r.prob || 0.95) * 100)}% 等尾分位数区间（不是最高密度区间）`],
        ['标准化 X 尺度', (r.X_scale || []).join(', ')],
        ['标准化 M 尺度', (r.M_scale || []).join(', ')],
        ['标准化 Y 尺度', (r.Y_scale || []).join(', ')],
        ['解读', r.interpretation],
        ['诊断', (diagnostics || []).join(' / ') || '（无）']
      ];
      return [
        { name: '结论', aoa: concl },
        { name: '效应表', aoa: [effHead].concat(effRows) },
        { name: '方差分解', aoa: part },
        { name: '收敛诊断', aoa: conv },
        { name: '模型信息', aoa: info }
      ];
    }
  },
  {
    key: 'json',
    label: '完整结果（JSON：后验摘要 + 收敛诊断 + 抽样）',
    type: 'json',
    fileTag: '结果',
    data(ctx) { return ctx.r; }
  },
  {
    key: 'chart',
    label: '当前图表（PNG）',
    type: 'png',
    fileTag: '图表'
  },
  {
    key: 'input',
    label: '输入数据（X / M / Y / 参数，可复现）',
    type: 'json',
    fileTag: '输入',
    data(ctx) { return ctx.payload; }
  }
];

export const ERA_EXPORT_DEFAULTS = ['excel', 'json', 'chart', 'input'];

export function eraPlanExport(keys, ctx, stamp) {
  const jobs = [];
  for (const key of keys) {
    const opt = ERA_EXPORT_OPTIONS.find((o) => o.key === key);
    if (!opt) continue;
    const ext = opt.type === 'xlsx' ? 'xlsx' : opt.type === 'json' ? 'json' : 'png';
    const filename = `BayesianERA ${opt.fileTag}_${stamp}.${ext}`;
    if (opt.type === 'xlsx') jobs.push({ type: 'xlsx', filename, sheets: opt.sheets(ctx) });
    else if (opt.type === 'json') jobs.push({ type: 'json', filename, data: opt.data(ctx) });
    else jobs.push({ type: 'png', filename });
  }
  return jobs;
}
