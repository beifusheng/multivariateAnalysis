# Electron + R 统计分析框架

## 📁 项目结构

```
electron-egg/
├── electron/
│   ├── controller/
│   │   ├── example.ts
│   │   └── rController.ts          # R 控制器（新增）
│   ├── service/
│   │   ├── example.ts
│   │   └── rService.ts             # R 服务（新增）
│   ├── preload/
│   │   ├── bridge.ts
│   │   ├── index.ts
│   │   └── lifecycle.ts
│   └── main.ts
├── frontend/
│   └── src/
│       ├── api/
│       │   ├── index.js
│       │   └── r.js                # R API 调用（新增）
│       └── views/
│           ├── example/
│           └── RAnalysis.vue       # R 分析界面（新增）
├── r-scripts/                      # R 脚本目录（新增）
│   ├── permanova.R
│   ├── permanova_med.R
│   ├── gmr4.R
│   ├── bayesian_era_mediation.R
│   ├── nonrandom_permanova.R
│   └── README_R_SETUP.md
└── package.json
```

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    前端 (Vue 3 + Vite)                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │  RAnalysis.vue                                    │  │
│  │  - 方法选择                                        │  │
│  │  - 参数配置                                        │  │
│  │  - 结果展示 (ECharts)                              │  │
│  └───────────────────────────────────────────────────┘  │
│                          │ IPC                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │  api/r.js                                         │  │
│  │  - checkR()                                       │  │
│  │  - runPERMANOVA()                                 │  │
│  │  - runGMR4()                                      │  │
│  │  - ...                                            │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │ IPC Invoke
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Electron 主进程 (TypeScript)                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │  rController.ts                                   │  │
│  │  - checkR()                                       │  │
│  │  - runPERMANOVA(params)                           │  │
│  │  - runPERMANOVA_Med(params)                       │  │
│  │  - runGMR4(params)                                │  │
│  │  - runBayesianERA_Mediation(params)               │  │
│  │  - runNonRandomPERMANOVA(params)                  │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  rService.ts                                      │  │
│  │  - spawn Rscript 进程                              │  │
│  │  - 进程管理 (超时、错误处理)                        │  │
│  │  - 临时文件管理                                    │  │
│  │  - tree-kill 优雅终止                             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │ 子进程
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    R 脚本 (Rscript)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  r-scripts/*.R                                    │  │
│  │  - 读取 JSON 输入参数                               │  │
│  │  - 执行统计分析                                    │  │
│  │  - 输出 JSON 结果                                   │  │
│  │  - 错误写入错误文件                                │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │  R 包                                             │  │
│  │  - vegan (PERMANOVA)                              │  │
│  │  - LDM (PERMANOVA-med)                            │  │
│  │  - glmnet (GMR⁴)                                  │  │
│  │  - rstan (Bayesian ERA)                           │  │
│  │  - jsonlite (JSON 处理)                            │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 数据流

1. **前端发起请求**
   ```javascript
   const result = await runPERMANOVA({
     distanceMatrix: [[0, 0.5], [0.5, 0]],
     formula: 'y ~ x1 + x2',
     permutations: 999
   });
   ```

2. **Electron 主进程处理**
   - `rController.runPERMANOVA()` 接收参数
   - 调用 `rService.runScript()`
   - 生成唯一 Job ID
   - 写入输入参数到临时 JSON 文件

3. **R 进程执行**
   ```bash
   Rscript r-scripts/permanova.R \
     input.json output.json error.txt
   ```

4. **R 脚本处理**
   - 读取 `input.json` 参数
   - 执行 PERMANOVA 分析
   - 写入结果到 `output.json`
   - 如有错误写入 `error.txt`

5. **返回结果**
   - Electron 读取 `output.json`
   - 解析为 JavaScript 对象
   - 通过 IPC 返回给前端
   - 清理临时文件

---

## 🚀 快速开始

### 1. 安装 R

```bash
# Windows
# 下载：https://cran.r-project.org/bin/windows/base/
# 安装后验证
Rscript --version
```

### 2. 安装 R 包

```r
install.packages(c("jsonlite", "vegan", "glmnet", "Matrix"))

# PERMANOVA-med
install.packages("devtools")
devtools::install_github("yijuanhu/LDM")

# Bayesian ERA (可选，安装复杂)
install.packages("rstan")
```

### 3. 启动应用

```bash
# 开发模式
npm run dev

# 或分别启动
npm run dev-frontend
npm run dev-electron
```

### 4. 测试 R 连接

在应用界面点击"重新检测"按钮，应显示"✅ R 环境就绪"

---

## 📊 支持的分析方法

| 方法 | 描述 | R 脚本 | 状态 |
|------|------|--------|------|
| **PERMANOVA** | 置换多元方差分析 | `permanova.R` | ✅ 基础版 |
| **PERMANOVA-med** | PERMANOVA 中介分析 | `permanova_med.R` | ⚠️ 需 LDM 包 |
| **GMR⁴** | 广义混合正则化降秩回归 | `gmr4.R` | ⚠️ 简化版 |
| **Bayesian ERA** | 贝叶斯扩展冗余分析 | `bayesian_era_mediation.R` | ⚠️ 需 rstan |
| **Non-random PERMANOVA** | 非随机 PERMANOVA 扩展 | `nonrandom_permanova.R` | ✅ 基础版 |

---

## 🔧 开发注意事项

### R 脚本开发规范

1. **输入输出格式**
   ```r
   args <- commandArgs(trailingOnly = TRUE)
   input_file <- args[1]   # 输入 JSON
   output_file <- args[2]  # 输出 JSON
   error_file <- args[3]   # 错误文件
   ```

2. **错误处理**
   ```r
   tryCatch({
     # 主要逻辑
   }, error = function(e) {
     writeLines(as.character(e), error_file)
     quit(status = 1)
   })
   ```

3. **JSON 处理**
   ```r
   params <- jsonlite::fromJSON(input_file)
   jsonlite::toJSON(output, auto_unbox = TRUE, pretty = TRUE) %>%
     writeLines(output_file)
   ```

### Electron 端开发

1. **添加新方法**
   - 在 `rController.ts` 添加方法
   - 在 `r-scripts/` 创建对应 R 脚本
   - 在 `frontend/src/api/r.js` 添加 API
   - 在 `RAnalysis.vue` 添加 UI

2. **超时设置**
   ```typescript
   await rService.runScript({
     scriptName: 'bayesian_era_mediation.R',
     params,
     timeout: 1800000  // 30 分钟
   });
   ```

3. **进程管理**
   - 使用 `tree-kill` 优雅终止 R 进程
   - R 可能产生子进程，需要整体清理

---

## 📦 打包发布

### electron-builder 配置

在 `package.json` 或 `electron-builder.yml` 中添加：

```yaml
extraResources:
  - from: r-scripts/
    to: r-scripts/
```

### 便携版 R（可选）

```yaml
extraResources:
  - from: r-portable/
    to: r-portable/
```

在应用启动时配置：
```typescript
const rPath = path.join(app.getAppPath(), 'r-portable', 'bin', 'Rscript.exe');
rService.setRPath(rPath);
```

---

## 🐛 调试技巧

### 查看 R 进程日志

```typescript
// 在 rService.ts 中
rProcess.stdout?.on('data', (data) => {
  logger.debug('[RService] R stdout:', data.toString());
});

rProcess.stderr?.on('data', (data) => {
  logger.error('[RService] R stderr:', data.toString());
});
```

### 临时文件调试

```typescript
// 在 _cleanupTempFiles 中注释掉清理
// 可以检查生成的输入输出文件
```

### R 脚本独立测试

```bash
# 创建测试输入
echo '{"distanceMatrix": [[0, 0.5], [0.5, 0]], "formula": "y ~ x", "permutations": 99}' > test_input.json

# 运行脚本
Rscript r-scripts/permanova.R test_input.json test_output.json test_error.txt

# 查看结果
cat test_output.json
```

---

## 📚 下一步

- [ ] 完善 GMR⁴ 算法（根据 2025 年论文）
- [ ] 完善 Bayesian ERA 的 Stan 模型
- [ ] 添加数据导入功能（CSV、Excel）
- [ ] 添加结果可视化（PCoA 图、热图、森林图）
- [ ] 添加批量分析功能
- [ ] 添加分析报告导出（PDF、Word）
- [ ] 添加样本量计算功能
- [ ] 添加多重检验校正

---

## 🆘 获取帮助

- R 安装问题：查看 `r-scripts/README_R_SETUP.md`
- 统计方法问题：参考相关论文和 R 包文档
- Electron 问题：https://www.electronjs.org/docs
