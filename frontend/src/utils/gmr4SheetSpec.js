/**
 * GMR4（多响应降秩回归）的表格声明（L3：只有业务差异，没有 UI）
 * ---------------------------------------------------------------
 * 与另外三个模块同一套约定（见 nonrandomSheetSpec.js 顶部）：
 *  - 纯数据 + 纯函数，不碰 DOM、不 import file-saver，于是"导出内容对不对"能在 Node 里断言；
 *  - 导入用 GMR4_IMPORT_SHEETS 描述要哪几张表，视图只负责循环解析；
 *  - 模板数据由本文件生成，**必须是统计上站得住的设计**（见规则 4），
 *    下载下来直接点「运行分析」就应当得到显著且秩被正确找回的结果。
 *
 * ctx（由视图组装）：{ r, analysisResult, payload, templateLabel, diagnostics, stamp }
 */

/** 导入需要的工作表。kind=matrix 表示"第一列样本 ID + 其余数值列" */
export const GMR4_IMPORT_SHEETS = [
  {
    key: 'X',
    names: ['预测变量X'],
    label: '预测变量 X',
    kind: 'matrix',
    required: true,
    aliasHint: '自变量 / 暴露 / 预测变量 / X / predictors',
    desc: '第一列样本 ID，其余每列一个预测变量（连续或已编码）'
  },
  {
    key: 'Y',
    names: ['响应变量Y'],
    label: '响应变量 Y',
    kind: 'matrix',
    required: true,
    aliasHint: '因变量 / 多响应 / Y / responses',
    desc: '第一列样本 ID，其余每列一个响应变量；行数与 X 必须一致且同序'
  },
  {
    key: 'Z',
    names: ['协变量Z'],
    label: '协变量 Z',
    kind: 'matrix',
    required: false,
    aliasHint: '混杂因素 / 批次 / 协变量 / Z / covariates',
    desc: '可选。会在建模前从 X 与 Y 里偏掉（Frisch–Waugh），不是"再多加一列"'
  },
  {
    key: 'params',
    names: ['模型参数'],
    label: '模型参数',
    kind: 'kv',
    required: false,
    aliasHint: '参数 / ranks / lambda / kfold / seed',
    desc: '可选。ranks（候选秩，逗号分隔）、lambdas、kfold、seed'
  }
];

/** 预览 tab 顺序（外壳只按这个数组摆） */
export const GMR4_PREVIEW_TABS = [
  { key: 'X', labelOf: (p) => `预测变量 X（${p.rows} 样本 × ${p.cols} 列）` },
  { key: 'Y', labelOf: (p) => `响应变量 Y（${p.rows} 样本 × ${p.cols} 列）` },
  { key: 'Z', labelOf: () => '协变量 Z', onlyWhenData: true },
  { key: 'params', labelOf: () => '模型参数', onlyWhenData: true }
];

/** 导出勾选项：build() 只吃 ctx、只返回数据 */
export const GMR4_EXPORT_OPTIONS = [
  {
    key: 'excel',
    label: '分析结果（Excel：结论 / 选型路径 / CV 网格 / 系数矩阵 / 模型信息）',
    type: 'xlsx',
    fileTag: '结果',
    sheets(ctx) {
      const { r, templateLabel, diagnostics } = ctx;
      const concl = [
        ['项目', '值'],
        ['模块', 'GMR4 多响应降秩回归'],
        ['模板', templateLabel || '手动输入'],
        ['样本数 n', r.n_samples],
        ['预测变量 p', r.p],
        ['响应变量 q', r.q],
        ['满秩上限 min(p,q)', r.s_max],
        ['选定秩 S', r.rank_selected],
        ['选定 lambda', r.lambda_selected],
        ['整体 R²（原尺度）', r.R2],
        ['整体 R²（偏掉协变量后）', r.R2_partialled],
        ['交叉验证折数', r.kfold],
        ['随机种子', r.seed],
        ['偏掉的协变量数', r.covariates_partialled_out]
      ];
      const rule = [['选型依据', r.selection_rule || '']];
      // 各响应单独给 R²：降秩最容易出现"整体好看、某个响应被丢掉"
      const perResp = [['响应列', 'R²']].concat(
        (r.R2_per_response || []).map((v, i) => [`Y${i + 1}`, v])
      );
      const cv = cvToAoa(r.cv);
      const coef = matrixToAoa(r.coefficients, 'B（标准化尺度，行=X 列=Y）');
      const diag = [['诊断']].concat((diagnostics || []).map((d) => [d]));
      return [
        { name: '结论', aoa: concl },
        { name: '选型路径', aoa: rule.concat([[]], perResp) },
        { name: 'CV网格', aoa: cv },
        { name: '系数矩阵', aoa: coef },
        { name: '模型信息', aoa: [['解释', r.interpretation || ''], ['满秩RSS', r.rss_full], ['选定秩RSS', r.rss_reduced]].concat(diag.length > 1 ? [[]] .concat(diag) : []) }
      ];
    }
  },
  {
    key: 'json',
    label: '原始结果（JSON）',
    type: 'json',
    fileTag: '结果',
    data(ctx) { return ctx.analysisResult; }
  },
  {
    key: 'chart',
    label: '图表 PNG（当前正在看的那张：CV 热图 / 选型曲线 / 载荷双标图）',
    type: 'png',
    fileTag: '图表'
  },
  {
    key: 'input',
    label: '本次输入（JSON，含 X/Y/Z 与参数，可复现）',
    type: 'json',
    fileTag: '输入',
    data(ctx) { return ctx.payload; }
  }
];

export const GMR4_EXPORT_DEFAULTS = ['excel', 'json'];

/**
 * 把勾选 key 列表变成下载任务清单。
 * job 形状与 nonrandomSheetSpec.planExport 一致：{ type, filename, sheets|data }，
 * type 只有 xlsx / json / png 三种 —— 视图的执行代码因此能三个模块共用。
 * （上一版这里自己发明了 kind 与 csv：项目里从来没有 CSV 写出通路，
 * 于是"系数 CSV"这项勾了也只会拿到一个没人能执行的任务。）
 */
export function gmr4PlanExport(keys, ctx, stamp) {
  const jobs = [];
  for (const key of keys) {
    const opt = GMR4_EXPORT_OPTIONS.find((o) => o.key === key);
    if (!opt) continue;
    const filename = `GMR4 ${opt.fileTag}_${stamp}.${opt.type === 'xlsx' ? 'xlsx' : opt.type === 'json' ? 'json' : 'png'}`;
    if (opt.type === 'xlsx') jobs.push({ type: 'xlsx', filename, sheets: opt.sheets(ctx) });
    else if (opt.type === 'json') jobs.push({ type: 'json', filename, data: opt.data(ctx) });
    else jobs.push({ type: 'png', filename });
  }
  return jobs;
}

/**
 * 解析出来的表单字段 -> 视图状态。
 * 注意形状：sheetIo.mapWorkbook 给的是 `<key>_aligned`（按主表样本顺序排好的**行数组**）
 * 与 `<key>_columns`，不是 `.data`；参数表没有专用 kind，走通用 rows。
 * 行序就是样本配对关系，所以这里必须原样传行数组，绝不能按列。
 */
export function gmr4ToFormPatch(fields) {
  const patch = {};
  // primary 表（X）不会被 _aligned 化——它就是样本顺序的定义者，取它自己的 rows；
  // Y/Z 是 _aligned：按 X 的样本 ID 重排过，行序就是配对关系。
  const rowsOf = (key) => fields[`${key}_aligned`] || (fields[key] && fields[key].rows) || null;
  const X = rowsOf('X');
  const Y = rowsOf('Y');
  if (X) patch.xStr = JSON.stringify(X);
  if (Y) patch.yStr = JSON.stringify(Y);
  const Z = rowsOf('Z');
  if (Z && Z.length) patch.zStr = JSON.stringify(Z);
  if (fields.params && Array.isArray(fields.params.rows)) {
    const kv = {};
    for (const r of fields.params.rows) {
      if (Array.isArray(r) && r.length >= 2 && r[0] && r[0] !== '参数') kv[String(r[0]).trim()] = r[1];
    }
    const nums = (v) => String(v == null ? '' : v).split(/[,，\s]+/).map((x) => String(x).trim()).filter(Boolean).map(Number).filter((x) => Number.isFinite(x));
    if (kv.ranks) patch.ranks = nums(kv.ranks);
    if (kv.lambdas) patch.lambdas = nums(kv.lambdas);
    if (kv.kfold) patch.kfold = nums(kv.kfold)[0];
    if (kv.seed) patch.seed = nums(kv.seed)[0];
  }
  return patch;
}

/* ============================ 模板数据 ============================ */
/**
 * 确定性伪随机（不要 Math.random：模板每次下载都必须一模一样，
 * 否则"下载→导入→运行→对比 p 值"这条回归测试自己就先漂了）。
 */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function randn(rnd) {
  // Box–Muller：两个均匀数换一个正态数
  let u = 0; let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const round4 = (x) => Math.round(x * 1e4) / 1e4;

/**
 * 真值：rank(B_true) = 3，p=5 个预测变量，q=8 个响应，n=36 个样本，1 个协变量。
 * 规则 4 要求示例必须"跑出结论"，所以这里不是随便凑数：
 *   n=36（CV 分 4 折后每折训练集仍有足够自由度）；
 *   噪声 sd 取得小，使选定秩几乎必然回到 3、整体 R² 远超 0.6；
 *   协变量 Z 对 X 与 Y 都有强效应 —— 用来演示"偏掉 Z"和不偏的区别。
 * 期望：rank_selected=3，R2_per_response 前 7 个都 >0.9，第 8 个响应故意做成弱信号。
 */
export function gmr4TemplateSheets() {
  const rnd = lcg(20261119);
  const n = 36; const p = 5; const q = 8; const S = 3;
  const Z = Array.from({ length: n }, () => randn(rnd));
  // Z 对 X 的污染要明显（这是混杂的本意），但对 Y 的直接效应必须小：
  // 上一版写成 2.2，于是 Y 的方差几乎全由 Z 解释，偏掉 Z 之后 X 只剩两成解释力，
  // "示例应当跑出显著结论"这条下限直接破掉（实测原尺度 R2=0.23）。
  const X = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < p; j++) row.push(round4(randn(rnd) + 0.8 * Z[i]));
    X.push(row);
  }
  const A = [];
  for (let j = 0; j < p; j++) A.push(Array.from({ length: S }, () => round4(randn(rnd))));
  const C = [];
  for (let k = 0; k < S; k++) C.push(Array.from({ length: q }, () => round4(randn(rnd))));
  // 第 8 个响应故意把 **X 载荷**压到 0.2 倍（不压 Z 那条）：
  // 教用户看逐响应 R² 而不是只看整体 R² —— 降秩最容易出的事就是丢掉某个响应。
  const weak = 0.2;
  const Y = [];
  for (let i = 0; i < n; i++) {
    const latent = [0, 1, 2].map((s) => X[i].reduce((acc, x, j) => acc + x * A[j][s], 0));
    const row = [];
    for (let k = 0; k < q; k++) {
      const load = k === q - 1 ? weak : 1;
      const signal = latent.reduce((acc, lv, s) => acc + lv * C[s][k] * load, 0);
      row.push(round4(signal + 0.5 * Z[i] + 0.18 * randn(rnd)));
    }
    Y.push(row);
  }
  const ids = Array.from({ length: n }, (_, i) => `样本${i + 1}`);
  const withIds = (ids2, M, head) => [[head].concat(M[0].map((_, j) => `${head === 'X' ? 'X' : 'Y'}${j + 1}`))]
    .concat(M.map((row, i) => [ids2[i]].concat(row)));
  return [
    { name: '预测变量X', aoa: withIds(ids, X, 'X') },
    { name: '响应变量Y', aoa: withIds(ids, Y, 'Y') },
    {
      name: '协变量Z',
      aoa: [['Z', '批次Z1']].concat(ids.map((id, i) => [id, round4(Z[i])]))
    },
    {
      name: '模型参数',
      aoa: [['参数', '值'], ['ranks', '1,2,3,4,5'], ['lambdas', ''], ['kfold', '4'], ['seed', '12345']]
    }
  ];
}

/* ============================ 设计模板目录 ============================ */
/**
 * 只有一个模板，但 expect/spec 必须写：
 * 视图要能把"预期结论"摊在界面上，harness 要能拿它跟真跑结果对账。
 * 没有 expect 的模板等于"下载下来跑出什么算什么呢"—— 三个已上线模块都栽过这一条，
 * 所以这里从第一个模板起就把判据钉死。
 */
export const GMR4_TEMPLATE_GROUPS = [
  {
    id: 'teaching',
    name: '🎓 教学：多响应为什么要降秩',
    items: [
      {
        id: 'lowrank3',
        icon: '🧭',
        label: '真实秩 3（36 样本 × 5 预测 × 8 响应，含 1 协变量）',
        tip: '响应对是由 3 个潜在方向生成的：选型应回到 S=3；第 8 个响应的 X 载荷被故意压到 0.2，用来演示"整体好看但某个响应被降秩丢掉"',
        spec: {
          n: 36, p: 5, q: 8, trueRank: 3, covariates: 1, weakResponse: 8, seed: 12345, kfold: 4,
          expect: { rank_selected: 3, R2_partialled_min: 0.85, weak_response_max: 0.8 },
          note: '数据由确定性 LCG 合成（两次下载逐字节相同），不是实测数据'
        }
      }
    ]
  }
];

export const GMR4_TEMPLATE_MAP = GMR4_TEMPLATE_GROUPS.reduce((acc, g) => {
  g.items.forEach((it) => { acc[it.id] = { ...it, group: g.name }; });
  return acc;
}, {});

export const GMR4_TEMPLATE_COUNT = Object.keys(GMR4_TEMPLATE_MAP).length;

/* ============================ 小工具 ============================ */
function asMatrix(m) {
  if (!m) return [[]];
  if (Array.isArray(m) && Array.isArray(m[0])) return m;
  // jsonlite 把矩阵写成"列的列表"，视图拿到的可能是转置形状，这里统一成行优先
  const arr = Array.isArray(m) ? m : [m];
  return [arr];
}
function matrixToAoa(m, title) {
  const rows = asMatrix(m);
  if (rows.length === 1 && !Array.isArray(rows[0])) return [[title], rows];
  const nc = Math.max(...rows.map((r) => (Array.isArray(r) ? r.length : 1)));
  return [[title], ['\\列']].concat(
    Array.from({ length: nc }, (_, c) => [`列${c + 1}`].concat(rows.map((r) => (Array.isArray(r) ? r[c] : r))))
  );
}
function cvToAoa(cv) {
  if (!cv || !cv.mean) return [['CV 缺失']];
  const means = asMatrix(cv.mean);
  const ses = asMatrix(cv.se);
  const out = [['CV 均值（行=秩S，列=lambda）']];
  out.push(['S\\λ'].concat(means[0].map((_, j) => String(cv.lambda_grid ? cv.lambda_grid[j] : `λ${j + 1}`))));
  means.forEach((row, i) => out.push([String(cv.rank_grid ? cv.rank_grid[i] : `S${i + 1}`)].concat(row)));
  out.push([]);
  out.push(['CV 标准误（1-SE 规则的容差来源）']);
  ses.forEach((row, i) => out.push([`S${i + 1}`].concat(row)));
  if (cv.best) out.push([], ['CV 最小点', `S=${cv.best.rank}`, `λ=${cv.best.lambda}`, `CV=${cv.best.value}`]);
  return out;
}
