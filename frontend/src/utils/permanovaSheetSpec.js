/**
 * PERMANOVA（距离矩阵版）的导入/导出声明 —— L3 层。
 *
 * 这里只放"这个模块要哪几张表、能勾哪些导出项"，纯数据 + 纯函数：
 * 不碰 DOM、不 import file-saver、不 import vue。所以 Node 里能直接跑
 * test_pm_spec.mjs 断言"PCoA 表里坐标是真数""勾 5 项就出 5 个文件"。
 * 流程与对话框外观在 sheetIo.js（L1）和 components/r-analysis/*（L2）。
 *
 * 引擎契约（r-scripts/permanova.R）：
 *  - params$distanceMatrix：纯数值二维数组，不含样本名
 *  - params$sampleData：列字典 { 列名: [值…] }，**第一列必须是样本 ID**（R 里按位置取）
 *  - params$formula：字符串，sampleData 与 formula 必须同时给才会跑模型
 */

/** 主表是距离矩阵：样本顺序以它为准，样本数据表按 ID 重排对齐 */
export const PM_IMPORT_SHEETS = [
  {
    key: 'distance',
    label: '距离矩阵',
    kind: 'distance',
    required: true,
    aliasHint: '相异度矩阵 / distance',
    desc: '第一行与第一列是样本名，其余是距离值；必须对称、对角线为 0'
  },
  {
    key: 'sample',
    label: '样本数据',
    kind: 'sample',
    required: true,
    aliasHint: '样本信息 / sample data',
    desc: '第一列样本名要与距离矩阵一致，其余列是分组与协变量'
  },
  {
    key: 'formula',
    label: '模型公式',
    kind: 'formula',
    required: false,
    aliasHint: '公式 / formula',
    desc: '一格写 Y ~ Group + Age；不填就用表单里的公式'
  }
];

/**
 * 解析结果 -> 表单字段。距离矩阵与样本数据都会被 R 按位置使用，
 * 所以这里交给 R 的样本顺序一定是距离矩阵的顺序（fields.sample_aligned
 * 已由 mapWorkbook 按 ID 重排过，Excel 里排过序也不会错位）。
 */
export function pmToFormPatch(fields, ids) {
  const patch = {};
  const d = fields.distance;
  if (d && d.matrix) {
    patch.distanceMatrixStr = JSON.stringify(d.matrix, null, 2);
    patch.distanceMatrix = d.matrix;
  }
  const rows = fields.sample_aligned;
  if (rows && rows.length) {
    const cols = fields.sample_columns || [];
    const dict = { 样本: ids.slice() };
    cols.forEach((c) => { dict[c] = rows.map((r) => r[c]); });
    patch.sampleDataStr = JSON.stringify(dict, null, 2);
    patch.sampleData = dict;
    patch.sampleDataValid = true;
  }
  if (fields.formula && fields.formula.formula) patch.formula = fields.formula.formula;
  return patch;
}

/** 下载模板：4 张表，与旧版内容一致（表名不能改，改了用户手头的文件就废了） */
export function pmTemplateSheets() {
  return [
    ['距离矩阵', [
      ['样本', 'Sample1', 'Sample2', 'Sample3', 'Sample4', 'Sample5'],
      ['Sample1', 0.00, 0.35, 0.42, 0.28, 0.51],
      ['Sample2', 0.35, 0.00, 0.38, 0.45, 0.33],
      ['Sample3', 0.42, 0.38, 0.00, 0.52, 0.47],
      ['Sample4', 0.28, 0.45, 0.52, 0.00, 0.39],
      ['Sample5', 0.51, 0.33, 0.47, 0.39, 0.00]
    ]],
    ['样本数据', [
      ['样本', 'Group', 'Age', 'Weight'],
      ['Sample1', 'Control', 25, 65],
      ['Sample2', 'Control', 28, 68],
      ['Sample3', 'Treatment', 30, 70],
      ['Sample4', 'Treatment', 27, 66],
      ['Sample5', 'Control', 26, 67]
    ]],
    ['模型公式', [
      ['模型公式'],
      ['Y ~ Group + Age + Weight'],
      [''],
      ['公式说明：'],
      ['Y: 响应变量（距离矩阵）'],
      ['Group: 分组变量'],
      ['Age, Weight: 协变量'],
      ['使用 + 连接多个变量'],
      ['使用 * 表示交互作用，如 Group*Age']
    ]],
    ['填写说明', [
      ['PERMANOVA 分析模板填写说明'],
      [''],
      ['1. 距离矩阵（必需）：'],
      ['   - 第一行和第一列为样本名称，其余为距离值'],
      ['   - 必须为对称矩阵，对角线为 0'],
      ['   - 示例：Bray-Curtis 距离、Euclidean 距离'],
      [''],
      ['2. 样本数据（必需）：'],
      ['   - 第一列为样本名称，且必须与距离矩阵一致'],
      ['   - 样本数据可以按任意顺序排列，程序会按样本名对齐'],
      ['   - 其余列为变量（分组、协变量等）'],
      [''],
      ['3. 模型公式（可选）：'],
      ['   - 格式：Y ~ Group + Age + Weight'],
      ['   - 使用 + 连接多个变量，* 表示交互作用'],
      [''],
      ['导入时表名支持别名：距离矩阵 / 相异度矩阵 / distance，'],
      ['样本数据 / 样本信息 / sample data，模型公式 / 公式 / formula。']
    ]]
  ];
}

/** 可勾的导出项。label 与旧版逐字一致（肌肉记忆别动），文件名前缀也保持原样 */
export const PM_EXPORT_OPTIONS = [
  {
    key: 'json',
    label: '完整结果 (JSON)',
    type: 'json',
    base: 'PERMANOVA 结果',
    data: (ctx) => ctx.analysisResult
  },
  {
    key: 'permanovaTable',
    label: 'PERMANOVA 表格 (Excel)',
    type: 'xlsx',
    base: 'PERMANOVA 表',
    sheets: (ctx) => [{
      name: 'PERMANOVA',
      aoa: permRows(ctx.analysisResult)
    }]
  },
  {
    key: 'pcoaCoords',
    label: 'PCoA 坐标 (Excel)',
    type: 'xlsx',
    base: 'PCoA 坐标',
    sheets: (ctx) => [{
      name: 'PCoA 坐标',
      aoa: pcoaRows(ctx.analysisResult)
    }]
  },
  {
    key: 'chartPNG',
    label: '当前图表 (PNG)',
    type: 'png',
    base: '分析图表'
  },
  {
    key: 'input',
    label: '当前输入 (JSON)',
    type: 'json',
    base: 'PERMANOVA 输入',
    data: (ctx) => ({
      distanceMatrix: ctx.params.distanceMatrix,
      sampleData: ctx.params.sampleData,
      formula: ctx.params.formula,
      permutations: ctx.params.permutations
    })
  }
];

export const PM_EXPORT_DEFAULTS = ['json', 'permanovaTable'];

/** PERMANOVA 表：analysisResult.permanova_result 是对象数组，列名取并集保序 */
export function permRows(result) {
  const rows = (result && result.permanova_result) || [];
  if (!Array.isArray(rows) || !rows.length) return [['来源', '项', 'R2', 'F', 'p 值', '残差']];
  const cols = [];
  rows.forEach((r) => Object.keys(r).forEach((k) => { if (!cols.includes(k)) cols.push(k); }));
  return [cols.slice(), ...rows.map((r) => cols.map((c) => (r[c] === undefined || r[c] === null ? '' : r[c])))];
}

/** PCoA 坐标：列与旧版逐字一致（样本 ID / PCoA1 / PCoA2 / 分组 / 分组变量） */
export function pcoaRows(result) {
  const head = ['样本 ID', 'PCoA1', 'PCoA2', '分组', '分组变量'];
  const pcoa = result && result.pcoa;
  const samples = pcoa && Array.isArray(pcoa.samples) ? pcoa.samples : [];
  return [head, ...samples.map((s) => [
    s.sample_id,
    s.coordinates ? s.coordinates.PCoA1 : 0,
    s.coordinates ? s.coordinates.PCoA2 : 0,
    s.group || 'Unknown',
    s.group_variable || ''
  ])];
}

/**
 * 勾选 -> 任务表。视图只负责执行 IO。
 * @returns [{type:'xlsx',filename,sheets}|{type:'json',filename,data}|{type:'png',filename}]
 */
export function planExport(keys, ctx, stamp) {
  const picked = PM_EXPORT_OPTIONS.filter((o) => (keys || []).includes(o.key));
  const jobs = [];
  for (const opt of picked) {
    const ext = opt.type === 'png' ? 'png' : opt.type === 'json' ? 'json' : 'xlsx';
    const filename = `${opt.base}_${stamp}.${ext}`;
    if (opt.type === 'xlsx') jobs.push({ type: 'xlsx', filename, sheets: opt.sheets(ctx) });
    else if (opt.type === 'json') jobs.push({ type: 'json', filename, data: opt.data(ctx) });
    else jobs.push({ type: 'png', filename });
  }
  return jobs;
}
