# R 便携版安装脚本
# 自动下载并配置 R 便携版（无需管理员权限）

param(
    [string]$RVersion = "4.3.3",  # 稳定版本
    [string]$InstallPath = "",
    [switch]$UseExistingInstaller
)

$ErrorActionPreference = "Stop"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  R 便携版自动安装工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 确定安装路径
if ([string]::IsNullOrEmpty($InstallPath)) {
    # 默认安装到脚本所在目录的 r-portable 文件夹
    $InstallPath = Join-Path $PSScriptRoot "r-portable"
}

Write-Host "📍 安装路径：$InstallPath" -ForegroundColor Gray
Write-Host ""

# 检查是否已存在
if (Test-Path $InstallPath) {
    if (Test-Path (Join-Path $InstallPath "bin\Rscript.exe")) {
        Write-Host "✅ R 已安装在：$InstallPath" -ForegroundColor Green
        
        $version = & (Join-Path $InstallPath "bin\Rscript.exe") --version 2>&1 | Select-Object -First 1
        Write-Host "   版本：$version" -ForegroundColor Gray
        
        $choice = Read-Host "是否重新安装？(y/N)"
        if ($choice -ne 'y' -and $choice -ne 'Y') {
            return
        }
        
        Write-Host "🗑️  正在删除旧版本..." -ForegroundColor Yellow
        Remove-Item $InstallPath -Recurse -Force
    } else {
        Write-Host "🗑️  正在清理无效目录..." -ForegroundColor Yellow
        Remove-Item $InstallPath -Recurse -Force
    }
}

# 创建安装目录
Write-Host "📁 创建安装目录..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null

# 查找现有的 R 安装程序
$installerPath = ""
if ($UseExistingInstaller) {
    # 在 Downloads 目录查找
    $downloadsPath = Join-Path $env:USERPROFILE "Downloads"
    $installers = Get-ChildItem $downloadsPath -Filter "R-*-win.exe" | Sort-Object LastWriteTime -Descending
    
    if ($installers.Count -gt 0) {
        $installerPath = $installers[0].FullName
        Write-Host "📦 找到现有安装程序：$installerPath" -ForegroundColor Green
    }
}

# 如果没有找到安装程序，提示用户
if ([string]::IsNullOrEmpty($installerPath)) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "  需要 R 安装程序" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "请下载 R for Windows:" -ForegroundColor White
    Write-Host "  https://cran.r-project.org/bin/windows/base/" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "或者运行以下命令打开下载页面：" -ForegroundColor Gray
    Write-Host "  Start-Process 'https://cran.r-project.org/bin/windows/base/'" -ForegroundColor Cyan
    Write-Host ""
    
    $choice = Read-Host "是否打开下载页面？(Y/n)"
    if ($choice -ne 'n' -and $choice -ne 'N') {
        Start-Process "https://cran.r-project.org/bin/windows/base/"
        Write-Host ""
        Write-Host "💡 下载完成后，再次运行此脚本并选择使用现有安装程序" -ForegroundColor Yellow
        Write-Host "   或在参数中指定安装程序路径" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "示例：" -ForegroundColor Gray
        Write-Host "  .\install-r-portable.ps1 -UseExistingInstaller" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "按任意键退出..." -ForegroundColor Gray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        return
    }
}

# 运行安装程序
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  开始安装 R" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not [string]::IsNullOrEmpty($installerPath)) {
    Write-Host "🚀 运行安装程序..." -ForegroundColor Yellow
    Write-Host "   安装程序：$installerPath" -ForegroundColor Gray
    Write-Host "   目标路径：$InstallPath" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "⚠️  安装向导将启动，请按以下步骤操作：" -ForegroundColor Yellow
    Write-Host "   1. 点击 'Next' → 'I Accept' → 'Next'" -ForegroundColor White
    Write-Host "   2. 在安装路径页面，修改为：" -ForegroundColor White
    Write-Host "      $InstallPath" -ForegroundColor Cyan
    Write-Host "   3. 继续点击 'Next' → 'Install'" -ForegroundColor White
    Write-Host "   4. 等待安装完成" -ForegroundColor White
    Write-Host ""
    
    # 启动安装程序
    Start-Process $installerPath
    
    Write-Host "💡 安装完成后，按任意键继续配置..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
} else {
    Write-Host "❌ 未找到安装程序" -ForegroundColor Red
    return
}

# 验证安装
Write-Host ""
Write-Host "🔍 验证安装..." -ForegroundColor Cyan

$rscriptPath = Join-Path $InstallPath "bin\Rscript.exe"
if (Test-Path $rscriptPath) {
    Write-Host "✅ R 安装成功！" -ForegroundColor Green
    Write-Host "   路径：$rscriptPath" -ForegroundColor Gray
    
    try {
        $version = & $rscriptPath --version 2>&1 | Select-Object -First 1
        Write-Host "   版本：$version" -ForegroundColor Gray
    } catch {
        Write-Host "   ⚠️  无法获取版本信息" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ 安装验证失败" -ForegroundColor Red
    Write-Host "   未找到：$rscriptPath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "请确认：" -ForegroundColor Yellow
    Write-Host "  1. 安装程序已完成" -ForegroundColor White
    Write-Host "  2. 安装路径正确设置为：$InstallPath" -ForegroundColor White
    Write-Host ""
    Write-Host "按任意键退出..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    return
}

# 添加到用户 PATH（可选）
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  配置环境变量" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$choice = Read-Host "是否将 R 添加到用户 PATH？(Y/n)"
if ($choice -ne 'n' -and $choice -ne 'N') {
    $rBinPath = Join-Path $InstallPath "bin"
    
    try {
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        
        if ($userPath -notlike "*$rBinPath*") {
            $newPath = $userPath + ";" + $rBinPath
            [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
            Write-Host "✅ R 已添加到用户 PATH" -ForegroundColor Green
            Write-Host "   路径：$rBinPath" -ForegroundColor Gray
            Write-Host ""
            Write-Host "⚠️  注意：需要重启 PowerShell/终端使更改生效" -ForegroundColor Yellow
        } else {
            Write-Host "ℹ️  R 已在 PATH 中" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "❌ 配置 PATH 失败：$($_.Exception.Message)" -ForegroundColor Red
    }
}

# 创建包安装脚本
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  创建 R 包安装脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$packageScript = @"
# R 包自动安装脚本
# 生成时间：$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

# 用户库路径
user_lib <- file.path(Sys.getenv("APPDATA"), "R", "win-library")
dir.create(user_lib, recursive = TRUE, showWarnings = FALSE)
.libPaths(c(user_lib, .libPaths()))

# 要安装的包
packages <- c(
    "jsonlite",
    "vegan", 
    "glmnet",
    "Matrix"
)

cat("📦 开始安装 R 包...\n")
cat("   库路径：", user_lib, "\n\n")

# 安装包
for (pkg in packages) {
    cat("安装", pkg, "... ")
    tryCatch({
        install.packages(pkg, lib = user_lib, quiet = TRUE)
        if (require(pkg, character.only = TRUE, quietly = TRUE)) {
            cat("✅\n")
        } else {
            cat("❌ 加载失败\n")
        }
    }, error = function(e) {
        cat("❌", e$message, "\n")
    })
}

cat("\n✅ 包安装完成!\n")
"@

$scriptPath = Join-Path $PSScriptRoot "install-packages.R"
$packageScript | Out-File -FilePath $scriptPath -Encoding UTF8

Write-Host "✅ 包安装脚本已创建：$scriptPath" -ForegroundColor Green
Write-Host ""
Write-Host "运行以下命令安装 R 包：" -ForegroundColor Yellow
Write-Host "  & '$rscriptPath' '$scriptPath'" -ForegroundColor Cyan
Write-Host ""

# 完成
Write-Host "========================================" -ForegroundColor Green
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📋 下一步：" -ForegroundColor Cyan
Write-Host "  1. 安装 R 包（如果还没安装）" -ForegroundColor White
Write-Host "     & '$rscriptPath' '$scriptPath'" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. 启动 Electron 应用" -ForegroundColor White
Write-Host "     npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. 在应用中检查 R 环境" -ForegroundColor White
Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
