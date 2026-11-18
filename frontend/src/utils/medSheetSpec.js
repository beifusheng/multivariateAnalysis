/**
 * PERMANOVA-med（中介效应）的导入/导出声明 —— L3 层，纯数据 + 纯函数。
 *
 * 引擎契约（r-scripts/permanova_med.R）：四张表都被 to_num_matrix() 转成
 * 「样本 × 变量」的行数组，**行序就是样本配对关系**。所以本模块最怕的不是
 * 报错，是 Y 和 M 的行序悄悄不一致：模型照跑、图照画、系数全废。
 * 这里统一按「结局 Y」表的样本 ID 对齐重排，顺序不一致就重排，缺样本就拒。
 */

export const MED_IMPORT_SHEETS = [
  {
    key: 'outcome', label: '结局 Y', kind: 'matrix', required: true, primary: true,
    names: ['结局Y', '结局', 'Y', 'Outcome', '响应'],
    desc: '第一列样本 ID，其余列是结局变量（Y1…Yk），数值'
  },
  {
    key: 'mediator', label: '中介 M', kind: 'matrix', required: true,
    names: ['中介M', '中介', 'M', 'Mediator', '微生物组', 'OTU'],
    desc: '与 Y 同样的样本，可以是丰度矩阵或距离矩阵'
  },
  {
    key: 'predictor', label: '暴露 X', kind: 'matrix', required: true,
    names: ['暴露X', '暴露', 'X', 'Predictor', '分组'],
    desc: '解释变量；可以是数值编码或分组文本'
  },
  {
    key: 'covariates', label: '协变量 Z', kind: 'matrix', required: false,
    names: ['协变量Z', '协变量', 'Z', 'Covariates', 'confounders'],
    desc: '可选；不放协变量就留空这张表'
  }
];

const toDict = (ids, aligned) => {
  const o = {};
  ids.forEach((id, i) => { o[id] = (aligned[i] || []).map((v) => (v === null || v === undefined ? null : v)); });
  return o;
};

/**
 * 解析结果 -> 表单四个 Str。键序一律取 Y 表的样本顺序，
 * 于是"在 Excel 里排过序"从统计学事故变成无关操作。
 */
export function medToFormPatch(fields, ids) {
  const patch = {};
  const put = (field, key) => {
    const f = fields[key];
    if (!f || !f.rows) return;
    patch[field] = JSON.stringify(toDict(ids, fields[key + '_aligned'] || f.rows), null, 2);
  };
  put('outcomeDataStr', 'outcome');
  put('mediatorDataStr', 'mediator');
  put('predictorDataStr', 'predictor');
  put('covariatesStr', 'covariates');
  if (!fields.covariates) patch.covariatesStr = '';
  return patch;
}

/** 形状隐患警告：字符串留在 X/Z 里是合法的，留在 Y/M 里引擎一定会骂 */
export function medWarnings(fields, ids) {
  const w = [];
  for (const [key, label] of [['outcome', '结局 Y'], ['mediator', '中介 M']]) {
    const f = fields[key];
    if (!f || !f.columns) continue;
    const aligned = fields[key + '_aligned'] || f.rows;
    const textCols = f.columns.filter((_, c) => aligned.some((row) => typeof (row || [])[c] === 'string'));
    if (textCols.length) w.push(`${label} 这些列含文本：${textCols.join(', ')}。引擎要的是数值矩阵，运行会失败，请先编码`);
  }
  const m = fields.mediator;
  if (m && m.columns && m.columns.length === 1 && ids.length > 0) {
    w.push('中介 M 只有 1 列：单变量中介可以跑，但"中介轴"的说法就名不副实了');
  }
  const missZ = !fields.covariates;
  if (missZ) w.push('没有协变量 Z 表：模型将不带协变量');
  return w;
}

/**
 * 下载模板：表名与示例数据。
 * 这份示例不只是格式说明——用户会真的导入它并点运行，所以必须能跑通：
 * 20 样本、协变量带小数（避免被当成多水平因子吃掉自由度）。
 * 实测（便携版 R + permanova_med.R, permutations=100）：success=true、中介 p<0.05。
 */
export function medTemplateSheets() {
  return [
    ['Outcome', [
        ['样本 ID', 'Y1', 'Y2', 'Y3'],
        ['Sample1', 6.64, 4.8, 2.8],
        ['Sample2', 6.53, 5.85, 3.16],
        ['Sample3', 6.79, 4.74, 2.7],
        ['Sample4', 6.43, 5.35, 2.82],
        ['Sample5', 6.79, 4.79, 3.61],
        ['Sample6', 6.47, 4.74, 3.14],
        ['Sample7', 6.19, 5.05, 2.49],
        ['Sample8', 6.51, 4.71, 3.13],
        ['Sample9', 6.03, 4.01, 3.44],
        ['Sample10', 6.33, 4.11, 3.38],
        ['Sample11', 3.54, 6.02, 2.99],
        ['Sample12', 4.46, 7.32, 3.2],
        ['Sample13', 4.55, 6.91, 3.69],
        ['Sample14', 4.56, 7.3, 2.7],
        ['Sample15', 3.64, 6.95, 3.68],
        ['Sample16', 3.71, 6.38, 3.56],
        ['Sample17', 4.14, 6.81, 3.46],
        ['Sample18', 4.35, 7.46, 3.66],
        ['Sample19', 4.29, 8.21, 3.48],
        ['Sample20', 3.53, 8.05, 2.79]
    ]],
    ['Mediator', [
        ['样本 ID', 'M1', 'M2', 'M3', 'M4'],
        ['Sample1', 7.22, 5.9, 7.59, 3.71],
        ['Sample2', 6.9, 7.14, 6.65, 3.18],
        ['Sample3', 7.81, 6.55, 7.16, 3],
        ['Sample4', 7.52, 6.64, 6.71, 3.08],
        ['Sample5', 7.21, 6, 6.2, 3.49],
        ['Sample6', 7.33, 6.45, 7.06, 2.55],
        ['Sample7', 6.92, 6.6, 6.9, 2.54],
        ['Sample8', 7.09, 6.27, 7.49, 1.87],
        ['Sample9', 6.32, 6.24, 7.19, 2.89],
        ['Sample10', 7.36, 5.67, 6.94, 3.3],
        ['Sample11', 4.03, 8.61, 5.84, 2.62],
        ['Sample12', 4.26, 9.61, 5.3, 1.9],
        ['Sample13', 5.32, 10.22, 4.93, 1.94],
        ['Sample14', 5.06, 9.93, 5.9, 2],
        ['Sample15', 4.22, 9.54, 4.78, 3.71],
        ['Sample16', 4.12, 8.95, 5.91, 3.22],
        ['Sample17', 4.49, 9.77, 6.06, 2.31],
        ['Sample18', 4.06, 9.24, 4.96, 2.49],
        ['Sample19', 4.19, 10.39, 5.83, 3.01],
        ['Sample20', 3.67, 10.56, 5.49, 2.86]
    ]],
    ['Predictor', [
        ['样本 ID', 'X1'],
        ['Sample1', 1],
        ['Sample2', 1],
        ['Sample3', 1],
        ['Sample4', 1],
        ['Sample5', 1],
        ['Sample6', 1],
        ['Sample7', 1],
        ['Sample8', 1],
        ['Sample9', 1],
        ['Sample10', 1],
        ['Sample11', 0],
        ['Sample12', 0],
        ['Sample13', 0],
        ['Sample14', 0],
        ['Sample15', 0],
        ['Sample16', 0],
        ['Sample17', 0],
        ['Sample18', 0],
        ['Sample19', 0],
        ['Sample20', 0]
    ]],
    ['Covariates', [
        ['样本 ID', 'Age', 'BMI'],
        ['Sample1', 28.3, 21.94],
        ['Sample2', 30.3, 23.21],
        ['Sample3', 30.8, 25],
        ['Sample4', 32.2, 26.12],
        ['Sample5', 34.6, 21.26],
        ['Sample6', 35, 24.29],
        ['Sample7', 35.7, 24.22],
        ['Sample8', 37.8, 26.75],
        ['Sample9', 39.9, 20.96],
        ['Sample10', 38.7, 23.21],
        ['Sample11', 40.1, 24.92],
        ['Sample12', 42.5, 26.5],
        ['Sample13', 44.9, 21.67],
        ['Sample14', 44.7, 22.23],
        ['Sample15', 45.8, 25.31],
        ['Sample16', 47.9, 25.95],
        ['Sample17', 48.2, 21.07],
        ['Sample18', 50.5, 22.44],
        ['Sample19', 51.4, 24.04],
        ['Sample20', 53.1, 26.45]
    ]],
    ['填写说明', [
      ['PERMANOVA-med 模板填写说明'],
      [''],
      ['四张表的样本 ID 必须一致（表名可写中文：结局Y / 中介M / 暴露X / 协变量Z）。'],
      ['样本数据可以按任意顺序排列，程序会按样本 ID 对齐；缺样本会拒绝导入。'],
      ['Outcome / Mediator 必须是数值；Predictor / Covariates 可以是分组文本。'],
      [''],
      ['样本数：至少 6 个（LDM 实测下限，n<=4 直接崩、n=5 会随机崩），建议 20 个以上。'],
      ['本示例的 20 个样本是「下载模板 → 导入 → 运行」实测跑通过的（中介 p<0.05），可以直接点运行。'],
      ['连续变量请带小数（如年龄写 28.3）或先分成少数几档。'],
      ['   逐行写成 28/29/30… 这种整数值会被当成多水平因子，自由度被吃光后 LDM 会失败。'],
      ['置换次数需要是 100 的整数倍（LDM 内部按 100 一块分批，不是整数倍会数组越界）。']
    ]]
  ];
}

/** 分组置换检验（LDM 的真实输出） */
export function covariateRows(result) {
  const head = ['协变量组', '公式项', 'F统计量', 'R2', 'p值'];
  const list = (result && result.covariate_tests) || [];
  if (!list.length) return [head, ['说明：本次结果无分组检验数据']];
  return [head, ...list.map((t) => [t.term, t.label, num(t.F_statistic), num(t.R2), num(t.p_value)])];
}

/** 路径分解 */
export function pathRows(p) {
  const head = ['路径', '估计', 'p值', 'CI下', 'CI上'];
  if (!p) return [head, ['说明：本次结果无路径分解数据（请更新 r-scripts/permanova_med.R）']];
  const ci = (x) => (Array.isArray(x) ? [num(x[0]), num(x[1])] : [null, null]);
  const rows = [
    ['a: X → M轴', num(p.a), num(p.a_p), ...ci(p.a_ci)],
    ['b: M轴 → Y｜X', num(p.b), num(p.b_p), ...ci(p.b_ci)],
    ["c': X → Y｜M轴", num(p.c_prime), num(p.c_prime_p), ...ci(p.c_prime_ci)],
    ['间接效应 a×b', num(p.indirect), null, ...ci(p.indirect_ci)],
    ['总效应', num(p.total), num(p.total_p), null, null],
    ['中介比例', num(p.proportion_mediated), null, null, null]
  ];
  return [head, ...rows];
}

const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? (v ?? null) : Number(v));

export const MED_EXPORT_OPTIONS = [
  { key: 'json', label: '完整结果 (JSON)', type: 'json', base: 'PERMANOVA-med 结果', data: (ctx) => ctx.analysisResult },
  {
    key: 'globalEffect', label: '分组置换检验 (Excel)', type: 'xlsx', base: '分组置换检验',
    sheets: (ctx) => [{ name: 'Covariate_Tests', aoa: covariateRows(ctx.analysisResult) }]
  },
  {
    key: 'mediatorEffects', label: '路径分解 (Excel)', type: 'xlsx', base: '路径分解',
    sheets: (ctx) => [{ name: 'Path_Decomposition', aoa: pathRows(ctx.pathData) }]
  },
  { key: 'chartPNG', label: '当前图表 (PNG)', type: 'png', base: '分析图表' },
  {
    key: 'input', label: '当前输入 (JSON)', type: 'json', base: 'PERMANOVA-med 输入',
    data: (ctx) => ctx.params
  }
];

export const MED_EXPORT_DEFAULTS = ['json', 'globalEffect', 'mediatorEffects', 'chartPNG'];

export function planExport(keys, ctx, stamp) {
  const jobs = [];
  for (const opt of MED_EXPORT_OPTIONS.filter((o) => (keys || []).includes(o.key))) {
    const ext = opt.type === 'png' ? 'png' : opt.type === 'json' ? 'json' : 'xlsx';
    const filename = `${opt.base}_${stamp}.${ext}`;
    if (opt.type === 'xlsx') jobs.push({ type: 'xlsx', filename, sheets: opt.sheets(ctx) });
    else if (opt.type === 'json') jobs.push({ type: 'json', filename, data: opt.data(ctx) });
    else jobs.push({ type: 'png', filename });
  }
  return jobs;
}
