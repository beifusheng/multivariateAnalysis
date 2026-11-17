/**
 * R 控制器 - 处理前端与 R 服务之间的请求
 * 作为服务类使用（被 r.ts 调用）
 */
import { rService, RScriptOptions } from '../service/rService';
import { rPortableService } from '../service/rPortableService';
import { logger } from 'ee-core/log';

export default class RController {
  /**
   * 检查 R 环境是否可用
   */
  async checkR(): Promise<{ 
    available: boolean; 
    message: string;
    isPortable?: boolean;
    rPath?: string;
  }> {
    try {
      const portableConfig = rPortableService.getConfig();
      logger.info('[RController] checkR - portableConfig:', portableConfig);
      
      const available = await rService.checkRAvailable();
      logger.info('[RController] checkR - R available:', available);
      
      if (available) {
        const result = { 
          available: true, 
          message: portableConfig 
            ? 'Portable R environment is ready' 
            : 'System R environment is ready',
          isPortable: portableConfig?.isPortable,
          rPath: portableConfig?.rPath
        };
        logger.info('[RController] checkR - returning:', result);
        return result;
      } else {
        const result = { 
          available: false, 
          message: portableConfig
            ? `Portable R found but not working: ${portableConfig.rPath}`
            : 'R not found. Please install R or configure portable R path.'
        };
        logger.warn('[RController] checkR - returning:', result);
        return result;
      }
    } catch (err: any) {
      const result = { 
        available: false, 
        message: `Error checking R: ${err.message}` 
      };
      logger.error('[RController] checkR - error:', result);
      return result;
    }
  }

  /**
   * 配置 R 路径（用于便携版 R）
   */
  async setRPath(rPath: string): Promise<{ 
    success: boolean; 
    message: string;
    rPath?: string;
    libraryPath?: string;
  }> {
    try {
      rService.setRPath(rPath);
      const config = rPortableService.getConfig();
      return { 
        success: true, 
        message: 'R path configured successfully',
        rPath: config?.rPath,
        libraryPath: config?.libraryPath
      };
    } catch (err: any) {
      return { 
        success: false, 
        message: `Failed to configure R path: ${err.message}` 
      };
    }
  }

  /**
   * 获取便携版 R 配置信息
   */
  async getPortableRInfo(): Promise<{
    hasPortable: boolean;
    rPath?: string;
    libraryPath?: string;
    searchPaths?: string[];
  }> {
    const config = rPortableService.getConfig();
    const appPath = process.resourcesPath || process.execPath;
    
    return {
      hasPortable: !!config,
      rPath: config?.rPath,
      libraryPath: config?.libraryPath,
      searchPaths: [
        appPath + '/r-portable',
        appPath + '/r',
        process.env.LOCALAPPDATA + '/R-Portable',
        process.env.USERPROFILE + '/R-Portable'
      ]
    };
  }

  /**
   * 创建 R 包安装脚本
   */
  async createPackageInstallScript(packages: string[]): Promise<{
    success: boolean;
    scriptPath?: string;
    message?: string;
  }> {
    try {
      const scriptPath = rPortableService.createPackageInstallScriptFile(packages);
      return {
        success: true,
        scriptPath,
        message: 'Package install script created'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to create script: ${err.message}`
      };
    }
  }

  /**
   * 执行 PERMANOVA 分析
   */
  async runPERMANOVA(params: any): Promise<any> {
    logger.info('[RController] Running PERMANOVA');
    logger.info('[RController] Params distanceMatrix size:', params?.distanceMatrix?.length);
    
    // 清理参数，确保是纯 JSON
    const cleanParams: any = {
      distanceMatrix: params.distanceMatrix,
      permutations: params.permutations || 999
    };
    
    if (params.sampleData) {
      cleanParams.sampleData = params.sampleData;
    }
    if (params.formula) {
      cleanParams.formula = params.formula;
    }
    
    const result = await rService.runScript({
      scriptName: 'permanova.R',
      params: cleanParams,
      timeout: 600000 // 10 分钟
    });

    if (!result.success) {
      logger.error('[RController] PERMANOVA failed:', result.error);
      throw new Error(result.error || 'PERMANOVA execution failed');
    }

    logger.info('[RController] PERMANOVA success');
    logger.info('[RController] Result keys:', Object.keys(result.data));
    logger.info('[RController] Has pcoa:', !!result.data.pcoa);
    if (result.data.pcoa) {
      logger.info('[RController] PCoA keys:', Object.keys(result.data.pcoa));
      logger.info('[RController] PCoA samples count:', result.data.pcoa.samples?.length || 0);
    }
    return result.data;
  }

  /**
   * 执行 PERMANOVA-med 中介分析（基于 LDM::permanovaFL, test.mediation=TRUE）
   *
   * 角色约定（LDM 的语义与直觉相反，左侧矩阵才是中介）：
   *   mediatorData  -> 公式左侧矩阵 = 起中介作用的多元变量，
   *                    通常为微生物组 OTU 表（非负计数）或对称距离矩阵
   *   predictorData -> 第 1 组协变量 = 暴露 X
   *   outcomeData   -> 第 2 组协变量 = 结局 Y
   *   covariates    -> 可选，作为混杂项校正（写在 `MEDMAT|Z1+Z2 ~ ...`）
   *
   * 注意：permutations 会被 R 脚本自动上调到 100 的整数倍。
   * LDM 内部 n.perm.block 硬编码为 100，而 permanova.perm 数组只分配
   * n.perm.max 长度，非 100 倍数（如 999）会导致写入越界，
   * 报 "subscript out of bounds / 下标出界"。
   */
  async runPERMANOVA_Med(params: {
    mediatorData: number[][];   // 中介：OTU 表或距离矩阵（样本 × 物种）
    predictorData: number[][];  // 暴露 X（样本 × 变量）
    outcomeData: number[][];    // 结局 Y（样本 × 变量）
    covariates?: number[][];    // 协变量 Z（可选）
    permutations?: number;      // 置换次数，自动规整为 100 的倍数
    seed?: number;
  }): Promise<any> {
    logger.info('[RController] Running PERMANOVA-med, mediator dims:',
      params?.mediatorData?.length, 'x', params?.mediatorData?.[0]?.length);

    const result = await rService.runScript({
      scriptName: 'permanova_med.R',
      params,
      timeout: 600000
    });

    if (!result.success) {
      throw new Error(result.error || 'PERMANOVA-med execution failed');
    }

    return result.data;
  }

  /**
   * 执行 GMR⁴ 分析
   */
  async runGMR4(params: {
    X: number[][]; // 预测变量
    Y: number[][]; // 响应变量
    Z?: number[][]; // 协变量
    rank?: number;
    lambda?: number;
  }): Promise<any> {
    logger.info('[RController] Running GMR4 with params:', params);
    
    const result = await rService.runScript({
      scriptName: 'gmr4.R',
      params,
      timeout: 900000 // 15 分钟
    });

    if (!result.success) {
      throw new Error(result.error || 'GMR4 execution failed');
    }

    return result.data;
  }

  /**
   * 执行 Bayesian ERA with Mediation
   */
  async runBayesianERA_Mediation(params: {
    X: number[][];
    Y: number[][];
    M: number[][];
    chains?: number;
    iterations?: number;
  }): Promise<any> {
    logger.info('[RController] Running Bayesian ERA with Mediation with params:', params);
    
    const result = await rService.runScript({
      scriptName: 'bayesian_era_mediation.R',
      params,
      timeout: 1800000 // 30 分钟
    });

    if (!result.success) {
      throw new Error(result.error || 'Bayesian ERA execution failed');
    }

    return result.data;
  }

  /**
   * 执行非随机 PERMANOVA 扩展（Jaccard 距离）
   */
  async runNonRandomPERMANOVA(params: {
    presenceAbsenceData: number[][];
    formula: string;
    permutations?: number;
  }): Promise<any> {
    logger.info('[RController] Running Non-random PERMANOVA with params:', params);
    
    const result = await rService.runScript({
      scriptName: 'nonrandom_permanova.R',
      params,
      timeout: 600000
    });

    if (!result.success) {
      throw new Error(result.error || 'Non-random PERMANOVA execution failed');
    }

    return result.data;
  }
}
