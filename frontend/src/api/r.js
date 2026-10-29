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
 * 执行 PERMANOVA-med 中介分析
 */
export async function runPERMANOVA_Med(params) {
  const ipc = getIpcRenderer();
  const cleanParams = JSON.parse(JSON.stringify(params));
  try {
    return await ipc.invoke(ipcApiRoute.rRunPERMANOVA_Med, cleanParams);
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
