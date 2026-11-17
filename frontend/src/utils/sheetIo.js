/**
 * Excel / CSV 读写（R 分析界面共用）
 * ---------------------------------------------------------------
 * 只放"和数据形状有关"的纯函数，不认得任何具体模块，方便三个（将来五个）分析界面共用：
 *   1) 模板：下载一个填好的样例工作簿
 *   2) 导入：把工作簿解析成引擎要的形态，并按样本 ID 对齐
 *   3) 导出：把结果写成多 sheet 工作簿 / 图表 PNG
 *
 * 为什么单独成文件：PERMANOVA.vue 里这三件事原来是写在视图内的 ~400 行，
 * 换个模块就得整段复制；一旦某个 sheet 名改了（比如"样本数据"→"样本信息"），
 * 两边就会各改各的。这里集中，视图只负责排版。
 *
 * 约定（和 r-scripts/nonrandom_permanova.R 的入参一致）：
 *   communityData: 样本 × 物种的数值矩阵（第一列样本 ID，其余列为物种/OTU 丰度）
 *   sampleData:    行对象数组，第一列样本 ID，其余列为分组变量（必须都是因子）
 *   coordinates:   样本 × (x, y[, z])，第一列样本 ID
 */

// 表头/工作表名的常见写法。用户手上的表多半是从别处导出的，中英文、大小写、
// 带不带空格都可能，匹配不上就整表拒绝太不友好，但静默猜列更糟——所以只认这张表，
// 认不出来时明确报"缺哪一列"。
export const SHEET_ALIASES = {
  community: ['物种矩阵', '群落矩阵', '丰度矩阵', 'OTU表', '物种', 'community', 'otu', 'abundance'],
  sample: ['样本信息', '样本数据', '分组信息', '样本表', 'metadata', 'sample', 'samples', 'grouping'],
  coordinate: ['坐标', '空间坐标', '经纬度', 'coordinate', 'coordinates', 'xy', 'space'],
  distance: ['距离矩阵', '相异度矩阵', 'distance', 'dissimilarity', 'bray']
};

const SAMPLE_ID_KEYS = ['样本', '样本id', '样品', '样本编号', 'id', 'sample', 'sampleid', 'samples', 'row', '站点'];

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[\s_\-]+/g, '');
const isBlank = (s) => !String(s ?? '').trim();

/** 第一列是不是样本 ID 列（有的表第一列是行名，Excel 里表头为空） */
function detectIdColumn(header) {
  const cells = header.map(norm);
  const hit = cells.findIndex((c) => SAMPLE_ID_KEYS.includes(c));
  if (hit >= 0) return hit;
  // 表头第一格为空、其余像变量名 -> 认定第一列是行名（aoa_to_sheet 写出的表就是这样）
  if (isBlank(header[0]) && header.slice(1).some((h) => !isBlank(h))) return 0;
  return 0;
}

/** 按别名表在工作簿里找一张表；返回 { name, aoa } 或 null */
export function findSheet(sheets, kind) {
  const aliases = (SHEET_ALIASES[kind] || []).map(norm);
  const names = Object.keys(sheets);
  for (const n of names) {
    const k = norm(n);
    if (aliases.includes(k)) return { name: n, aoa: sheets[n] };
  }
  for (const n of names) {
    const k = norm(n);
    if (aliases.some((a) => k.includes(a) || a.includes(k))) return { name: n, aoa: sheets[n] };
  }
  return null;
}

/**
 * 物种矩阵 sheet -> { ids: string[], matrix: number[][], species: string[] }
 * 允许表头第一格为空（行名式）；非数值单元格报错而不是当 0。
 */
export function parseCommunitySheet(aoa) {
  if (!Array.isArray(aoa) || aoa.length < 2) return { ok: false, error: '物种矩阵表至少要有表头和一行数据' };
  const header = aoa[0];
  const idCol = detectIdColumn(header);
  const species = header.filter((_, i) => i !== idCol && !isBlank(_)).map(String);
  const speciesIdx = header.map((h, i) => i).filter((i) => i !== idCol && !isBlank(header[i]));
  const ids = [];
  const matrix = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    if (!row.some((c) => !isBlank(c))) continue;              // 跳过完全空行
    const id = String(row[idCol] ?? '').trim() || `S${r}`;
    const vals = speciesIdx.map((i) => row[i]);
    const bad = vals.findIndex((v) => v === '' || v === null || v === undefined || !Number.isFinite(Number(v)));
    if (bad >= 0) {
      return { ok: false, error: `物种矩阵第 ${r + 1} 行第 ${bad + 1} 个物种不是数值（"${String(vals[bad])}"）` };
    }
    ids.push(id);
    matrix.push(vals.map(Number));
  }
  if (!ids.length) return { ok: false, error: '物种矩阵没有有效数据行' };
  if (new Set(ids).size !== ids.length) return { ok: false, error: '物种矩阵里有重复样本 ID' };
  return { ok: true, ids, matrix, species };
}

/** 样本信息 sheet -> { ids: string[], rows: object[], columns: string[] }（rows 不含样本 ID 列） */
export function parseSampleSheet(aoa) {
  if (!Array.isArray(aoa) || aoa.length < 2) return { ok: false, error: '样本信息表至少要有表头和一行数据' };
  const header = aoa[0];
  const idCol = detectIdColumn(header);
  const cols = header.map((h, i) => ({ h: String(isBlank(h) ? `col${i}` : h).trim(), i })).filter((c) => c.i !== idCol);
  if (!cols.length) return { ok: false, error: '样本信息表里除了样本 ID 没有其它列（至少要有一个分组变量）' };
  const ids = [];
  const rows = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    if (!row.some((c) => !isBlank(c))) continue;
    ids.push(String(row[idCol] ?? '').trim());
    const obj = {};
    for (const c of cols) {
      const v = row[c.i];
      // 全部转成字符串：R 侧要求分组变量是因子，数值型会被 jsonlite 当连续变量然后拒绝
      obj[c.h] = v === null || v === undefined || v === '' ? '' : String(v).trim();
    }
    rows.push(obj);
  }
  if (!ids.length) return { ok: false, error: '样本信息表没有有效数据行' };
  if (new Set(ids).size !== ids.length) return { ok: false, error: '样本信息表里有重复样本 ID' };
  return { ok: true, ids, rows, columns: cols.map((c) => c.h) };
}

/** 坐标 sheet -> { ids, coords: number[][] }（第 2~3 列为 x,y；多出的列忽略） */
export function parseCoordinateSheet(aoa) {
  const p = parseSampleSheet(aoa);
  if (!p.ok) return p;
  if (p.columns.length < 2) return { ok: false, error: '坐标表需要 x、y 两列' };
  const [cx, cy] = p.columns;
  const bad = p.rows.findIndex((r) => !Number.isFinite(Number(r[cx])) || !Number.isFinite(Number(r[cy])));
  if (bad >= 0) return { ok: false, error: `坐标表第 ${bad + 2} 行的 ${cx}/${cy} 不是数值` };
  return {
    ok: true,
    ids: p.ids,
    coords: p.rows.map((r) => [Number(r[cx]), Number(r[cy])])
  };
}

/**
 * 按样本 ID 对齐群落矩阵与样本信息（顺序不同就重排，缺样本直接拒绝）
 * 不静默按行号对齐：Excel 里排序一变，行号对齐会把分组整体错位，结果看着完全正常但毫无意义。
 */
export function alignBySampleId(comm, sample) {
  const idx = new Map(sample.ids.map((id, i) => [id, i]));
  const missing = comm.ids.filter((id) => !idx.has(id));
  if (missing.length) {
    return { ok: false, error: `样本信息里缺少这些样本：${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` 等 ${missing.length} 个` : ''}` };
  }
  const extra = sample.ids.filter((id) => !comm.ids.includes(id));
  const rows = comm.ids.map((id) => sample.rows[idx.get(id)]);
  return { ok: true, rows, extra };
}

/** 距离矩阵 sheet（方阵，对称性只警告不拒绝——用户可能只填上三角） */
export function parseDistanceSheet(aoa) {
  if (!Array.isArray(aoa) || aoa.length < 3) return { ok: false, error: '距离矩阵表太小' };
  const header = aoa[0];
  const ids = header.slice(1).map((h) => String(h ?? '').trim());
  const rows = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    if (!row.some((c) => !isBlank(c))) continue;
    if (rows.length >= ids.length) return { ok: false, error: '距离矩阵不是方阵：数据行数超过列数' };
    const vals = ids.map((_, i) => Number((row || [])[i + 1]));
    const bad = vals.findIndex((v) => !Number.isFinite(v));
    if (bad >= 0) return { ok: false, error: `距离矩阵第 ${r + 1} 行第 ${bad + 1} 列不是数值` };
    rows.push(vals);
  }
  if (rows.length !== ids.length) return { ok: false, error: `距离矩阵不是方阵：${ids.length} 列但 ${rows.length} 行` };
  let symmetric = true;
  for (let i = 0; i < rows.length && symmetric; i++) {
    for (let j = 0; j < i; j++) if (Math.abs(rows[i][j] - rows[j][i]) > 1e-9) { symmetric = false; break; }
  }
  return { ok: true, ids, matrix: rows, symmetric };
}

// ---------------------------------------------------------------- 通用映射：spec 驱动

const PARSERS = {
  community: parseCommunitySheet,
  sample: parseSampleSheet,
  coordinate: parseCoordinateSheet,
  distance: parseDistanceSheet
};

/**
 * 把工作簿按 spec 映射成引擎要的字段。
 * 三个（将来五个）模块的导入区别只在“要哪几张表”，流程一样，所以这里一次性把
 * 容易写错的儿件事固定下来：必需表缺失要指名、样本一律按主表 ID 对齐、
 * 能解析但形状可疑要提醒。
 *
 * @param sheets readWorkbook 的结果
 * @param spec   [{key,label,kind,required,aliasHint}]，须包含一个 primary
 * @param opts   { primary: 'community', needKeys: ['coordinate'], needLabel: '空间受限' }
 */
export function mapWorkbook(sheets, spec, opts = {}) {
  const warnings = [];
  const fields = {};
  const found = {};
  for (const s of spec) {
    const hit = findSheet(sheets, s.kind);
    if (!hit) {
      if (s.required) {
        return { ok: false, error: `没找到「${s.label}」表（可叫 ${s.aliasHint || s.label}）`, warnings, fields };
      }
      continue;
    }
    found[s.key] = hit;
    const parsed = (PARSERS[s.kind] || parseSampleSheet)(hit.aoa);
    if (!parsed.ok) return { ok: false, error: `${s.label}：${parsed.error}`, warnings, fields };
    fields[s.key] = parsed;
  }

  const primary = fields[opts.primary || 'community'];
  if (!primary) return { ok: false, error: '缺少主表（决定样本顺序的那一张）', warnings, fields };

  // 其它按样本 ID 的表：统一重排成主表顺序，并检查缺没缺
  for (const s of spec) {
    if (!s.key || s.key === (opts.primary || 'community')) continue;
    const f = fields[s.key];
    if (!f || !Array.isArray(f.ids)) continue;
    const miss = primary.ids.filter((id) => !f.ids.includes(id));
    if (miss.length) {
      return { ok: false, error: `${s.label}缺少这些样本：${miss.slice(0, 5).join(', ')}${miss.length > 5 ? ` 等 ${miss.length} 个` : ''}`, warnings, fields };
    }
    const extra = f.ids.filter((id) => !primary.ids.includes(id));
    if (extra.length) warnings.push(`${s.label}里有 ${extra.length} 个主表没有的样本（${extra.slice(0, 4).join(', ')}${extra.length > 4 ? ' …' : ''}），已忽略`);
    if (s.kind === 'sample') {
      fields[s.key + '_aligned'] = primary.ids.map((id) => f.rows[f.ids.indexOf(id)]);
      fields[s.key + '_columns'] = f.columns;
    } else if (s.kind === 'coordinate') {
      const map = new Map(f.ids.map((id, i) => [id, f.coords[i]]));
      fields[s.key + '_aligned'] = primary.ids.map((id) => map.get(id));
    }
  }

  for (const key of opts.needKeys || []) {
    if (!found[key]) {
      const s = spec.find((x) => x.key === key);
      warnings.push(`当前置换方案是「${opts.needLabel || s?.label || key}」，但文件里没有${s?.label || key}表，填入后需要自己补`);
    }
  }

  warnings.push(...shapeWarnings(primary, fields, opts));
  return { ok: true, fields, warnings, ids: primary.ids };
}

/** 能解析 ≠ 形状对：把常见误传与隐患说清楚 */
function shapeWarnings(primary, fields, opts) {
  const w = [];
  if (primary.species && primary.species.length <= 1) w.push('物种矩阵只有 1 列物种，是不是把样本信息表放上来了？');
  if (primary.matrix) {
    const zeros = primary.matrix.filter((row) => row.every((v) => v === 0)).length;
    if (zeros) w.push(`主表里有 ${zeros} 个样本全为 0（在相异度里会被当成空群落）`);
  }
  const sample = fields[opts.sampleKey || 'sample'];
  if (sample && sample.columns) {
    const numericOnly = sample.columns.filter((c) => sample.rows.every((r) => r[c] !== '' && Number.isFinite(Number(r[c]))));
    if (numericOnly.length) w.push(`样本信息里这些列全是数值：${numericOnly.join(', ')}。本模块只接受因子，运行前请先分箱`);
    const blank = sample.columns.filter((c) => sample.rows.some((r) => r[c] === ''));
    if (blank.length) w.push(`样本信息这些列有空值：${blank.join(', ')}（空值会作为缺失水平处理）`);
  }
  return w;
}

/**
 * 解析结果 -> 预览用的 tab 列表（外壳只负责摆）
 * cols 统一成字符串数组；主表列太多时只预览前 12 列物种
 */
export function previewFromFields(primaryIds, primary, fields, opts = {}) {
  const tabs = [];
  if (primary.matrix && primary.species) {
    tabs.push({
      name: 'community',
      label: `物种矩阵（${primaryIds.length} 样本 × ${primary.species.length} 物种）`,
      cols: ['样本', ...primary.species.slice(0, 12)],
      rows: primaryIds.map((id, r) => {
        const o = { 样本: id };
        primary.species.forEach((sp, c) => { o[sp] = primary.matrix[r][c]; });
        return o;
      })
    });
  }
  if (primary.ids && primary.matrix && !primary.species) {
    // 距离矩阵：行就是样本，列也是样本
    tabs.push({
      name: 'distance',
      label: `距离矩阵（${primary.ids.length} × ${primary.ids.length}）`,
      cols: ['样本', ...primary.ids.slice(0, 12)],
      rows: primary.ids.map((id, r) => {
        const o = { 样本: id };
        primary.ids.slice(0, 12).forEach((sid, c) => { o[sid] = primary.matrix[r][c]; });
        return o;
      })
    });
  }
  const rows = fields.sample_aligned;
  if (rows) {
    tabs.push({
      name: 'sample',
      label: `样本信息（${rows.length} 行）`,
      cols: ['样本', ...(fields.sample_columns || [])],
      rows: rows.slice(0, opts.previewRows || 20).map((row, i) => ({ 样本: primaryIds[i], ...row }))
    });
  }
  if (fields.coordinate_aligned) {
    tabs.push({
      name: 'coordinate',
      label: '坐标',
      cols: ['样本', 'x', 'y'],
      rows: primaryIds.map((id, r) => ({ 样本: id, x: fields.coordinate_aligned[r][0], y: fields.coordinate_aligned[r][1] }))
    });
  }
  return tabs;
}

// ---------------------------------------------------------------- 写：模板与导出

/** aoa -> sheet；XLSX 由调用方注入，避免这里静态 import 影响 Node 测试 */
export function sheetFromAoa(XLSX, aoa, colWidths = null) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (colWidths) ws['!cols'] = colWidths.map((w) => ({ wch: w }));
  return ws;
}

/** 浏览器里 XLSX.writeFile 会直接触发下载；Node 里需要 set_fs，两边统一走 write -> Blob */
export function writeWorkbook(XLSX, sheets, filename) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) {
    XLSX.utils.book_append_sheet(wb, sheetFromAoa(XLSX, aoa), String(name).slice(0, 31));
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return downloadBlob(blob, filename);
}

/** 交给调用方自己下文件（测试里用得到） */
export function workbookOf(XLSX, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) {
    XLSX.utils.book_append_sheet(wb, sheetFromAoa(XLSX, aoa), String(name).slice(0, 31));
  }
  return wb;
}

export function downloadBlob(blob, filename) {
  return import('file-saver').then(({ saveAs }) => {
    saveAs(blob, filename);
    return filename;
  });
}

/**
 * 一个可直接填写的示例工作簿：物种矩阵 / 样本信息 / 坐标 / 说明
 * 数值取自 6 样本 × 8 物种的小设计，用户照着换成自己的即可。
 */
export function buildTemplateSheets() {
  const species = ['Bacteroides', 'Prevotella', 'Faecalibacterium', 'Ruminococcus', 'Akkermansia', 'Bifidobacterium', 'Escherichia', 'Lactobacillus'];
  const ids = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
  const abund = [
    [42, 18, 30, 5, 2, 11, 7, 3],
    [38, 22, 26, 8, 1, 9, 5, 4],
    [12, 9, 15, 28, 14, 3, 2, 1],
    [15, 11, 12, 31, 10, 4, 3, 2],
    [9, 7, 18, 25, 16, 2, 1, 1],
    [45, 20, 28, 4, 3, 12, 6, 5]
  ];
  const community = [['样本', ...species], ...ids.map((id, i) => [id, ...abund[i]])];
  const sample = [
    ['样本', 'group', 'strata'],
    ['S1', 'Case', 'B1'], ['S2', 'Case', 'B1'], ['S3', 'Case', 'B2'],
    ['S4', 'Control', 'B2'], ['S5', 'Control', 'B3'], ['S6', 'Control', 'B3']
  ];
  const coord = [
    ['样本', 'x', 'y'],
    ['S1', 0, 0], ['S2', 1.2, 0.6], ['S3', 20, 4], ['S4', 21.5, 3.2], ['S5', 40, 12], ['S6', 41, 12.6]
  ];
  const notes = [
    ['Non-random PERMANOVA 数据模板'],
    [''],
    ['📄 物种矩阵（必需）：'],
    ['   第一列样本 ID，其余每列一个物种/OTU 的丰度（原始读数即可，无需先标准化）'],
    ['   行 = 样本，列 = 物种'],
    [''],
    ['📋 样本信息（必需）：'],
    ['   第一列样本 ID（需与物种矩阵一致，顺序可以不同，导入时按 ID 对齐）'],
    ['   group 是待检验的分组；strata 是分层变量（受限置换只在 strata 内部交换标签）'],
    ['   ⚠️ 本模块只接受因子（分类）变量；pH、年龄这类连续变量请先分箱'],
    [''],
    ['📍 坐标（可选）：'],
    ['   只有选择「空间受限置换」时才需要；第一列样本 ID，另两列 x/y'],
    [''],
    ['导入后请核对预览，再点「填入表单」']
  ];
  return [
    ['物种矩阵', community],
    ['样本信息', sample],
    ['坐标', coord],
    ['填写说明', notes]
  ];
}

/** 读文件 -> { sheets: { 名: aoa } }；CSV 走单 sheet */
export async function readWorkbook(file) {
  const m = await import('xlsx');
  const XLSX = m.utils ? m : m.default;   // xlsx 只有具名导出，打包后才可能有 default
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets = {};
  for (const name of wb.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '' });
  }
  return sheets;
}
