# R 环境配置指南

## 📥 1. 安装 R

### Windows 用户
1. 访问 https://cran.r-project.org/bin/windows/base/
2. 下载最新版 R (例如：R-4.3.2-win.exe)
3. 运行安装程序，建议使用默认设置
4. 安装完成后，验证安装：
   ```bash
   Rscript --version
   ```

### 可选：RStudio
- 下载地址：https://posit.co/download/rstudio-desktop/
- RStudio 提供更友好的 R 开发界面

---

## 📦 2. 安装必需的 R 包

在 R 或 RStudio 中运行以下命令：

```r
# 基础包（所有分析都需要）
install.packages(c("jsonlite", "Matrix"))

# PERMANOVA 相关
install.packages("vegan")

# PERMANOVA-med (中介分析)
# 需要从 GitHub 安装 LDM 包
if (!require("devtools")) install.packages("devtools")
devtools::install_github("yijuanhu/LDM")

# GMR⁴ 相关
install.packages("glmnet")

# Bayesian ERA with Mediation
install.packages("rstan")
# 注意：rstan 安装较复杂，详见 https://mc-stan.org/users/interfaces/rstan-install

# 非随机 PERMANOVA 扩展
# vegan 包已包含 avgdist 函数
```

### 一键安装脚本

保存为 `install_packages.R` 并运行：

```r
# install_packages.R
packages <- c(
  "jsonlite",
  "Matrix", 
  "vegan",
  "glmnet",
  "devtools"
)

# 安装基础包
install.packages(packages, repos = "https://cloud.r-project.org/")

# 安装 LDM (PERMANOVA-med)
devtools::install_github("yijuanhu/LDM")

# 安装 rstan (Bayesian ERA)
# 注意：这可能需要较长时间
install.packages("rstan", type = "source")

cat("\n✅ 所有包安装完成!\n")
```

运行：
```bash
Rscript install_packages.R
```

---

## 🔧 3. 配置 R 路径（可选）

如果 R 不在系统 PATH 中，需要在 Electron 应用中配置：

### 方法 1：添加到系统 PATH（推荐）
1. 找到 R 安装目录（例如：`C:\Program Files\R\R-4.3.2\bin`）
2. 添加到系统环境变量 PATH

### 方法 2：在应用中配置
在应用启动时调用：
```javascript
rService.setRPath('C:\\Program Files\\R\\R-4.3.2\\bin\\Rscript.exe');
```

---

## 📁 4. R 脚本说明

本项目包含以下 R 脚本：

| 脚本文件 | 功能 | 依赖包 |
|---------|------|--------|
| `permanova.R` | PERMANOVA 分析 | vegan, jsonlite |
| `permanova_med.R` | PERMANOVA 中介分析 | LDM, jsonlite |
| `gmr4.R` | GMR⁴ 分析 | glmnet, Matrix, jsonlite |
| `bayesian_era_mediation.R` | 贝叶斯 ERA 中介分析 | rstan, jsonlite |
| `nonrandom_permanova.R` | 非随机 PERMANOVA | vegan, jsonlite |

---

## 🧪 5. 测试 R 环境

在 Electron 应用中运行"检查 R 环境"功能，或手动测试：

```bash
# 测试脚本执行
Rscript r-scripts/permanova.R test_input.json test_output.json test_error.txt
```

---

## 📦 6. 打包发布（可选）

如果需要将 R 一起打包到应用中：

### 方案 A：便携版 R
1. 下载 R 便携版：https://sourceforge.net/projects/rportable/
2. 解压到项目目录（例如：`r-portable/`）
3. 在 `electron-builder.yml` 中添加：
   ```yaml
   extraResources:
     - from: r-portable/
       to: r-portable/
   ```
4. 在应用中配置 R 路径：
   ```javascript
   const rPath = path.join(app.getAppPath(), 'r-portable', 'bin', 'Rscript.exe');
   rService.setRPath(rPath);
   ```

### 方案 B：让用户自备 R（推荐）
- 应用体积更小
- 用户可以自己更新 R 和包
- 只需在文档中提供安装指南

---

## ⚠️ 常见问题

### Q: "Rscript 不是内部或外部命令"
A: R 未安装或未添加到 PATH。重新安装 R 并勾选"添加到 PATH"选项。

### Q: "package 'vegan' is not available"
A: 包未安装。在 R 中运行 `install.packages("vegan")`。

### Q: rstan 安装失败
A: rstan 需要 C++ 编译环境。Windows 用户需要安装 RTools：https://cran.r-project.org/bin/windows/Rtools/

### Q: 分析运行超时
A: 复杂模型（特别是贝叶斯方法）可能需要较长时间。可以在调用时增加 `timeout` 参数。

---

## 📚 参考资料

- PERMANOVA: https://cran.r-project.org/web/packages/vegan/index.html
- LDM (PERMANOVA-med): https://github.com/yijuanhu/LDM
- GMR⁴: 参考 2025 年相关论文
- Bayesian ERA: https://www.cambridge.org/core/journals/psychometrika/article/mediation-analysis-in-bayesian-extended-redundancy-analysis-with-mixed-outcome-variables/99482D89AE225C5863AAFBD01041FD3A
- rstan: https://mc-stan.org/users/interfaces/rstan
