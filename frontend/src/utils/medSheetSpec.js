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

/** 下载模板：表名与示例逐字保留（用户手头的文件靠这些名字） */
export function medTemplateSheets() {
  return [
    ['Outcome', [['样本 ID', 'Y1', 'Y2', 'Y3'], ['Sample1', 1.2, 3.4, 2.1], ['Sample2', 2.3, 4.5, 3.2]]],
    ['Mediator', [['样本 ID', 'M1', 'M2'], ['Sample1', 0.5, 1.2], ['Sample2', 0.7, 1.5]]],
    ['Predictor', [['样本 ID', 'X1'], ['Sample1', 1], ['Sample2', 0]]],
    ['Covariates', [['样本 ID', 'Age', 'BMI'], ['Sample1', 25, 22.5], ['Sample2', 30, 25.0]]],
    ['填写说明', [
      ['PERMANOVA-med 模板填写说明'],
      [''],
      ['四张表的样本 ID 必须一致（表名可写中文：结局Y / 中介M / 暴露X / 协变量Z）。'],
      ['样本数据可以按任意顺序排列，程序会按样本 ID 对齐；缺样本会拒绝导入。'],
      ['Outcome / Mediator 必须是数值；Predictor / Covariates 可以是分组文本。']
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
