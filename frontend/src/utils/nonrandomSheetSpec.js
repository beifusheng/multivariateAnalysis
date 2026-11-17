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
import { buildTemplateSheets } from './sheetIo.js';

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
      const { r, analysisResult: ar, verdict, interpretation, permInfo, modelInfo, templateLabel } = ctx;
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

/** 模板：数据形状由 sheetIo 统一给，这里只声明"这个模块下载哪几张表" */
export function nrTemplateSheets() {
  return buildTemplateSheets();
}
