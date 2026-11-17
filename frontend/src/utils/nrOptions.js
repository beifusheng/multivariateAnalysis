/**
 * Non-random PERMANOVA 的下拉选项（单独成模块，便于与 R 侧白名单做一致性测试）
 *
 * 为什么要有 test_nr_options.mjs 这种测试：界面上多一个距离方法，用户点了就会
 * 在 R 里报 "不支持的距离方法"。R 的 VEGAN_METHODS 是本机 vegan 版本逐个
 * tryCatch 验出来的，界面临时补一个名字就会漂移，所以把两者绑在一起测。
 */
export const NR_DISTANCES = [
  { value: 'bray', label: 'Bray-Curtis 相异度（默认）' },
  { value: 'ws', label: 'WS 加权 Simpson（本脚本实现）' },
  { value: 'jaccard', label: 'Jaccard（建议配合存在/缺失）' },
  { value: 'euclidean', label: 'Euclidean 欧氏距离' },
  { value: 'hellinger', label: 'Hellinger 变换距离' },
  { value: 'aitchison', label: 'Aitchison（组成数据，需无 0）' },
  { value: 'gower', label: 'Gower' },
  { value: 'chisq', label: '卡方距离' },
  { value: 'morisita', label: 'Morisita' },
  { value: 'horn', label: 'Horn-Morisita' },
  { value: 'cao', label: 'Cao / index of difference' },
  { value: 'chao', label: 'Chao 距离' },
  { value: 'raup', label: 'Raup-Crick' },
  { value: 'manhattan', label: 'Manhattan' },
  { value: 'kulczynski', label: 'Kulczynski' }
];

export const NR_SCHEMES = [
  { value: 'free', label: '自由置换 free（标准做法，忽略设计结构）' },
  { value: 'stratified', label: '分层受限 stratified（区组内交换标签）' },
  { value: 'spatial', label: '空间受限 spatial（邻域内交换标签）' }
];

export const NR_ALPHA = 0.05;
