/**
 * Non-random PERMANOVA 的表格声明（L3：只有业务差异，没有 UI）
 * ---------------------------------------------------------------
 * 约定：这里必须是**纯数据 + 纯函数**。
 *  - 导入用 NR_IMPORT_SHEETS 描述"要哪几张表"，视图照着循环解析，不再手写三段一样的代码；
 *  - 导出用 NR_EXPORT_OPTIONS 描述"能勾哪些项"，每项的 build() 只吃 ctx、只返回数据，
 *    不碰 DOM、不 import file-saver —— 这样"导出内容对不对"能在 Node 里直接断言
 *    （以前这段写在视图 methods 里，只能靠人肉点开 Excel 看，等于没测）。
 *
 * ctx（由视图组装，字段都是真结果里的）：
 *   { r, analysisResult, cd, payload, verdict, interpretation, permInfo, modelInfo, templateLabel }
 */

/** 导入需要的工作表。kind 对应 sheetIo 的解析器；aliases 只在提示文案里用 */
export const NR_IMPORT_SHEETS = [
  {
    key: 'community',
    label: '物种矩阵',
    kind: 'community',
    required: true,
    aliasHint: '群落矩阵 / 丰度矩阵 / OTU表 / community / abundance',
    desc: '第一列样本 ID，其余每列一个物种的丰度'
  },
  {
    key: 'sample',
    label: '样本信息',
    kind: 'sample',
    required: true,
    aliasHint: '样本数据 / 分组信息 / metadata / sample',
    desc: '第一列样本 ID，其余为分组/区组变量，必须都是因子（连续变量请先分箱）'
  },
  {
    key: 'coordinate',
    label: '坐标',
    kind: 'coordinate',
    required: false,
    aliasHint: '空间坐标 / 经纬度 / coordinate / xy',
    desc: '只有选择「空间受限置换」时才需要，两列 x/y'
  }
];

/** 预览里的 tab 顺序与列宽策略（外壳只按这个数组摆 tab） */
export const NR_PREVIEW_TABS = [
  { key: 'community', labelOf: (p) => `物种矩阵（${p.n} 样本 × ${p.p} 物种）` },
  { key: 'sample', labelOf: (p) => `样本信息（${p.sampleRows.length} 行）` },
  { key: 'coordinate', labelOf: () => '坐标', onlyWhenData: true }
];

/** 勾选框里的导出项（顺序即显示顺序） */
export const NR_EXPORT_OPTIONS = [
  {
    key: 'excel',
    label: '分析结果（Excel：结论对比 / 逐术语 / 置换执行 / 模型信息）',
    type: 'xlsx',
    fileTag: '结果',
    sheets(ctx) {
      const { r, analysisResult: ar, verdict, interpretation, permInfo, modelInfo, templateLabel, diagnostics } = ctx;
      const summary = [
        ['项目', '值'],
        ['检验术语', r.tested_term],
        ['观测 F', r.F],
        ['R²', r.R2],
        ['p（自由置换）', r.p_free],
        [`p（${r.scheme} 置换）`, r.p_constrained],
        ['结论是否被置换方案改变', verdict],
        ['解释', interpretation],
        ['置换次数（请求/完成）', `${r.requested}/${r.performed}`],
        ['可用区组 / 丢弃', `${r.feasible_blocks ?? '-'}/${r.dropped_blocks ?? 0}`],
        ['随机种子', r.seed],
        ['公式', ar.model?.formula],
        ['距离', ar.model?.distance],
        ['测序深度校正', ar.model?.coverage_control || '否'],
        ['vegan / R', `${ar.vegan_version} / R ${ar.r_version}`],
        ['数据说明', templateLabel]
      ];
      // 引擎提醒逐条入表：导出给合作者看时，“这个 p 本来就不可能显著”不能丢
      (diagnostics || []).forEach((d, i) => summary.push([i === 0 ? '⚠️ 引擎提醒' : '⚠️ 引擎提醒(续)', d]));
      const table = [['术语', 'df', '水平数', 'F', 'R²']];
      (r.table || []).forEach((x) => table.push([x.term, x.df, x.n_levels, x.F_model, x.R2]));
      return [
        ['结论对比', summary],
        ['逐术语检验', table],
        ['置换执行', [['项目', '值'], ...(permInfo || []).map((x) => [x.label, x.value])]],
        ['模型信息', [['项目', '值'], ...(modelInfo || []).map((x) => [x.label, x.value])]]
      ];
    }
  },
  {
    key: 'pcoa',
    label: 'PCoA 坐标（Excel）',
    type: 'xlsx',
    fileTag: 'PCoA坐标',
    sheets(ctx) {
      const cd = ctx.cd || {};
      const out = [['样本', '分组', '区组', 'PC1', 'PC2']];
      (cd.pcoa?.x || []).forEach((x, i) => out.push([
        cd.pcoa.labels?.[i] || `S${i + 1}`, cd.pcoa.group?.[i] ?? '', cd.pcoa.strata?.[i] ?? '', x, cd.pcoa.y?.[i]
      ]));
      return [['PCoA坐标', out]];
    }
  },
  {
    key: 'null',
    label: '置换零分布样本（Excel）',
    type: 'xlsx',
    fileTag: '置换零分布',
    sheets(ctx) {
      const cd = ctx.cd || {};
      const a = cd.null?.values || [];
      const b = cd.null_free?.values || [];
      const out = [['受限置换F', '自由置换F']];
      for (let i = 0; i < Math.max(a.length, b.length); i++) out.push([a[i] ?? '', b[i] ?? '']);
      return [['零分布样本', out]];
    }
  },
  {
    key: 'json',
    label: '完整结果（JSON）',
    type: 'json',
    fileTag: '原始输出',
    data(ctx) { return ctx.analysisResult; }
  },
  {
    key: 'input',
    label: '当前输入数据（JSON）',
    type: 'json',
    fileTag: '输入',
    data(ctx) { return ctx.payload; }
  },
  {
    key: 'png',
    label: '当前图表（PNG）',
    type: 'png',
    fileTagOf: (ctx) => ctx.chartTabName || '图表'
  }
];

/** 默认勾上的项（和另外两个模块一样：Excel + JSON 是最常要的） */
export const NR_EXPORT_DEFAULTS = ['excel', 'json'];

/**
 * 把"勾了哪些项"变成一串写文件任务。纯函数，返回：
 *   [{ type:'xlsx', filename, sheets }, { type:'json', filename, data }, { type:'png', filename }]
 * 视图只负责执行任务（DOM/saveAs/chart.getDataURL），内容对不对由这张计划表说了算。
 */
export function planExport(keys, ctx, stamp) {
  const jobs = [];
  for (const key of keys) {
    const opt = NR_EXPORT_OPTIONS.find((o) => o.key === key);
    if (!opt) continue;
    const tag = typeof opt.fileTagOf === 'function' ? opt.fileTagOf(ctx) : opt.fileTag;
    const filename = `Non-random-PERMANOVA_${tag}_${stamp}.${opt.type === 'png' ? 'png' : opt.type === 'json' ? 'json' : 'xlsx'}`;
    if (opt.type === 'xlsx') jobs.push({ type: 'xlsx', filename, sheets: opt.sheets(ctx) });
    else if (opt.type === 'json') jobs.push({ type: 'json', filename, data: opt.data(ctx) });
    else jobs.push({ type: 'png', filename });
  }
  return jobs;
}

/**
 * 解析结果 -> 表单要写的三个字符串字段。
 * 放这里而不是视图里：这样"导入后表单该长什么样"是可断言的纯函数。
 */
export function nrToFormPatch(fields) {
  const patch = {
    communityStr: JSON.stringify(fields.community.matrix),
    sampleStr: JSON.stringify(fields.sample_aligned)
  };
  if (fields.coordinate_aligned) patch.coordinatesStr = JSON.stringify(fields.coordinate_aligned);
  return patch;
}

/**
 * 下载模板：表名 + 示例数据。
 * 这份示例会被用户真的导入并点「运行」，所以它必须跑得通、而且要跑出显著结果，
 * 实测（nonrandom_permanova.R, permutations=999, seed=7）：
 *   F=109.5、p_free=0.0071、p_constrained=0.0103、feasible_blocks=3。
 * 数据形状是「3 批次 × 每批 2 Case + 2 Control」，理由见「填写说明」表——
 * 每批 1:1 会让受限置换的零分布退化，p 恒不小于 0.25。
 */
export function nrTemplateSheets() {
  return [
    ['物种矩阵', [
      ['样本', 'Bacteroides', 'Prevotella', 'Faecalibacterium', 'Ruminococcus', 'Akkermansia', 'Bifidobacterium'],
      ['S1', 39, 8, 27, 4, 12, 5],
      ['S2', 40, 5, 26, 4, 12, 5],
      ['S3', 15, 25, 13, 19, 3, 15],
      ['S4', 14, 27, 14, 22, 2, 13],
      ['S5', 45, 10, 26, 9, 14, 6],
      ['S6', 47, 13, 28, 9, 12, 5],
      ['S7', 17, 30, 15, 23, 4, 14],
      ['S8', 19, 29, 11, 27, 3, 15],
      ['S9', 51, 15, 26, 14, 13, 5],
      ['S10', 51, 18, 26, 14, 14, 6],
      ['S11', 25, 35, 14, 30, 3, 14],
      ['S12', 24, 35, 14, 29, 3, 15]
    ]],
    ['样本信息', [
      ['样本', 'group', 'strata'],
      ['S1', 'Case', 'B1'],
      ['S2', 'Case', 'B1'],
      ['S3', 'Control', 'B1'],
      ['S4', 'Control', 'B1'],
      ['S5', 'Case', 'B2'],
      ['S6', 'Case', 'B2'],
      ['S7', 'Control', 'B2'],
      ['S8', 'Control', 'B2'],
      ['S9', 'Case', 'B3'],
      ['S10', 'Case', 'B3'],
      ['S11', 'Control', 'B3'],
      ['S12', 'Control', 'B3']
    ]],
    ['坐标', [
      ['样本', 'x', 'y'],
      ['S1', 0.2, -0.2],
      ['S2', 1.9, -0.3],
      ['S3', 3.1, 7.1],
      ['S4', 4.9, 6.7],
      ['S5', 19.7, -0.5],
      ['S6', 21.9, 0.5],
      ['S7', 22.6, 6.6],
      ['S8', 24.1, 7.5],
      ['S9', 40.4, 0],
      ['S10', 41.9, -0.5],
      ['S11', 42.7, 7],
      ['S12', 44.9, 7]
    ]],
    ['填写说明', [
      ['Non-random PERMANOVA 模板填写说明'],
      [''],
      ['1. 物种矩阵（必需）：第一列样本 ID，其余每列一个物种/OTU 的丰度（原始读数即可）。'],
      ['2. 样本信息（必需）：第一列样本 ID（可与物种矩阵顺序不同，导入时按 ID 对齐），'],
      ['   group 是待检验分组，strata 是分层变量；受限置换只在 strata 内部交换 group 标签。'],
      ['   ⚠️ 本模块只接受因子（分类）变量；pH、年龄这类连续变量请先分箱。'],
      ['3. 坐标（可选）：只有「空间受限置换」需要；第一列样本 ID，另两列 x/y。'],
      [''],
      ['示例设计为什么是 12 个样本（3 批次 × 每批 2 Case + 2 Control）：'],
      ['   受限置换只能在一个批次内部交换标签。如果每个批次只有 1 Case + 1 Control，'],
      ['   把全部批次同时翻转标签得到的置换与观测设计完全同构 —— 零分布退化，'],
      ['   p 值下界约 0.25，无论效应多强都不会显著（旧模板就踩了这个坑，实测 p_free=1、p_constrained=1）。'],
      ['   每批 2:2 时有 C(4,2)^3 = 216 个置换，p 下界约 0.009，示例才可能跑出真结果。'],
      ['本示例实测（permutations=999, seed=7, Bray-Curtis）：p_free=0.0071、p_constrained=0.0103。'],
      [''],
      ['导入后请先核对预览，再点「填入表单」。']
    ]]
  ];
}

