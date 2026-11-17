# R 运行时装配与校验（唯一入口文档）

> 这份文档取代了之前 10 份互相矛盾的安装说明（`README_R_SETUP.md` / `R_SETUP_GUIDE.md` /
> `INSTALL_R_PACKAGES.md` / `OFFLINE_INSTALL_GUIDE.md` / `LDM_COMPATIBILITY_WARNING.md` /
> `PERMANOVA_MED_ALTERNATIVES.md` / `安装说明.md` / `快速开始.md` 等），以及 30 多个
> `install-*.bat` / `check-*.bat` / `test-*.ps1` 试验脚本。它们大多是同一次误判的产物，
> 结论已经作废，留着只会误导后来的人。

## 1. 一条最重要的更正：不是 R 版本兼容问题

之前 `permanova_med.R` 报 `subscript out of bounds`，被当成「R 4.6 与 LDM 不兼容」，于是降到
R 4.3.3。**降级是不必要的**。真实原因是 LDM 内部 `n.perm.block = 100`（从
`permanovaFL` 函数体里提取验证过），置换次数必须是它的整数倍；`r-scripts/permanova_med.R`
会自动把请求值向上调到 100 的倍数并在结果里报告实际用量，前端输入框也已改成
`min=100 step=100 step-strictly`。

版本 A/B 实测（`node r-scripts/tools/ab_r_version.mjs`，两个二进制跑同一份输入）：

| 对照项 | 4.3.3 vs 4.6.1 结果 |
|---|---|
| 25 个中介模板统计量 | 逐条完全一致（25/25） |
| 图表数据断言 | 77/77 通过 |
| 输入格式一致性 | 4/4 一致 |
| PERMANOVA 的 Df/SumOfSqs/F/R² | 1e-6 内一致，p 一致 |
| LDM 包版本 | 6.0.1（同一个包，语义不变） |

**当前状态**：项目内 `r-portable/` = **R 4.6.1**（177 包，含 LDM 6.0.1 / glmnet 5.1 / vegan 2.7.6）。
旧的 4.3.3 保留在项目外 `../r-portable-4.3.3-backup/` 作保险，不参与打包。

## 2. 运行时的分发方式：装进 git 是错的

R 运行时是**构建产物**，不是源码。之前把它塞进仓库（`.gitattributes` 走 LFS，历史里已有
309MB LFS 对象，最后三个提交就叫 "add r-portable library (part 2/3/4)"），代价已经付了，
但它没能实现它唯一的目的：

```
git ls-files r-portable/library/LDM   ->  0 个文件
```

也就是说 **LDM 从来没被提交成功**。今天任何人 fresh clone、把 309MB LFS 全拉下来，
**照样跑不了 PERMANOVA-med**。继续提交只会变成 "part 5/6/7…" 的无尽追赶
（本次未跟踪的运行时文件是 19,692 个 / 374.2 MB），而且 GitHub 免费额度是
1GB LFS 存储 + 1GB/月流量，一次全新 clone 就吃掉当月大半。

现在的做法：**用 lockfile 精确声明 + 一条命令装配**，整包走 Release 附件（不占 LFS 流量）。

```
r-runtime.lock.json                 # 177 个包的精确版本 + 每个功能模块需要哪些包
scripts/setup-r-runtime.ps1         # 唯一装配入口（4 种来源 + 自动校验）
r-scripts/tools/export_r_lockfile.R # 从「跑通过的这台机器」重新导出 lockfile
r-scripts/tools/verify_r_runtime.R  # 校验运行时是否满足 lockfile（含两个真实冒烟分析）
```

## 3. 装配：四种来源

```powershell
# 只检查现有运行时是否可用（默认，几秒钟）
powershell -ExecutionPolicy Bypass -File scripts/setup-r-runtime.ps1 -Mode verify

# 离线首选：从本机另一份完整运行时（目录或 zip）复制
powershell -ExecutionPolicy Bypass -File scripts/setup-r-runtime.ps1 -Mode fromLocal `
  -From "C:\Custom\CodeRepository\Demo\r-portable-4.3.3-backup"

# 从 GitHub Release 附件下整包（603MB，支持断点续传；不占 LFS 流量）
#   先把地址填进 r-runtime.lock.json 的 release.url / release.sha256，或直接给 -Url
powershell -ExecutionPolicy Bypass -File scripts/setup-r-runtime.ps1 -Mode fromRelease

# 兜底：下 R 安装器静默装到 r-portable，再按 lockfile 从 CRAN/Bioconductor 装包
powershell -ExecutionPolicy Bypass -File scripts/setup-r-runtime.ps1 -Mode fromRepos -RVersion 4.6.1

# 什么都不指定：verify -> fromRelease -> fromRepos 依次尝试，并把下一步该做什么说清楚
powershell -ExecutionPolicy Bypass -File scripts/setup-r-runtime.ps1
```

不需要管理员权限：目标目录在项目内，安装器用 `/SILENT /SUPPRESSMSGBOXES /NORESTART /DIR=<项目根> /CURRENTUSER`。
下载走 `options(download.file.method='wininet')`，热点/代理下比 libcurl 稳（这是当年一堆
`install-skip-ssl.bat` / `install-with-hotspot.bat` 想解决的问题，现在收在一个脚本里）。

镜像优先级（写死在脚本顶部 `$CRAN_MIRRORS`，可改）：清华 → cloud.r-project.org → cran.r-project.org → cran.us。
Bioconductor 依赖（`BiocParallel` / `GUniFrac` / `generics`）通过 `BiocManager` 装，**不硬编码 bioc 版本**，
装完由校验器与 lockfile 比对；`LDM` 若 CRAN 滞后则用 `remotes::install_github("yijuanhu/LDM")` 兜底。

## 4. 校验：不要等用户点「运行分析」才发现缺包

```powershell
# 结构 + 版本 + API 形状 + 两个真实冒烟（PERMANOVA-med、Non-random PERMANOVA）
r-portable\bin\Rscript.exe r-scripts\tools\verify_r_runtime.R
```

退出码：`0` 通过；`1` 缺包/版本或 API 不符；`2` 包装上了但分析跑不通。
它会直接点名缺哪个包、`permanovaFL` 的形参列表、`n.perm.block` 的实际值。

完整回归（需要 node）：

```bash
node r-scripts/tools/verify_med_templates.mjs   # 25 个中介模板逐个真跑
node r-scripts/tools/test_med_charts.mjs        # 图表数据 77 条断言
node r-scripts/tools/test_matrix_input.mjs      # 矩阵输入解析 17 条
node r-scripts/tools/test_input_formats.mjs     # 4 种历史输入格式结果一致
node r-scripts/tools/ab_r_version.mjs           # 两个 R 版本数值对照
```
以上脚本都支持 `RSCRIPT=<路径> node ...` 切换 R 二进制，用于版本 A/B。

## 5. 写 R 脚本时必须守的几条

1. **自带 `%||%`**。R 4.4 才有 base 版本；脚本要能在 4.3.x 上跑，就别依赖它。
   （`nonrandom_permanova.R` 里就是这么做的。）
2. **置换次数必须是 100 的整数倍**（LDM 约束），脚本内自动向上调整并在输出里报告实际值。
3. **固定随机种子**（默认 12345，可用 `params.seed` 覆盖），否则同一份数据两次结果不同，
   回归比对没有意义——这条是在 `permanova.R` 上踩过才知道的。
4. **输出 JSON 用 `digits = 10`、`na = "null"`**。jsonlite 默认 4 位有效数字会让
   `c' + a*b` 与 `total` 差出 1e-4；`NA` 会被写成字符串 `"NA"`，前端拿它做数值比较会静默出错。
5. 需要被单测 `source()` 的脚本，加一个「只加载不执行」开关（见 `nonrandom_permanova.R`
   里的 `AS_SOURCE_ONLY` / `NR_PERMANOVA_SOURCE`）。
6. 距离对象取样本数用 `attr(dmat, "Size")`，`stats::nobs()` 对 `dist` 没有方法。
7. `sampleData` 要兼容三种写法：行对象数组（jsonlite 存 data.frame 的默认形式）、
   列字典、data.frame。连续协变量不能被误当因子展开。

## 6. PowerShell 脚本的一个坑

含中文的 `.ps1` **必须带 UTF-8 BOM**。PowerShell 5.1 对无 BOM 的 UTF-8 按 GBK 解码，
中文字节会吞掉引号，报出完全看不出问题的 `The '<' operator is reserved for future use`
之类的语法错误。另外 PS 5.1 下 `$ErrorActionPreference='Stop'` 会把原生命令写到 stderr 的内容
当异常抛出（`Rscript --version` 明明成功却被判「不可用」就是这么来的），外部命令统一走
`Run-Native` 这个口子。

## 7. `r-scripts/` 现在只有这些

```
permanova.R  permanova_med.R  nonrandom_permanova.R  gmr4.R  bayesian_era_mediation.R
reference/    permanovaFL_help.txt / permanovaFL_full.txt / LDM_datasets.txt（LDM API 抓档，文档很差，留着有用）
tools/        export_r_lockfile.R  verify_r_runtime.R  ab_r_version.mjs
              verify_med_templates.mjs  test_med_charts.mjs  test_matrix_input.mjs  test_input_formats.mjs
```
`gmr4.R` / `bayesian_era_mediation.R` 目前仍是不能跑的草稿（前者要求 glmnet——现在装了；
后者要求 rstan——装不了也不需要），会按顺序重写。
