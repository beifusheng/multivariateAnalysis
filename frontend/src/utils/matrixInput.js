/**
 * 输入矩阵格式解析（前端与 R 侧 permanova_med.R 的 to_num_matrix 保持同一套语义）
 * ---------------------------------------------------------------------------
 * 支持三种历史写法，统一归一化为「样本 × 变量」二维数组：
 *   1) 二维数组  [[...],[...]]              行 = 样本
 *   2) 行字典    {"Sample1": [..], ...}     键 = 样本（Excel 导入即此式）
 *   3) 列字典    {"Age": [25,30,35], ...}   键 = 变量（协变量常用此式）
 * 2/3 的消歧依据参照样本数 refN：记录数==refN 视为行字典，数组长度==refN 视为列字典。
 */

const numeric = (v) => typeof v === 'number' && Number.isFinite(v);

/** 已解析的 JS 值 -> { ok, n, p, rows, orientation, error } */
export function inspectValue(data, refN = null) {
  if (data === null || data === undefined) return { ok: false, error: '数据为空' };

  if (Array.isArray(data)) {
    if (data.length === 0) return { ok: false, error: '至少需要一个样本' };
    if (data.every(numeric)) {
      return { ok: true, n: data.length, p: 1, rows: data.map((v) => [v]), orientation: 'vector' };
    }
    if (!data.every((r) => Array.isArray(r))) {
      return { ok: false, error: '数组形式请统一为二维数组 [[...],[...]]（或单变量时给纯数字数组）' };
    }
    const lens = [...new Set(data.map((r) => r.length))];
    if (lens.length !== 1) return { ok: false, error: `各行变量数不一致（出现 ${lens.join('/')}），可能有缺失值` };
    if (!data.every((r) => r.every(numeric))) return { ok: false, error: '存在非数值元素（null/文字/NaN），请清理' };
    return { ok: true, n: data.length, p: lens[0], rows: data, orientation: 'matrix' };
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return { ok: false, error: '至少需要一个样本' };
    const vals = keys.map((k) => data[k]);
    if (vals.every(numeric)) {
      return { ok: true, n: keys.length, p: 1, rows: vals.map((v) => [v]), orientation: 'named-vector' };
    }
    if (!vals.every((v) => Array.isArray(v))) return { ok: false, error: '对象格式下，每个键的值必须是数组' };
    const lens = [...new Set(vals.map((v) => v.length))];
    if (lens.length !== 1) return { ok: false, error: `所有数组长度必须一致（出现 ${lens.join('/')}）` };
    if (!vals.every((v) => v.every(numeric))) return { ok: false, error: '存在非数值元素（null/文字/NaN），请清理' };

    const k = keys.length;
    const L = lens[0];
    // 行字典：每个键的值就是「该样本的各变量取值」，直接作为一行
    //（注意不能取 vals.map(v => v[i])，那是按列重组，会得到 k×k 的错东西）
    const byRow = () => vals.map((v) => v.slice());
    // 列字典：每个键的值是「该变量在各样本的取值」，需要按样本重组
    const byCol = () => {
      const rows = [];
      for (let i = 0; i < L; i++) rows.push(vals.map((v) => v[i]));
      return rows;
    };

    if (refN != null) {
      if (k === refN && L !== refN) return { ok: true, n: k, p: L, rows: byRow(), orientation: 'row-dict' };
      if (L === refN && k !== refN) return { ok: true, n: L, p: k, rows: byCol(), orientation: 'col-dict' };
      if (k === refN && L === refN) return { ok: true, n: k, p: L, rows: byRow(), orientation: 'row-dict(square)' };
      return {
        ok: false,
        error: `样本数无法对齐（记录数=${k}，每条长度=${L}，参照样本数=${refN}）。`
          + '行字典请让记录数=样本数，列字典请让数组长度=样本数'
      };
    }
    // 无参照时按行字典解释（与 Excel 导入、输入框示例一致）
    return { ok: true, n: k, p: L, rows: byRow(), orientation: 'row-dict' };
  }

  return { ok: false, error: '无法识别的数据类型' };
}

/** JSON 字符串 -> inspectValue */
export function inspectMatrix(str, refN = null) {
  let data;
  try {
    data = JSON.parse(str);
  } catch (e) {
    return { ok: false, error: 'JSON 格式错误：' + e.message };
  }
  return inspectValue(data, refN);
}

/**
 * 从其他矩阵的字符串里推参照样本数。
 * 只有「二维数组」这种写法能无歧义地读出样本数，因此只看它。
 * @param {Record<string,string>} fields 形如 { mediatorDataStr, predictorDataStr, ... }
 * @param {string} excludeField 排除自身
 */
export function refSampleNFrom(fields, excludeField) {
  for (const [key, s] of Object.entries(fields)) {
    if (key === excludeField) continue;
    if (!s || !String(s).trim()) continue;
    try {
      const d = JSON.parse(s);
      if (Array.isArray(d) && d.length > 0 && Array.isArray(d[0])) return d.length;
    } catch (e) { /* 解析不了就试下一个 */ }
  }
  return null;
}

/**
 * 生成「样本数不一致」提示；一致或不足两个矩阵时返回空串
 * @param {Array<[string, string]>} entries [标签, JSON 字符串]
 * @param {number|null} refN 参照样本数（一般取中介 M 的 n）
 */
export function sampleMismatchMessage(entries, refN = null) {
  const seen = [];
  for (const [label, s] of entries) {
    if (!s || !String(s).trim()) continue;
    const r = inspectMatrix(s, refN);
    if (r.ok) seen.push({ label, n: r.n });
  }
  if (seen.length < 2) return '';
  const bad = seen.filter((x) => x.n !== seen[0].n);
  if (!bad.length) return '';
  return '样本数不一致：' + seen.map((x) => `${x.label}=${x.n}`).join('，') + '（应以中介 M 的样本数为准）';
}
