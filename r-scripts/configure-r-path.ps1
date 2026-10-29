# 便携版 R 路径配置脚本
# 无需管理员权限 - 仅修改用户环境变量
# 使用方法：右键 -> 使用 PowerShell 运行

param(
    [string]$RPath = "",
    [switch]$Remove,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  便携版 R 路径配置工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 获取当前用户 PATH
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")

Write-Host "📍 当前用户 PATH 长度：$($userPath.Length) 字符" -ForegroundColor Gray
Write-Host "📍 当前系统 PATH 长度：$($machinePath.Length) 字符" -ForegroundColor Gray
Write-Host ""

# 自动检测常见的 R 便携版位置
function Find-RPortable {
    $possiblePaths = @(
        "$PSScriptRoot\r-portable\bin",
        "$PSScriptRoot\r\bin",
        "$env:LOCALAPPDATA\R-Portable\bin",
        "$env:USERPROFILE\R-Portable\bin",
        "$env:USERPROFILE\AppData\Local\R-Portable\bin",
        "D:\R-Portable\bin",
        "E:\R-Portable\bin"
    )
    
    Write-Host "🔍 正在检测便携版 R..." -ForegroundColor Yellow
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $rscript = Join-Path $path "Rscript.exe"
            if (Test-Path $rscript) {
                Write-Host "✅ 找到 R: $path" -ForegroundColor Green
                return $path
            }
        }
    }
    
    Write-Host "❌ 未找到便携版 R" -ForegroundColor Red
    return $null
}

# 检查 R 是否已在 PATH 中
function Test-RInPath {
    param([string]$RPath)
    
    return $userPath -like "*$RPath*" -or $machinePath -like "*$RPath*"
}

# 添加 R 到用户 PATH
function Add-RToPath {
    param([string]$RPath)
    
    if (Test-RInPath $RPath) {
        Write-Host "ℹ️  R 已在 PATH 中，无需添加" -ForegroundColor Yellow
        return $true
    }
    
    try {
        $newPath = $userPath + ";" + $RPath
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Host "✅ R 已添加到用户 PATH" -ForegroundColor Green
        Write-Host "   路径：$RPath" -ForegroundColor Gray
        return $true
    }
    catch {
        Write-Host "❌ 添加失败：$($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# 从用户 PATH 移除 R
function Remove-RFromPath {
    param([string]$RPath)
    
    if (-not (Test-RInPath $RPath)) {
        Write-Host "ℹ️  R 不在 PATH 中，无需移除" -ForegroundColor Yellow
        return $true
    }
    
    try {
        $paths = $userPath -split ';' | Where-Object { $_ -ne $RPath -and $_.Trim() -ne "" }
        $newPath = $paths -join ';'
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Host "✅ R 已从用户 PATH 移除" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "❌ 移除失败：$($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# 验证 R 安装
function Test-RInstallation {
    param([string]$RPath)
    
    $rscript = Join-Path $RPath "Rscript.exe"
    
    if (-not (Test-Path $rscript)) {
        Write-Host "❌ Rscript.exe 不存在：$rscript" -ForegroundColor Red
        return $false
    }
    
    try {
        $version = & $rscript --version 2>&1 | Select-Object -First 1
        Write-Host "✅ R 版本：$version" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "❌ R 执行失败：$($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# 主逻辑
if ($CheckOnly) {
    Write-Host "🔍 检查模式" -ForegroundColor Cyan
    Write-Host ""
    
    # 检查当前 PATH 中的 R
    $rInUserPath = $userPath -split ';' | Where-Object { $_ -like "*R-Portable*" -or $_ -like "*\R\bin*" }
    
    if ($rInUserPath) {
        Write-Host "📌 PATH 中的 R:" -ForegroundColor Green
        foreach ($path in $rInUserPath) {
            Write-Host "   $path" -ForegroundColor Gray
        }
    } else {
        Write-Host "📌 PATH 中没有 R" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "🔍 检测常见位置的 R:" -ForegroundColor Cyan
    
    $found = Find-RPortable
    if ($found) {
        Write-Host ""
        Write-Host "要添加此 R 到 PATH，运行:" -ForegroundColor Yellow
        Write-Host "  .\configure-r-path.ps1 -RPath `"$found`"" -ForegroundColor Cyan
    }
    
    return
}

# 如果没有指定路径，尝试自动检测
if ([string]::IsNullOrEmpty($RPath)) {
    $found = Find-RPortable
    
    if ($found) {
        $RPath = $found
    } else {
        Write-Host ""
        Write-Host "请输入 R 的 bin 目录路径（包含 Rscript.exe）:" -ForegroundColor Yellow
        Write-Host "例如：C:\Users\你的用户名\R-Portable\bin" -ForegroundColor Gray
        Write-Host ""
        $RPath = Read-Host "R 路径"
    }
}

# 验证输入路径
if (-not (Test-Path $RPath)) {
    Write-Host "❌ 路径不存在：$RPath" -ForegroundColor Red
    Write-Host "请按任意键退出..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# 验证 R 安装
Write-Host ""
Write-Host "🔍 验证 R 安装..." -ForegroundColor Cyan
if (-not (Test-RInstallation $RPath)) {
    Write-Host "请按任意键退出..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# 执行操作
Write-Host ""
if ($Remove) {
    Write-Host "🗑️  正在移除 R 路径..." -ForegroundColor Cyan
    Remove-RFromPath $RPath
} else {
    Write-Host "➕ 正在添加 R 路径..." -ForegroundColor Cyan
    Add-RToPath $RPath
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  配置完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  注意：" -ForegroundColor Yellow
Write-Host "   1. 请重启 PowerShell/终端使更改生效" -ForegroundColor White
Write-Host "   2. 如果是应用内调用，请重启应用" -ForegroundColor White
Write-Host "   3. 验证：打开新终端运行 'Rscript --version'" -ForegroundColor White
Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
