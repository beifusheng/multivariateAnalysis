@echo off
chcp 65001 >nul
title 便携版 R 路径配置工具

echo ========================================
echo   便携版 R 路径配置工具
echo ========================================
echo.

:: 检查 PowerShell 是否可用
where powershell >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 PowerShell
    echo 请按任意键退出...
    pause >nul
    exit /b 1
)

:: 运行 PowerShell 脚本
powershell -ExecutionPolicy Bypass -File "%~dp0configure-r-path.ps1"

:: 如果 PowerShell 脚本返回错误
if %errorlevel% neq 0 (
    echo.
    echo [错误] 配置失败
    echo 请按任意键退出...
    pause >nul
    exit /b 1
)

exit /b 0
