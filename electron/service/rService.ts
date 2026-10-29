/**
 * R 服务 - 管理 R 进程的调用和通信
 */
import { spawn, ChildProcess } from 'child_process';
import { join, normalize } from 'path';
import { app } from 'electron';
import treeKill from 'tree-kill';
import { logger } from 'ee-core/log';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { rPortableService } from './rPortableService';

export interface RScriptResult {
  success: boolean;
  data?: any;
  error?: string;
  stderr?: string;
}

export interface RScriptOptions {
  scriptName: string;
  params?: Record<string, any>;
  timeout?: number; // 超时时间（毫秒），默认 300000 (5 分钟)
}

class RService {
  private rPath: string;
  private rScriptsDir: string;
  private tempDir: string;
  private isRPathConfigured: boolean = false;

  constructor() {
    // R 脚本目录
    this.rScriptsDir = join(app.getAppPath(), 'r-scripts');
    
    // 临时目录（用于传递数据和接收结果）
    this.tempDir = join(app.getPath('temp'), 'electron-egg-r');
    
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }

    // 尝试使用便携版 R 配置
    const portableConfig = rPortableService.getConfig();
    if (portableConfig) {
      this.rPath = portableConfig.rPath;
      logger.info('[RService] Using portable R:', this.rPath);
    } else {
      this.rPath = 'Rscript'; // 默认使用系统 PATH 中的 Rscript
      logger.info('[RService] Using system R from PATH');
    }

    logger.info('[RService] initialized, scripts dir:', this.rScriptsDir);
    logger.info('[RService] temp dir:', this.tempDir);
  }

  /**
   * 配置 R 路径（如果使用打包的便携版 R）
   */
  setRPath(rPath: string): void {
    try {
      const config = rPortableService.setRPath(rPath);
      this.rPath = config.rPath;
      this.isRPathConfigured = true;
      logger.info('[RService] R path configured:', this.rPath);
    } catch (err: any) {
      logger.error('[RService] Failed to configure R path:', err.message);
      throw err;
    }
  }

  /**
   * 检查 R 是否可用
   */
  async checkRAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const test = spawn(this.rPath, ['--version']);
      
      test.on('error', (err) => {
        logger.error('[RService] R not found:', err.message);
        resolve(false);
      });

      test.on('close', (code) => {
        const available = code === 0;
        logger.info('[RService] R availability check:', available ? 'available' : 'not available');
        resolve(available);
      });
    });
  }

  /**
   * 执行 R 脚本
   */
  async runScript(options: RScriptOptions): Promise<RScriptResult> {
    const { scriptName, params = {}, timeout = 300000 } = options;
    
    const scriptPath = join(this.rScriptsDir, scriptName);
    
    if (!existsSync(scriptPath)) {
      const errorMsg = `R script not found: ${scriptPath}`;
      logger.error('[RService]', errorMsg);
      return { success: false, error: errorMsg };
    }

    // 生成唯一的临时文件 ID
    const jobId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const inputFile = join(this.tempDir, `${jobId}-input.json`);
    const outputFile = join(this.tempDir, `${jobId}-output.json`);
    const errorFile = join(this.tempDir, `${jobId}-error.txt`);

    try {
      // 写入输入参数
      writeFileSync(inputFile, JSON.stringify(params));
      logger.info('[RService] Input written to:', inputFile);

      // 构建 R 脚本调用命令
      // R 脚本需要接收输入文件路径和输出文件路径
      const args = [
        scriptPath,
        inputFile,
        outputFile,
        errorFile
      ];

      logger.info('[RService] Running R script:', this.rPath, args.join(' '));

      return await this._executeRProcess(this.rPath, args, outputFile, errorFile, timeout, jobId);
    } catch (err: any) {
      logger.error('[RService] Execution error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * 执行 R 进程
   */
  private _executeRProcess(
    command: string,
    args: string[],
    outputFile: string,
    errorFile: string,
    timeout: number,
    jobId: string
  ): Promise<RScriptResult> {
    return new Promise((resolve) => {
      let rProcess: ChildProcess | null = null;
      let timedOut = false;

      // 设置超时
      const timeoutId = setTimeout(() => {
        timedOut = true;
        logger.warn('[RService] Script execution timeout, killing process...');
        
        if (rProcess && rProcess.pid) {
          treeKill(rProcess.pid, 'SIGKILL', (err) => {
            if (err) {
              logger.error('[RService] Failed to kill R process:', err.message);
            } else {
              logger.info('[RService] R process killed successfully');
            }
          });
        }

        resolve({ 
          success: false, 
          error: `R script execution timeout after ${timeout / 1000} seconds` 
        });
      }, timeout);

      // 获取 R 环境变量配置
      const rEnv = rPortableService.getREnvironmentVariables();
      
      rProcess = spawn(command, args, { env: rEnv });

      let stderrOutput = '';

      rProcess.stderr?.on('data', (data) => {
        stderrOutput += data.toString();
        logger.debug('[RService] R stderr:', data.toString());
      });

      rProcess.stdout?.on('data', (data) => {
        logger.debug('[RService] R stdout:', data.toString());
      });

      rProcess.on('close', async (code) => {
        clearTimeout(timeoutId);

        if (timedOut) {
          return; // 已超时处理
        }

        try {
          // 检查错误文件
          if (existsSync(errorFile)) {
            const errorContent = readFileSync(errorFile, 'utf-8');
            if (errorContent.trim()) {
              logger.error('[RService] R script error:', errorContent);
              resolve({ 
                success: false, 
                error: errorContent,
                stderr: stderrOutput
              });
              return;
            }
          }

          // 检查退出码
          if (code !== 0) {
            logger.error('[RService] R process exited with code:', code);
            resolve({ 
              success: false, 
              error: `R process exited with code ${code}`,
              stderr: stderrOutput
            });
            return;
          }

          // 读取输出结果
          if (existsSync(outputFile)) {
            const outputContent = readFileSync(outputFile, 'utf-8');
            const result = JSON.parse(outputContent);
            // 确保数据是纯 JSON 对象
            const cleanData = JSON.parse(JSON.stringify(result));
            logger.info('[RService] R script completed successfully');
            resolve({ success: true, data: cleanData });
          } else {
            logger.error('[RService] Output file not found:', outputFile);
            resolve({ 
              success: false, 
              error: 'R script did not produce output file' 
            });
          }
        } catch (err: any) {
          logger.error('[RService] Failed to parse R output:', err.message);
          resolve({ 
            success: false, 
            error: `Failed to parse R output: ${err.message}` 
          });
        } finally {
          // 清理临时文件
          this._cleanupTempFiles(jobId);
        }
      });

      rProcess.on('error', (err) => {
        clearTimeout(timeoutId);
        logger.error('[RService] R process error:', err.message);
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * 清理临时文件
   */
  private _cleanupTempFiles(jobId: string): void {
    const files = [
      join(this.tempDir, `${jobId}-input.json`),
      join(this.tempDir, `${jobId}-output.json`),
      join(this.tempDir, `${jobId}-error.txt`)
    ];

    files.forEach(file => {
      try {
        if (existsSync(file)) {
          // fs.unlinkSync(file); // 可选：清理临时文件
        }
      } catch (err) {
        logger.warn('[RService] Failed to cleanup temp file:', file);
      }
    });
  }
}

// 单例导出
export const rService = new RService();
