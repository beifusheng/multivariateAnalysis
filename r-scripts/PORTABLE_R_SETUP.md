# 便携版 R 配置指南（无需管理员权限）

## 📥 方案一：解压到用户目录（推荐）

### 步骤 1：下载 R

**官方 Windows 版本：**
1. 访问 https://cran.r-project.org/bin/windows/base/
2. 下载 `R-4.x.x-win.exe`（约 80MB）

**或使用 7-Zip 提取（无需运行安装程序）：**
```bash
# 使用 7-Zip 命令行提取
7z x R-4.3.2-win.exe -oC:\Users\你的用户名\R-Portable
```

### 步骤 2：解压到用户目录

推荐位置（任选其一）：

```
C:\Users\你的用户名\R-Portable\
C:\Users\你的用户名\AppData\Local\R-Portable\
D:\你的目录\R-Portable\  （如果有其他盘）
```

**目录结构应如下：**
```
R-Portable/
├── bin/
│   ├── R.exe
│   ├── Rscript.exe
│   └── x64/
├── library/          # 系统包目录
├── share/
└── etc/
```

### 步骤 3：添加到用户环境变量 PATH

**方法 A：通过系统设置（推荐）**

1. 按 `Win + R`，输入 `sysdm.cpl`，回车
2. 点击"高级"选项卡
3. 点击"环境变量"按钮
4. 在"用户变量"区域，找到并选中 `Path`
5. 点击"编辑"
6. 点击"新建"
7. 输入 R 的 bin 目录路径，例如：
   ```
   C:\Users\你的用户名\R-Portable\bin
   ```
8. 连续点击"确定"保存
9. **重启终端或应用**使更改生效

**方法 B：使用 PowerShell（快速）**

```powershell
# 获取当前用户 PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

# 添加 R 路径（修改为你的实际路径）
$rPath = "C:\Users\你的用户名\R-Portable\bin"

# 如果 PATH 中不包含 R 路径，则添加
if ($currentPath -notlike "*$rPath*") {
    $newPath = $currentPath + ";" + $rPath
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host "✅ R 已添加到用户 PATH"
} else {
    Write-Host "ℹ️ R 已在 PATH 中"
}

# 验证
Write-Host "当前用户 PATH:"
[Environment]::GetEnvironmentVariable("Path", "User")
```

**保存为 `add-r-to-path.ps1` 并运行：**
```powershell
# 右键 -> 使用 PowerShell 运行
# 或
powershell -ExecutionPolicy Bypass -File add-r-to-path.ps1
```

### 步骤 4：验证安装

**打开新的命令提示符（重要：必须是新的窗口）：**

```bash
# 检查 Rscript
Rscript --version

# 检查 R
R --version
```

如果显示版本信息，说明配置成功！

---

## 📦 方案二：应用自动检测（最简单）

### 步骤 1：解压 R 到应用目录

将便携版 R 解压到以下任一位置：

```
electron-egg/
├── r-portable/          # ← 解压到这里
├── electron/
├── frontend/
└── package.json
```

**或：**
```
electron-egg/
├── resources/
│   └── r-portable/      # ← 解压到这里
└── package.json
```

### 步骤 2：应用自动检测

应用启动时会自动检测这些位置的 R：

- `应用目录/r-portable/`
- `应用目录/r/`
- `应用目录/resources/r-portable/`
- `%LOCALAPPDATA%/R-Portable/`
- `%USERPROFILE%/R-Portable/`

**无需手动配置 PATH！**

### 步骤 3：安装 R 包

R 包会安装到用户目录，无需管理员权限：

```r
# 在 R 中运行
.libPaths()  # 查看当前库路径

# 安装包到用户库
install.packages("vegan")

# 或指定用户库路径
user_lib <- file.path(Sys.getenv("USERPROFILE"), "Documents", "R", "win-library")
dir.create(user_lib, recursive = TRUE, showWarnings = FALSE)
.libPaths(c(user_lib, .libPaths()))
install.packages("vegan", lib = user_lib)
```

---

## 📁 方案三：完全便携（U 盘可用）

### 创建完全便携的 R 环境

**目录结构：**
```
MyPortableR/
├── R-Portable/          # R 安装
│   ├── bin/
│   ├── library/
│   └── ...
├── R-Library/           # 用户包（可更新）
│   └── [packages]
├── RunR.bat             # 启动脚本
└── InstallPackages.bat  # 安装包脚本
```

**RunR.bat：**
```batch
@echo off
setlocal

:: 设置 R 路径
set R_HOME=%~dp0R-Portable
set R_SCRIPT=%R_HOME%\bin\Rscript.exe

:: 设置用户库路径
set R_LIBS_USER=%~dp0R-Library

:: 运行 R 脚本
"%R_SCRIPT%" %*

endlocal
```

**InstallPackages.bat：**
```batch
@echo off
setlocal

set R_HOME=%~dp0R-Portable
set R_SCRIPT=%R_HOME%\bin\Rscript.exe
set R_LIBS_USER=%~dp0R-Library

:: 创建库目录
if not exist "%R_LIBS_USER%" mkdir "%R_LIBS_USER%"

:: 安装包
"%R_SCRIPT%" -e "install.packages(c('jsonlite', 'vegan', 'glmnet'), lib=Sys.getenv('R_LIBS_USER'))"

echo.
echo ✅ 包安装完成！
pause
```

---

## 🔧 应用内配置

### 在 Electron 应用中设置 R 路径

如果自动检测失败，可以在应用中手动配置：

**前端调用：**
```javascript
// 使用文件选择器选择 Rscript.exe
const result = await ipcRenderer.invoke('rController:setRPath', 
  'C:\\Users\\你的用户名\\R-Portable\\bin\\Rscript.exe'
);

if (result.success) {
  console.log('R 路径配置成功');
  console.log('R 路径:', result.rPath);
  console.log('库路径:', result.libraryPath);
}
```

### 查看便携版 R 信息

```javascript
const info = await ipcRenderer.invoke('rController:getPortableRInfo');
console.log('便携版 R 信息:', info);
// {
//   hasPortable: true,
//   rPath: 'C:\\...\\R-Portable\\bin\\Rscript.exe',
//   libraryPath: 'C:\\...\\AppData\\Roaming\\...\\r-library',
//   searchPaths: [...]
// }
```

---

## 📦 R 包安装（无需管理员）

### 方法 1：在 R 中直接安装

```r
# 查看所有库路径
.libPaths()

# 安装包到第一个可写路径
install.packages("vegan")

# 或明确指定用户库
user_lib <- file.path(Sys.getenv("APPDATA"), "R", "win-library")
dir.create(user_lib, recursive = TRUE)
install.packages("vegan", lib = user_lib)
```

### 方法 2：使用应用生成的脚本

```javascript
// 创建包安装脚本
const result = await ipcRenderer.invoke(
  'rController:createPackageInstallScript',
  ['jsonlite', 'vegan', 'glmnet', 'Matrix']
);

if (result.success) {
  console.log('脚本路径:', result.scriptPath);
  // 然后运行：Rscript 脚本路径
}
```

### 方法 3：批量安装脚本

保存为 `install-packages.R`：

```r
# 用户库路径
user_lib <- file.path(Sys.getenv("APPDATA"), "R", "win-library")
dir.create(user_lib, recursive = TRUE, showWarnings = FALSE)

# 添加到库路径
.libPaths(c(user_lib, .libPaths()))

# 要安装的包
packages <- c(
  "jsonlite",
  "vegan", 
  "glmnet",
  "Matrix",
  "devtools"
)

# 安装
install.packages(packages, lib = user_lib)

# 验证
for (pkg in packages) {
  if (require(pkg, character.only = TRUE, quietly = TRUE)) {
    cat("✅", pkg, "OK\n")
  } else {
    cat("❌", pkg, "FAIL\n")
  }
}
```

运行：
```bash
Rscript install-packages.R
```

---

## ⚠️ 常见问题

### Q: "拒绝访问"错误
**A:** 确保不要安装到 `C:\Program Files\` 等需要管理员权限的目录。使用用户目录。

### Q: PATH 设置后不生效
**A:** 
1. 必须重启命令提示符/终端
2. 如果是应用内调用，重启应用
3. 使用完整路径测试：`C:\...\R-Portable\bin\Rscript.exe --version`

### Q: 包安装到错误位置
**A:** 明确指定 `lib` 参数：
```r
install.packages("vegan", lib = "C:\\Users\\用户名\\Documents\\R\\win-library")
```

### Q: 应用检测不到便携版 R
**A:** 
1. 确保目录结构正确（必须有 `bin\Rscript.exe`）
2. 查看应用日志确认搜索路径
3. 手动调用 `setRPath` 配置

### Q: 如何在没有网络的电脑上使用？
**A:** 
1. 在有网络的电脑安装好 R 和所有包
2. 复制整个 `R-Portable` 和 `R-Library` 目录
3. 在无网络电脑上使用相对路径配置

---

## 📚 推荐目录结构

**开发环境：**
```
C:\Users\你的用户名\
├── R-Portable\              # R 安装
│   ├── bin\
│   └── library\
├── Documents\R\win-library\ # 用户包（默认位置）
└── Projects\electron-egg\   # 项目
    ├── r-scripts\
    └── ...
```

**便携环境：**
```
D:\PortableApps\
├── R-Portable\
│   ├── bin\
│   └── library\
└── R-Packages\              # 独立包目录
    └── [packages]
```

---

## 🎯 最佳实践

1. **使用用户目录** - 避免权限问题
2. **分离 R 和包** - R 安装和包库分开，便于更新
3. **记录路径** - 保存 R 路径配置到应用设置
4. **自动检测** - 优先使用应用的自动检测功能
5. **备份包库** - 定期备份用户包目录
