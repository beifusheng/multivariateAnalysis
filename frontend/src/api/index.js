
/**
 * 主进程与渲染进程通信频道定义
 * Definition of communication channels between main process and rendering process
 */
const ipcApiRoute = {
  test: 'controller/example/test',
  
  // R 分析相关
  rCheck: 'controller/r/checkR',
  rSetPath: 'controller/r/setRPath',
  rGetPortableInfo: 'controller/r/getPortableRInfo',
  rRunPERMANOVA: 'controller/r/runPERMANOVA',
  rRunPERMANOVA_Med: 'controller/r/runPERMANOVA_Med',
  rRunGMR4: 'controller/r/runGMR4',
  rRunBayesianERA_Mediation: 'controller/r/runBayesianERA_Mediation',
  rRunNonRandomPERMANOVA: 'controller/r/runNonRandomPERMANOVA',
}

export {
  ipcApiRoute
}

