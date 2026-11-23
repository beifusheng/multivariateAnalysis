/**
 * R 服务 API 调用
 */
import { ipcApiRoute } from './index';

/**
 * 获取 ipcRenderer（兼容 Vite 环境）
 */
function getIpcRenderer() {
  // 在 Electron 渲染进程中，使用 window.electron（通过 bridge.ts 暴露）
  if (window.electron && window.electron.ipcRenderer) {
    return window.electron.ipcRenderer;
  }
  // 或者直接 require（nodeIntegration: true 时）
  if (typeof window !== 'undefined' && window.require) {
    const { ipcRenderer } = window.require('electron');
    return ipcRenderer;
  }
  throw new Error('ipcRenderer not available');
}

/**
 * 检查 R 环境是否可用
 */
export function checkR() {
  return getIpcRenderer().invoke(ipcApiRoute.rCheck);
}

/**
 * 配置 R 路径
 */
export function setRPath(rPath) {
  return getIpcRenderer().invoke(ipcApiRoute.rSetPath, rPath);
}

/**
 * 获取便携版 R 信息
 */
export function getPortableRInfo() {
  return getIpcRenderer().invoke(ipcApiRoute.rGetPortableInfo);
}

/**
 * 执行 PERMANOVA 分析
 */
export async function runPERMANOVA(params) {
  const ipc = getIpcRenderer();
  // 清理参数，确保可序列化
  const cleanParams = {
    distanceMatrix: JSON.parse(JSON.stringify(params.distanceMatrix)),
    permutations: params.permutations || 999
  };
  if (params.sampleData) {
    cleanParams.sampleData = JSON.parse(JSON.stringify(params.sampleData));
  }
  if (params.formula) {
    cleanParams.formula = params.formula;
  }
  console.log('[R API] Calling IPC with params:', cleanParams);
  try {
    const result = await ipc.invoke(ipcApiRoute.rRunPERMANOVA, cleanParams);
    console.log('[R API] Result received:', result);
    return result;
  } catch (error) {
    console.error('[R API] IPC error:', error);
    console.error('[R API] Error stack:', error.stack);
    throw error;
  }
}

/**
 * PERMANOVA 事后两两比较（pairwise PERMANOVA）
 *
 * 这里只搬运数据，不做任何统计：p 值全部由 r-scripts/permanova_posthoc.R 算。
 * 以前这件事在前台用 Math.random() 完成（注释写着"模拟 p 值"），并把原始 p
 * 标成「校正 p 值」写进导出 —— 那是编造统计结论。前端不许再算校正，
 * 免得两处口径不一致（BH 只在 R 里用 p.adjust 算一次）。
 */
export async function runPERMANOVAPosthoc(params) {
  const ipc = getIpcRenderer();
  // 白名单是**两层串联**的（这里 + rController），漏一个字段就静默丢一个字段：
  // 上一轮加的 primary（显著性口径）两边都没列，于是下拉框改了也等于没改，
  // 而尺子直接调 R 所以全绿。契约测试 test_pm_view 现在盯着这一层。
  const cleanParams = {
    distanceMatrix: JSON.parse(JSON.stringify(params.distanceMatrix)),
    permutations: params.permutations || 999,
    seed: params.seed || 12345,
    primary: params.primary || 'bh'
  };
  // 可选字段只在给了的时候才传：groups 缺席时要让 R 走 sampleData + formula 那条路，
  // 把 undefined 变成 null 传下去会被引擎当成"给了一个空分组"。
  if (params.sampleData) cleanParams.sampleData = JSON.parse(JSON.stringify(params.sampleData));
  if (params.formula) cleanParams.formula = String(params.formula);
  if (params.groups) cleanParams.groups = JSON.parse(JSON.stringify(params.groups));
  if (params.exact_max) cleanParams.exact_max = params.exact_max;
  const result = await ipc.invoke(ipcApiRoute.rRunPERMANOVAPosthoc, cleanParams);
  return result;
}

/**
 * 执行 PERMANOVA-med 中介分析
 */
export async function runPERMANOVA_Med(params) {
  const ipc = getIpcRenderer();
  const cleanParams = JSON.parse(JSON.stringify(params));
  try {
    return await ipc.invoke(ipcApiRoute.rRunPERMANOVAMed, cleanParams);
  } catch (error) {
    console.error('[R API] runPERMANOVA_Med error:', error);
    throw error;
  }
}

/**
 * 执行 GMR⁴ 分析
 */
export async function runGMR4(params) {
  const ipc = getIpcRenderer();
  const cleanParams = JSON.parse(JSON.stringify(params));
  try {
    return await ipc.invoke(ipcApiRoute.rRunGMR4, cleanParams);
  } catch (error) {
    console.error('[R API] runGMR4 error:', error);
    throw error;
  }
}

/**
 * 执行 Bayesian ERA with Mediation
 */
export async function runBayesianERA_Mediation(params) {
  const ipc = getIpcRenderer();
  const cleanParams = JSON.parse(JSON.stringify(params));
  try {
    return await ipc.invoke(ipcApiRoute.rRunBayesianERA_Mediation, cleanParams);
  } catch (error) {
    console.error('[R API] runBayesianERA_Mediation error:', error);
    throw error;
  }
}

/**
 * 执行非随机 PERMANOVA 扩展
 */
export async function runNonRandomPERMANOVA(params) {
  const ipc = getIpcRenderer();
  const cleanParams = JSON.parse(JSON.stringify(params));
  try {
    return await ipc.invoke(ipcApiRoute.rRunNonRandomPERMANOVA, cleanParams);
  } catch (error) {
    console.error('[R API] runNonRandomPERMANOVA error:', error);
    throw error;
  }
}
