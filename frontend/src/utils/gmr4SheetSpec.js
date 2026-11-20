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
    // ranks/lambdas 是给"程序化取参数"用的数组；表单认的是字符串字段 ranksStr/lambdasStr。
    // 只发数组的话 Object.assign(this.form, patch) 写进了表单里不存在的属性，
    // 导入后界面参数框永远是空的（用户报的「填入表单没反应」的第二半）。
    patch.ranksStr = String(kv.ranks || '');
    patch.lambdasStr = String(kv.lambdas || '');
    if (kv.kfold) patch.kfold = nums(kv.kfold)[0];
    if (kv.seed) patch.seed = nums(kv.seed)[0];
  }
  return patch;
}

/* ==================== 设计模板：生成器 + 目录 ==================== */
/**
 * 一个可复现的"设计"由这些量决定：样本数 n、变量数 p、响应数 q、**真实秩 S**、
 * 协变量强度（对 X 与对 Y 分别给）、噪声、以及是否故意把某个响应的载荷压弱。
 *
 * 每个模板都必须带 expect，而且 expect 是**先用真 R 跑出来的事实**，不是愿望：
 * 没有 expect 的模板等于"下载下来跑出什么算什么"，三个已上线模块都在这上面翻过车。
 * 随机源是 LCG（seed 决定一切），所以两次下载逐字节相同。
 */
/* 确定性伪随机：模板每次下载必须逐字节相同，否则"下载→导入→运行→对答案"
   这条回归链路自己就先漂了（Math.random 在这里绝对不能用）。 */
function lcg(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
function randn(rnd) {
  // Box-Muller：两个均匀数换一个正态数
  let u = 0; let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const round4 = (x) => Math.round(x * 1e4) / 1e4;

function buildGmr4Design(spec) {
  const rnd = lcg(spec.seed);
  const { n, p, q, S } = spec;
  const zX = spec.zOnX == null ? 0.8 : spec.zOnX;
  const zY = spec.zOnY == null ? 0.5 : spec.zOnY;
  const noise = spec.noise == null ? 0.18 : spec.noise;
  // "弱响应"靠压载荷是做不出来的：0.2 倍强信号仍然远大于噪声（实测 R²=0.97）。
  // 真要做一个"几乎不被 X 解释"的响应，得放大它自己的噪声。
  const noisyAt = spec.noisyResponse ? spec.noisyResponse - 1 : -1;
  const noiseMul = spec.noiseMul == null ? 25 : spec.noiseMul;

  const Z = Array.from({ length: n }, () => randn(rnd));
  const X = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < p; j++) row.push(round4(randn(rnd) + zX * Z[i]));
    X.push(row);
  }
  const A = [];
  for (let j = 0; j < p; j++) A.push(Array.from({ length: S }, () => round4(randn(rnd))));
  const C = [];
  for (let k = 0; k < S; k++) C.push(Array.from({ length: q }, () => round4(randn(rnd))));
  const Y = [];
  for (let i = 0; i < n; i++) {
    const latent = [];
    for (let t = 0; t < S; t++) {
      let acc = 0;
      for (let j = 0; j < p; j++) acc += X[i][j] * A[j][t];
      latent.push(acc);
    }
    const row = [];
    for (let k = 0; k < q; k++) {
      let signal = 0;
      for (let t = 0; t < S; t++) signal += latent[t] * C[t][k];
      row.push(round4(signal + zY * Z[i] + noise * (k === noisyAt ? noiseMul : 1) * randn(rnd)));
    }
    Y.push(row);
  }
  const ids = Array.from({ length: n }, (_, i) => `样本${i + 1}`);
  return { X, Y, Z, ids };
}

export const GMR4_TEMPLATE_GROUPS = [
  {
    id: 'teaching', name: '🎓 教学：降秩在做什么',
    items: [
      {
        id: 'lowrank3', icon: '🧭', label: '真实秩 3（36 样本 × 5 预测 × 8 响应 + 1 协变量）',
        tip: '8 个响应由 3 个潜在方向生成，选型应回到 S=3；第 8 个响应的 X 载荷被压到 0.2，用来看「整体好看但某个响应被丢掉」',
        // 弱响应靠「放大该响应的噪声」做，不是压 X 载荷：0.2 倍强信号仍远大于噪声，
        // 实测 R²=0.97，完全看不出弱。下面这组数字是 gmr4.R 的真跑值（2026-11-19）：
        // S=3、R²偏后=0.933、Y8=0.602、其余最小 0.989。
        spec: { n: 36, p: 5, q: 8, S: 3, seed: 12345, kfold: 4, noisyResponse: 8, noiseMul: 25,
          lambdas: '0.01,0.1,0.5,1,5,20',
          expect: { rank_selected: 3, R2_partialled_min: 0.85, weak_response_max: 0.8, weak_response_index: 8, covariates: 1 },
          note: '确定性合成数据（非实测）' }
      },
      {
        id: 'rank1', icon: '📏', label: '真实秩 1（80 样本 × 4 预测 × 6 响应）：所有响应共享一条轴',
        tip: '只有一个潜在方向。此时「载荷双标图」画不出来（只有一维），视图必须明说而不是给张空图',
        // 真跑实测：n=40、6 档 lambda -> S=1、R²偏后=0.959。
        // 只给 4 档时选型会落到 S=2（该秩下没有够好的 λ）—— 网格粗细改变结论，
        // 这种事实必须写在这里，不然下次有人改默认网格，模板就不教它声称的东西了。
        spec: { n: 40, p: 4, q: 6, S: 1, seed: 20261, kfold: 4, lambdas: '0.01,0.1,0.5,1,5,20',
          expect: { rank_selected: 1, R2_partialled_min: 0.9, covariates: 0 },
          note: '秩 1 是双标图为空的唯一正常情形' }
      }
    ]
  },
  {
    id: 'traps', name: '⚠️ 陷阱：什么时候降秩帮不上忙',
    items: [
      {
        id: 'fullrank', icon: '🧱', label: '真实秩=满秩（40 样本 × 4 预测 × 4 响应）：没有可降的秩',
        tip: 'B 本身就是满秩 4。选型应落在 S=4 并明确告诉你「降秩没带来 CV 收益」—— 这类数据用岭回归就够了',
        spec: { n: 40, p: 4, q: 4, S: 4, seed: 777, kfold: 4, lambdas: '0.01,0.1,1,10',
          expect: { rank_selected: 4, diag_pattern: '降秩没带来', R2_partialled_min: 0.5, covariates: 0 },
          note: 'expect 里带 diag_pattern：诊断没出来说明选型在骗你' }
      },
      {
        id: 'confoundedZ', icon: '🌫️', label: '强混杂（36 样本 × 4 预测 × 6 响应，Z 同时驱动 X 与 Y）',
        tip: 'Z 对 X、Y 都有强效应。带上 Z 会被偏掉（Frisch–Waugh）；不带 Z 时系数会被混杂抬高',
        spec: { n: 36, p: 4, q: 6, S: 2, seed: 4242, kfold: 4, zOnX: 1.6, zOnY: 1.8, noise: 0.2,
          lambdas: '0.01,0.1,1,10',
          expect: { rank_selected: 2, covariates: 1, R2_partialled_min: 0.7 },
          note: '这个模板专门演示「协变量不是多加一列」' }
      }
    ]
  },
  {
    id: 'stress', name: '🧪 压力：样本不够 / 响应比变量多',
    items: [
      {
        id: 'smallN', icon: '🤏', label: '样本不比变量多（8 样本 × 8 预测 × 5 响应）',
        tip: 'n ≤ p：X\'X+λI 在 λ 小时接近奇异，选型不稳。引擎照样出数，但必须把这条警告摊开',
        // 真跑实测：n=8、p=8（**合法方阵**，不是距离矩阵）会给出
        // 「样本数 8 不大于预测变量数 8」这条诊断，R²偏后=0.451。
        // 这里故意**不写 rank_selected**：秩在这种设计里本身就不具信息，
        // 拿它当期望等于把一个不可靠的量供成“答案”。
        spec: { n: 8, p: 8, q: 5, S: 2, seed: 99, kfold: 4, lambdas: '0.1,1,10',
          expect: { diag_pattern: '不大于预测变量数', covariates: 0 },
          note: '小样本模板的价值在于让警告可见，而不是给出漂亮结果' }
      },
      {
        id: 'manyResp', icon: '🐆', label: '响应远多于变量（30 样本 × 3 预测 × 9 响应）',
        tip: 'min(p,q)=3：秩的天花板由预测变量数决定，响应再多也只能共享 3 个方向。上限情形应当被说出来',
        spec: { n: 30, p: 3, q: 9, S: 3, seed: 6060, kfold: 4, lambdas: '0.01,0.1,1,10',
          expect: { rank_selected: 3, diag_pattern: '降秩没带来', R2_partialled_min: 0.7, covariates: 0 },
          note: 'S=s_max 时「降秩」其实没发生，别把 R² 当成降秩的功劳' }
      }
    ]
  }
];

export const GMR4_TEMPLATE_MAP = GMR4_TEMPLATE_GROUPS.reduce((acc, g) => {
  g.items.forEach((it) => { acc[it.id] = { ...it, group: g.name }; });
  return acc;
}, {});

export const GMR4_TEMPLATE_COUNT = Object.keys(GMR4_TEMPLATE_MAP).length;

/** 模板工作簿：不传 id 用第一个设计；选了别的就按别的出（同源，杜绝两处各写一份数据） */
export function gmr4TemplateSheets(id) {
  const key = id || GMR4_TEMPLATE_GROUPS[0].items[0].id;
  const tpl = GMR4_TEMPLATE_MAP[key];
  if (!tpl) throw new Error(`未知 GMR4 设计模板：${id}`);
  const sp = tpl.spec;
  const { X, Y, Z, ids } = buildGmr4Design(sp);
  const withIds = (M, head) => [[head].concat(M[0].map((_, j) => `${head}${j + 1}`))]
    .concat(M.map((row, i) => [ids[i]].concat(row)));
  const zSheet = sp.expect.covariates
    ? { name: '协变量Z', aoa: [['Z', 'Z1']].concat(ids.map((sid, i) => [sid, round4(Z[i])])) }
    : null;   // 没有协变量就不发这张表：两行的"说明表"会被解析成 1 行数据
  return [
    { name: '预测变量X', aoa: withIds(X, 'X') },
    { name: '响应变量Y', aoa: withIds(Y, 'Y') },
    ...(zSheet ? [zSheet] : []),
    { name: '模型参数', aoa: [['参数', '值'], ['ranks', String(sp.ranks || '')],
      ['lambdas', String(sp.lambdas || '')], ['kfold', String(sp.kfold)], ['seed', String(sp.seed)]] }
  ];
}

/**
 * 导入预览 tab —— 不能用 sheetIo.previewFromFields：那个函数是给**群落矩阵**写的
 * （内部 `if (primary.matrix && primary.species)` 才 push tab），GMR⁴ 的 fields.X 是
 * 行优先的 {ids, headers, rows}，传进去只会得到空数组 —— 于是导入对话框既不显示数据，
 * 「填入表单」按钮又被 `:disabled="!tabs.length"` 按住，看上去像两个 bug，其实是一个。
 *
 * ImportDialog 的契约：每个 tab 需要 { name, label, cols, rows }，且 rows 必须是
 * **以 cols 为键的对象数组**（它用 :prop="colKey(c)" 取值），二维数组喂进去是空表。
 */
export function gmr4ImportTabs(ids, fields) {
  const tabs = [];
  const push = (key, name, label) => {
    const f = fields[key];
    if (!f || !f.rows || !f.rows.length) return;
    // mapWorkbook 的真实形状是 { ok, ids, columns, rows } —— 表头键名是 columns。
    // 上一版按 fields.X_columns / f.headers 去取，两处都取不到，于是 cols 只剩
    // "样本"一列、每一行都是 {样本:'样本1'}，表格看着就是空的（数据明明在 rows 里）。
    const cols = f.columns || [];
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
  push('X', 'gmr4_x', '预测变量 X');
  push('Y', 'gmr4_y', '响应变量 Y');
  push('Z', 'gmr4_z', '协变量 Z');
  const kv = (fields.params && fields.params.kv) || fields.kv;
  if (kv && Object.keys(kv).length) {
    tabs.push({
      name: 'gmr4_params',
      label: '模型参数（ranks / lambdas / kfold / seed）',
      cols: ['参数', '值'],
      rows: Object.keys(kv).map((k) => ({ 参数: k, 值: String(kv[k]) }))
    });
  }
  return tabs;
}

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
