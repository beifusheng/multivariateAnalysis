# R 环境快速配置和测试脚本
# 安装 R 包 → 启动应用 → 测试连接

$ErrorActionPreference = "Stop"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  R 环境快速配置" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 获取项目根目录
$projectRoot = Split-Path $PSScriptRoot -Parent
$rPath = Join-Path $projectRoot "r-portable\bin\Rscript.exe"

Write-Host "📍 项目目录：$projectRoot" -ForegroundColor Gray
Write-Host "📍 R 路径：$rPath" -ForegroundColor Gray
Write-Host ""

# 验证 R 是否存在
if (-not (Test-Path $rPath)) {
    Write-Host "❌ R 未找到：$rPath" -ForegroundColor Red
    Write-Host "   请确认 R 已正确安装" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "按任意键退出..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# 验证 R 版本
Write-Host "🔍 验证 R 版本..." -ForegroundColor Cyan
try {
    $version = & $rPath --version 2>&1 | Select-Object -First 1
    Write-Host "✅ $version" -ForegroundColor Green
} catch {
    Write-Host "❌ R 执行失败" -ForegroundColor Red
    Write-Host "按任意键退出..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  安装 R 包" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 用户库路径
$userLib = Join-Path $env:APPDATA "R\win-library"
Write-Host "📦 包安装路径：$userLib" -ForegroundColor Gray
Write-Host ""

# 创建库目录
if (-not (Test-Path $userLib)) {
    New-Item -ItemType Directory -Path $userLib -Force | Out-Null
    Write-Host "✅ 创建库目录" -ForegroundColor Green
}

# 要安装的包
$packages = @("jsonlite", "vegan", "glmnet", "Matrix")

Write-Host "📦 需要安装的包：" -ForegroundColor Yellow
foreach ($pkg in $packages) {
    Write-Host "   - $pkg" -ForegroundColor Gray
}
Write-Host ""

$choice = Read-Host "是否现在安装这些包？(Y/n)"
if ($choice -ne 'n' -and $choice -ne 'N') {
    Write-Host ""
    Write-Host "🚀 开始安装..." -ForegroundColor Yellow
    Write-Host "   这可能需要 3-5 分钟，请耐心等待" -ForegroundColor Gray
    Write-Host ""
    
    # 安装脚本
    $installScript = @"
options(repos = "https://cloud.r-project.org")
.libPaths("$userLib")

packages <- c("$($packages -join '","')")

cat("📦 开始安装 R 包...\n\n")

for (pkg in packages) {
    cat("安装", pkg, "... ")
    flush.console()
    
    tryCatch({
        install.packages(pkg, quiet = TRUE)
        
        if (require(pkg, character.only = TRUE, quietly = TRUE)) {
            cat("✅\n")
            flush.console()
        } else {
            cat("❌ 加载失败\n")
            flush.console()
        }
    }, error = function(e) {
        cat("❌", e$message, "\n")
        flush.console()
    })
}

cat("\n✅ 包安装完成!\n")
"@
    
    # 执行安装
    try {
        & $rPath -e $installScript
    } catch {
        Write-Host "❌ 包安装失败：$($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        Write-Host "可以手动安装：" -ForegroundColor Yellow
        Write-Host "  & '$rPath' -e `"install.packages(c('jsonlite','vegan','glmnet','Matrix'))`"" -ForegroundColor Cyan
        Write-Host ""
    }
} else {
    Write-Host "ℹ️  跳过包安装" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  启动 Electron 应用" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$choice = Read-Host "是否现在启动应用？(Y/n)"
if ($choice -ne 'n' -and $choice -ne 'N') {
    Write-Host ""
    Write-Host "🚀 启动应用..." -ForegroundColor Yellow
    Write-Host "   命令：npm run dev" -ForegroundColor Gray
    Write-Host ""
    
    # 切换到项目目录
    Set-Location $projectRoot
    
    # 启动应用
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
    
    Write-Host "✅ 应用已在新窗口启动" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 下一步：" -ForegroundColor Cyan
    Write-Host "  1. 等待应用启动完成" -ForegroundColor White
    Write-Host "  2. 在应用中找到 'R 分析' 或 'RAnalysis' 页面" -ForegroundColor White
    Write-Host "  3. 点击 '检查 R 环境' 按钮" -ForegroundColor White
    Write-Host "  4. 确认显示 '✅ R 环境就绪'" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 提示：" -ForegroundColor Yellow
    Write-Host "  - 如果显示 R 未找到，请重启应用" -ForegroundColor White
    Write-Host "  - 首次启动可能需要几十秒" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "ℹ️  可以手动运行 'npm run dev' 启动应用" -ForegroundColor Yellow
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "  配置完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
