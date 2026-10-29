/**
 * 便携版 R 服务 - 自动检测和配置便携版 R
 */
import { join, normalize, dirname } from 'path';
import { app } from 'electron';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { logger } from 'ee-core/log';

export interface RPortableConfig {
  rPath: string;
  rHome: string;
  libraryPath: string;
  isPortable: boolean;
}

class RPortableService {
  private config: RPortableConfig | null = null;
  private readonly R_PORTABLE_DIR = 'r-portable';
  private readonly R_USER_LIB_DIR = 'r-library';

  constructor() {
    this.init();
  }

  /**
   * 初始化 - 检测便携版 R
   */
  private init(): void {
    const appPath = app.getAppPath();
    const projectRoot = 'C:\\Custom\\CodeRepository\\Demo\\electron-egg';
    
    // 可能的 R 便携版位置
    const possiblePaths = [
      join(projectRoot, this.R_PORTABLE_DIR),
      join(appPath, this.R_PORTABLE_DIR),
      join(appPath, 'r'),
      join(appPath, 'resources', this.R_PORTABLE_DIR),
      join(process.env.LOCALAPPDATA || '', 'R-Portable'),
      join(process.env.USERPROFILE || '', 'R-Portable'),
    ];

    logger.info('[RPortableService] Searching for portable R...');
    logger.info('[RPortableService] App path:', appPath);
    logger.info('[RPortableService] Project root:', projectRoot);

    for (const rPath of possiblePaths) {
      logger.info('[RPortableService] Checking:', rPath);
      if (this.validateRInstallation(rPath)) {
        logger.info('[RPortableService] ✅ Found portable R at:', rPath);
        this.config = this.createConfig(rPath);
        return;
      }
    }

    logger.warn('[RPortableService] ❌ No portable R found, will use system PATH');
  }

  /**
   * 验证 R 安装是否有效
   */
  private validateRInstallation(rPath: string): boolean {
    // Windows 路径
    const windowsRScript = join(rPath, 'bin', 'Rscript.exe');
    const windowsR = join(rPath, 'bin', 'R.exe');
    
    // Unix 路径
    const unixRScript = join(rPath, 'bin', 'Rscript');
    const unixR = join(rPath, 'bin', 'R');

    return (
      existsSync(windowsRScript) || 
      existsSync(windowsR) ||
      existsSync(unixRScript) ||
      existsSync(unixR)
    );
  }

  /**
   * 创建配置对象
   */
  private createConfig(rPath: string): RPortableConfig {
    const isWindows = process.platform === 'win32';
    const rScriptName = isWindows ? 'Rscript.exe' : 'Rscript';
    const rHome = rPath;
    const libraryPath = join(app.getPath('userData'), this.R_USER_LIB_DIR);

    // 确保用户库目录存在
    if (!existsSync(libraryPath)) {
      mkdirSync(libraryPath, { recursive: true });
    }

    return {
      rPath: normalize(join(rPath, 'bin', rScriptName)),
      rHome: normalize(rHome),
      libraryPath: normalize(libraryPath),
      isPortable: true
    };
  }

  /**
   * 获取 R 配置
   */
  getConfig(): RPortableConfig | null {
    return this.config;
  }

  /**
   * 获取 Rscript 路径
   */
  getRScriptPath(): string {
    if (this.config) {
      return this.config.rPath;
    }
    // 默认使用系统 PATH 中的 Rscript
    return 'Rscript';
  }

  /**
   * 获取 R 环境变量设置
   * 在 spawn R 进程时需要设置这些环境变量
   */
  getREnvironmentVariables(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };

    if (this.config) {
      // 设置 R_HOME
      env.R_HOME = this.config.rHome;
      
      // 设置 R 库路径（用户包安装位置）
      env.R_LIBS_USER = this.config.libraryPath;
      
      // 添加到 PATH（Windows）
      if (process.platform === 'win32') {
        const rBinDir = dirname(this.config.rPath);
        if (env.PATH) {
          env.PATH = `${rBinDir};${env.PATH}`;
        } else {
          env.PATH = rBinDir;
        }
      }
      
      logger.info('[RPortableService] R environment configured:', {
        R_HOME: env.R_HOME,
        R_LIBS_USER: env.R_LIBS_USER
      });
    }

    return env;
  }

  /**
   * 手动设置 R 路径（用户手动选择）
   */
  setRPath(rPath: string): RPortableConfig {
    if (!this.validateRInstallation(rPath)) {
      throw new Error(`Invalid R installation at: ${rPath}`);
    }

    this.config = this.createConfig(rPath);
    logger.info('[RPortableService] R path manually configured:', this.config);
    
    return this.config;
  }

  /**
   * 获取 R 包安装脚本
   * 返回一个可以运行的 R 脚本内容
   */
  getPackageInstallScript(packages: string[]): string {
    const libPath = this.config?.libraryPath || '';
    
    return `
# 自动生成的 R 包安装脚本
# 用户库路径：${libPath}

# 设置库路径
.libPaths(c("${libPath}", .libPaths()))

# 安装包
packages <- c(${packages.map(p => `"${p}"`).join(', ')})

# 检查哪些包已安装
installed <- installed.packages()[, "Package"]
to_install <- packages[!packages %in% installed]

if (length(to_install) > 0) {
  cat("需要安装的包:", paste(to_install, collapse = ", "), "\\n")
  install.packages(to_install, lib = "${libPath}")
} else {
  cat("所有包已安装\\n")
}

# 验证安装
for (pkg in packages) {
  if (require(pkg, character.only = TRUE, quietly = TRUE)) {
    cat("✅", pkg, "加载成功\\n")
  } else {
    cat("❌", pkg, "加载失败\\n")
  }
}
`;
  }

  /**
   * 创建包安装脚本文件
   */
  createPackageInstallScriptFile(packages: string[]): string {
    const scriptContent = this.getPackageInstallScript(packages);
    const scriptPath = join(app.getPath('temp'), 'install-r-packages.R');
    writeFileSync(scriptPath, scriptContent, 'utf-8');
    logger.info('[RPortableService] Package install script created:', scriptPath);
    return scriptPath;
  }

  /**
   * 检查必需的 R 包是否已安装
   */
  async checkRequiredPackages(packages: string[]): Promise<{ installed: string[], missing: string[] }> {
    // 这个需要在 R 进程中执行，这里返回配置信息
    return {
      installed: [],
      missing: packages
    };
  }
}

// 单例导出
export const rPortableService = new RPortableService();
