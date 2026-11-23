/**
 * R 分析 IPC 处理器
 * 注册前端与 R 服务通信的 IPC 频道
 */
import { ipcMain } from 'electron';
import RController from '../controller/rController';
import { logger } from 'ee-core/log';

const rController = new RController();

export function registerRIPC() {
  logger.info('[RIPC] Registering R IPC handlers...');

  // 检查 R 环境
  ipcMain.handle('controller/r/checkR', async () => {
    logger.debug('[RIPC] Handling checkR');
    return await rController.checkR();
  });

  // 配置 R 路径
  ipcMain.handle('controller/r/setRPath', async (event, rPath: string) => {
    logger.debug('[RIPC] Handling setRPath:', rPath);
    return await rController.setRPath(rPath);
  });

  // 获取便携版 R 信息
  ipcMain.handle('controller/r/getPortableRInfo', async () => {
    logger.debug('[RIPC] Handling getPortableRInfo');
    return await rController.getPortableRInfo();
  });

  // 执行 PERMANOVA 分析
  ipcMain.handle('controller/r/runPERMANOVA', async (event, params: any) => {
    logger.debug('[RIPC] Handling runPERMANOVA');
    try {
      const result = await rController.runPERMANOVA(params);
      logger.debug('[RIPC] PERMANOVA result:', JSON.stringify(result, null, 2));
      // 确保返回纯 JSON 对象（移除可能的特殊类型）
      const serialized = JSON.parse(JSON.stringify(result));
      logger.debug('[RIPC] Serialized result OK');
      return serialized;
    } catch (error: any) {
      logger.error('[RIPC] runPERMANOVA error:', error.message);
      logger.error('[RIPC] Error stack:', error.stack);
      throw new Error('PERMANOVA 分析失败：' + error.message);
    }
  });

  // PERMANOVA 事后两两比较（真实置换检验，替代视图里的随机数假 p）
  ipcMain.handle('controller/r/runPERMANOVAPosthoc', async (event, params: any) => {
    logger.debug('[RIPC] Handling runPERMANOVAPosthoc');
    try {
      const result = await rController.runPERMANOVAPosthoc(params);
      return JSON.parse(JSON.stringify(result));
    } catch (error: any) {
      logger.error('[RIPC] runPERMANOVAPosthoc error:', error.message);
      // 不把 R 的拒单理由丢掉：用户需要知道是哪一格不对（长度不符/不对称/某组只有 1 个样本）
      throw new Error('事后检验失败：' + error.message);
    }
  });

  // 执行 PERMANOVA-med 中介分析
  ipcMain.handle('controller/r/runPERMANOVAMed', async (event, params: any) => {
    logger.debug('[RIPC] Handling runPERMANOVAMed');
    try {
      const result = await rController.runPERMANOVA_Med(params);
      return JSON.parse(JSON.stringify(result));
    } catch (error: any) {
      logger.error('[RIPC] runPERMANOVA_Med error:', error.message);
      throw error;
    }
  });

  // 执行 GMR⁴ 分析
  ipcMain.handle('controller/r/runGMR4', async (event, params: any) => {
    logger.debug('[RIPC] Handling runGMR4');
    try {
      const result = await rController.runGMR4(params);
      return JSON.parse(JSON.stringify(result));
    } catch (error: any) {
      logger.error('[RIPC] runGMR4 error:', error.message);
      throw error;
    }
  });

  // 执行 Bayesian ERA with Mediation
  ipcMain.handle('controller/r/runBayesianERA_Mediation', async (event, params: any) => {
    logger.debug('[RIPC] Handling runBayesianERA_Mediation');
    try {
      const result = await rController.runBayesianERA_Mediation(params);
      return JSON.parse(JSON.stringify(result));
    } catch (error: any) {
      logger.error('[RIPC] runBayesianERA_Mediation error:', error.message);
      throw error;
    }
  });

  // 执行非随机 PERMANOVA 扩展
  ipcMain.handle('controller/r/runNonRandomPERMANOVA', async (event, params: any) => {
    logger.debug('[RIPC] Handling runNonRandomPERMANOVA');
    try {
      const result = await rController.runNonRandomPERMANOVA(params);
      return JSON.parse(JSON.stringify(result));
    } catch (error: any) {
      logger.error('[RIPC] runNonRandomPERMANOVA error:', error.message);
      throw error;
    }
  });

  logger.info('[RIPC] R IPC handlers registered successfully');
}
