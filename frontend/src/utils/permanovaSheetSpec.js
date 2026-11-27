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
 *  - params$sampleData：列字典 { 列名: [值…] }，**第一列约定放样本 ID**（要与距离矩阵同序）。
 *    注意这是**约定不是规则**：R 按取值判断（逐样本唯一才算 ID）。
 *    第一列若是只有几个水平的分组列（如实机里的 Habitat），它会被当普通分组列建模 ——
 *    上一版按位置硬判，把这种列拒了，而拒单理由说的还是假的。
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
  // 这份示例会被用户真的导入并点「运行」，所以它必须跑得通、而且要跑出显著结果：
  // 8 样本 × 两组各 4，组内 Bray-Curtis 0.05~0.10、组间 0.32~0.48，
  // 实测（permanova.R, permutations=999, seed=7）p=0.01、F=42.7、R2=0.97。
  // Age / BMI 故意在两群之间重叠：模板不该顺手演示一个完全混杂的设计。
  return [
    ['距离矩阵', [
      ['样本', 'Sample1', 'Sample2', 'Sample3', 'Sample4', 'Sample5', 'Sample6', 'Sample7', 'Sample8'],
      ['Sample1', 0, 0.10, 0.09, 0.05, 0.39, 0.44, 0.48, 0.41],
      ['Sample2', 0.10, 0, 0.08, 0.06, 0.32, 0.37, 0.42, 0.34],
      ['Sample3', 0.09, 0.08, 0, 0.05, 0.38, 0.43, 0.48, 0.41],
      ['Sample4', 0.05, 0.06, 0.05, 0, 0.35, 0.40, 0.44, 0.37],
      ['Sample5', 0.39, 0.32, 0.38, 0.35, 0, 0.05, 0.08, 0.09],
      ['Sample6', 0.44, 0.37, 0.43, 0.40, 0.05, 0, 0.06, 0.08],
      ['Sample7', 0.48, 0.42, 0.48, 0.44, 0.08, 0.06, 0, 0.08],
      ['Sample8', 0.41, 0.34, 0.41, 0.37, 0.09, 0.08, 0.08, 0]
    ]],
    ['样本数据', [
      ['样本', 'Group', 'Age', 'BMI'],
      ['Sample1', 'Control', 31.3, 22.8],
      ['Sample2', 'Control', 43.9, 25.6],
      ['Sample3', 'Control', 36.6, 27.1],
      ['Sample4', 'Control', 48.1, 23.4],
      ['Sample5', 'Treatment', 33.7, 26.2],
      ['Sample6', 'Treatment', 45.1, 22.9],
      ['Sample7', 'Treatment', 38.6, 24.7],
      ['Sample8', 'Treatment', 41.2, 25.1]
    ]],
    ['模型公式', [
      ['模型公式'],
      ['Y ~ Group + Age + BMI'],
      [''],
      ['公式说明：'],
      ['Y: 响应变量（写成 Y 即可，程序用距离矩阵代替它）'],
      ['Group: 待检验的分组变量（请写文本，如 Control / Treatment）'],
      ['Age, BMI: 连续协变量，从组间差异里扣掉'],
      ['使用 + 连接多个变量'],
      ['使用 * 表示交互作用，如 Group*Age'],
      [''],
      ['注意：0/1 编码的分组会被当成连续变量处理，分组请写成文本']
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
    // 这里原本调 permRows()：把引擎返回对象的键直接拍成表头（Df / R2 / F_model / _row），
    // 导出一张英文字段名的孤钉表；而 pmResultSheets() 写好的中文表头、分项检验与
    // 「怎么读」说明表从未被引用 —— 写了但没接上，GUI 逐格对比才把它扒出来。
    sheets: (ctx) => pmResultSheets(ctx.analysisResult, { stampText: ctx.stampText, formula: ctx.formula })
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
// permRows() 已删除：它把引擎对象的键拍成表头（Df / R2 / F_model / _row），
// 导出一张英文字段名的孤钉表，且永远不会带分项检验与说明表。
// GUI 逐格对比查出来后，导出改用 pmResultSheets()；留着死函数只会让下个人又接错。

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

/**
 * 事后检验（pairwise PERMANOVA）的列定义与表内容。
 *
 * 为什么单独立到这里：这些列以前在视图里就地拼，而上一版的「校正 p 值」列填的其实是
 * 原始 p（旁边写着 TODO: 实现 FDR/Bonferroni 校正），p 本身来自 Math.random()。
 * 列名与口径写进 spec，测试就能不渲染界面直接核对「表头说的」与「R 给的」是否同一件事。
 */
export const PM_POSTHOC_COLUMNS = [
  '比较组 1', '比较组 2', 'n1', 'n2',
  '组内平均距离 1', '组内平均距离 2', '组间平均距离',
  'pseudo-F', 'R²', 'p（置换）', 'p（BH）', 'p（Bonferroni）',
  '显著性', '置换口径', 'p 分辨率下限'
];

export function pmPosthocAoA(posthocResult) {
  const rows = (posthocResult?.comparisons || []).map((c) => [
    c.group1, c.group2, c.n1, c.n2,
    c.mean_within_1, c.mean_within_2, c.mean_between,
    c.F, c.R2, c.p, c.p_bh, c.p_bonferroni,
    c.significance,
    c.exact ? `精确（${c.n_perm_used} 个划分）` : `随机 ${c.n_perm_used} 次`,
    c.p_floor
  ]);
  return [PM_POSTHOC_COLUMNS].concat(rows);
}

/**
 * 事后检验工作簿的两张表：数据表 + 说明表。
 * 说明表必须把口径写死在文件里 —— 拿到 xlsx 的人不在界面前，看不到星号跟哪一列走。
 */
export function pmPosthocSheets(posthocResult, ctx = {}) {
  const cs = posthocResult?.comparisons || [];
  const info = [
    ['事后检验结果导出'],
    ['导出时间', ctx.stampText || ''],
    ['检验方法', posthocResult?.method || 'pairwise PERMANOVA（每组对子独立置换 pseudo-F）'],
    ['显著性口径（本次）', ctx.primaryLabel || 'BH (FDR)'],
    ['p 值来源', 'R 脚本 r-scripts/permanova_posthoc.R：对每对组独立置换，视图不参与任何统计计算'],
    ['BH 与 Bonferroni', '两列同时给出；两者结论不同的对子最该被看见，不由软件替读者决定'],
    ['穷举精确的对子数', `${posthocResult?.exactCount || 0} / ${cs.length}`],
    ['随机置换次数', posthocResult?.permutations ?? ''],
    ['种子', posthocResult?.seed ?? ''],
    [],
    ['怎么读这张表'],
    ['p（置换）', '该对子两组 PERMANOVA 的置换 p；随机置换的下限是 1/(次数+1)'],
    ['p 分辨率下限', '本行 p 能表示的最小值。等于它时只能说"至少这么小"，不能说"绝对显著"'],
    ['pseudo-F / R²', 'Anderson (2001) 的距离平方和分解，与 vegan::adonis2 同一口径'],
    ['组内/组间平均距离', '原始距离尺度（不是平方），用来目视核对 F 的方向是否合理'],
    ...(posthocResult?.diagnostics || []).length
      ? [[], ['诊断'], ...(posthocResult.diagnostics || []).map((d) => [d])]
      : []
  ];
  return [
    { name: '事后检验', aoa: pmPosthocAoA(posthocResult) },
    { name: '说明', aoa: info }
  ];
}

export function pmPosthocFilename(stamp) {
  return `PERMANOVA 事后检验_${stamp}.xlsx`;
}

/**
 * 主结果表与 PCoA 坐标表的列定义。
 * 以前这两张表在视图里用 XLSX.utils.json_to_sheet 直接拍平对象数组：
 * 列名由 R 的字段名决定（`_row`、F_model），顺序随 JSON 键序漂，也没人能对账。
 * 搬到 spec 之后，列名、顺序、缺值处理都在这里定一次，测试可以直接读。
 */
export const PM_RESULT_COLUMNS = ['项', 'Df', 'SumOfSqs', 'R²', 'F', 'p 值'];

/**
 * 行名对照表：导出与界面必须用同一份，否则拿 xlsx 的人看到 Model/Residual，
 * 而在界面上看到的是「整模型（所有项合起来）/残差」—— 同一行两个名字最坑人。
 */
export const PM_ROW_LABELS = { Model: '整模型（所有项合起来）', Residual: '残差', Total: '总计' };
export const pmRowLabel = (r, i) => PM_ROW_LABELS[(r && (r._row || r.row || r.term)) || ''] ||
  (r && (r._row || r.row || r.term)) || r && r.Variable || ('项 ' + (i + 1));

export function pmResultAoA(result) {
  const rows = (result && result.permanova_result) || [];
  return [PM_RESULT_COLUMNS].concat(rows.map((r, i) => [
    pmRowLabel(r, i),
    r.Df, r.SumOfSqs, r.R2,
    r.F_model != null ? r.F_model : r.F,
    r.p_value != null ? r.p_value : ''
  ]));
}

export function pmPcoaAoA(result) {
  const samples = (result && result.pcoa && result.pcoa.samples) || [];
  return [['样本 ID', 'PCoA1', 'PCoA2', '分组', '分组变量']].concat(samples.map((s) => [
    s.sample_id || '',
    (s.coordinates && s.coordinates.PCoA1) != null ? s.coordinates.PCoA1 : 0,
    (s.coordinates && s.coordinates.PCoA2) != null ? s.coordinates.PCoA2 : 0,
    s.group || 'Unknown',
    s.group_variable || ''
  ]));
}

/**
 * 主结果工作簿。说明表里必须写明"这张表只有整模型一行"这件事 ——
 * 多因子公式下用户最想知道的是"哪个变量显著"，而 by=NULL 的 adonis2 不给。
 * 不说，用户会把 Model 那行读成"第一个变量的结果"。
 */
export function pmResultSheets(result, ctx = {}) {
  const rows = (result && result.permanova_result) || [];
  const terms = (result && result.per_term) || [];
  const info = [
    ['PERMANOVA 结果导出'],
    ['导出时间', ctx.stampText || ''],
    ['模型公式', ctx.formula || ''],
    ['置换次数', result?.permutations ?? ''],
    ['整模型', `R²=${result?.R2 ?? ''}，F=${result?.F_model ?? ''}，p=${result?.p_value ?? ''}`],
    [],
    ['怎么读这张表'],
    ['Model / Residual / Total', '整模型的分解三行。Model 行是**所有项合起来**的检验，不是第一个变量的'],
    [terms.length ? 'per_term' : '⚠ 本模块不分项', terms.length
      ? '每个公式项的边际检验在 per_term 表里（各列独立置换）'
      : '这次运行没有分项结果：多因子公式下"哪个变量显著"看不出来。若表里只有 Model 行，别把它当分组变量的结果'],
    ['p 值下限', '随机置换的 p 不低于 1/(次数+1)；等于它只能说明"至少这么小"']
  ];
  const sheets = [
    { name: 'PERMANOVA', aoa: pmResultAoA(result) },
    { name: '说明', aoa: info }
  ];
  if (terms.length) {
    sheets.splice(1, 0, {
      name: '分项检验',
      aoa: [['公式项', 'Df', 'SumOfSqs', 'R²', 'F', 'p 值']].concat(terms.map((t) => [
        t.term || '', t.Df, t.SumOfSqs, t.R2, t.F != null ? t.F : t.F_model,
        t.p_value != null ? t.p_value : ''
      ]))
    });
  }
  return sheets;
}

export function pmPcoaSheets(result) {
  return [{ name: 'PCoA 坐标', aoa: pmPcoaAoA(result) }];
}

export function pmResultFilename(stamp) { return `PERMANOVA 表_${stamp}.xlsx`; }
export function pmPcoaFilename(stamp) { return `PCoA 坐标_${stamp}.xlsx`; }
