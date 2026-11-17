# R 分析界面共享层

新增一个分析功能（还剩 GMR⁴、Bayesian ERA）时按这里的方式接，不要复制粘贴视图代码。

## 文件职责

| 文件 | 作用 |
| --- | --- |
| `r-analysis.css` | **自动生成，不要手改**。由 `r-scripts/tools/extract_ra_styles.mjs` 从 `views/r-analysis/PERMANOVA_Med.vue` 的 `<style scoped>` 抽取，选择器统一限定在 `.ra-shell` 内 |
| `AnalysisHeader.vue` | 页头（标题 / 副标题 / 返回首页） |
| `AnalysisToolbar.vue` | 侧边工具栏容器；按钮由父视图通过默认插槽给（三个分析的按钮语义不同，组件里不塞业务） |
| `DataTemplateSelector.vue` | 「设计模板」区：分组 + 折叠 + 当前选中摘要 + 清除 |
| `ChartPanel.vue` | 图表区外壳：tab + 容器 ref + 空态；ECharts 实例由视图创建（`getHost()` 拿 DOM） |
| `ResultCard.vue` / `StatGrid.vue` / `InfoGrid.vue` | 结果区卡片 / 关键统计量网格 / 信息网格 |
| `TemplateButton.vue` / `TemplateCategory.vue` | 旧的**公式**模板按钮（`PERMANOVA.vue`、`PERMANOVA_Med.vue` 在用） |

组件一律不写 `<style>`：样式只有 `r-analysis.css` 一个来源，否则会出现「同一个按钮三处不同圆角」。

## 已知的历史不一致（改动前先读）

- `TemplateButton` 取 `template.name` / `template.tooltip`；`DataTemplateSelector` 取
  `item.label` / `item.tip`（与 `medTemplates.js` / `nonrandomTemplates.js` 的规格一致）。
  统一字段要改两个既有视图，属于独立一次变更，别顺手混进功能提交里。
- 视图必须**自己注册用到的 Element Plus 图标**（`main.js` 只全局注册 `components/global/*.vue`）。
  漏注册不会报错，只会「按钮在、图标空白」——`test_nr_render.mjs` 会把这类 Vue 运行告警当失败。
- 校验状态不要同时存在「data 里的影子状态」和「computed」。Non-random 视图早期两处并存，
  程序填表时输入卡的标签还停在「等待输入」，而「运行分析」按钮已经亮了。现在统一成一个
  纯函数 `checkAll()` + 计算属性 `checks`。

## 新增一个分析界面的清单

1. `r-scripts/<name>.R`：输入 JSON → 输出 JSON；**不支持的能力要明确报错**，不要返回能跑但不能看的数。
2. `frontend/src/utils/<name>Templates.js`：只存设计规格，数据由 `rng.js` 的确定性生成器合成；
   每个模板带 `expect`（预期结论），供 harness 断言。
3. `frontend/src/utils/<name>Charts.js`：纯函数 `chart_data -> ECharts option`，NaN 一律转 null。
4. 视图放 `views/r-analysis/`，用本目录的组件 + `r-analysis.css`，`result-section` 放在
   `config-section` 内部（与 `PERMANOVA.vue`/`PERMANOVA_Med.vue` 版式一致）。
5. 校验脚本（都在 `r-scripts/tools/`）：
   - `verify_<name>_engine.R`：与成熟实现（如 vegan）对齐 + 边界条件必须报错
   - `verify_<name>_templates.mjs`：逐个模板真跑 R，断言 p 值方向与 `expect` 一致
   - `test_<name>_charts.mjs`：用真 R 输出驱动图表断言
   - `test_<name>_view.mjs` / `test_<name>_render.mjs`：视图逻辑 + SSR 渲染冒烟（告警算失败）

## Non-random PERMANOVA 当前覆盖

```
node r-scripts/tools/test_nr_options.mjs      # 界面选项 ↔ R 白名单 ↔ 模板 一致（75 项）
node r-scripts/tools/verify_nonrandom_templates.mjs   # 26 模板真跑 R，p 方向逐条断言
Rscript r-scripts/tools/verify_nonrandom_engine.R     # F/R² 对齐 adonis2；连续变量必须报错
node r-scripts/tools/test_nr_charts.mjs       # 4 张图 × 4 个设计（127 项）
node r-scripts/tools/test_nr_view.mjs         # canRun / buildPayload / 结果映射（43 项）
node r-scripts/tools/test_nr_render.mjs       # SSR 渲染 + Vue 告警必须为 0（28 项）
```
另：`node r-scripts/tools/test_home_status.mjs`（28 项）断言首页卡片写的状态与
真实代码一致——标「可用」必须已有路由 + 视图文件，引擎源码里还写「简化版」的不许标可用。

## 接下来两个：已确定的输入约定

这些约定原来只写在已删除的旧原型 `views/RAnalysis.vue`（`git show HEAD:frontend/src/views/RAnalysis.vue`
在删改前的那个提交可查），现在以 `electron/controller/rController.ts` 的签名为准：

- **GMR⁴**（`gmr4.R`）：`X: number[][]` 预测变量、`Y: number[][]` 响应变量、`Z?: number[][]` 协变量，
  `rank?` / `lambda?`；超时 15min。脚本当前是自述“简化版，需根据论文完善”的占位实现。
- **Bayesian ERA**（`bayesian_era_mediation.R`）：`X` / `Y` / `M`（中介）、`chains?` / `iterations?`；
  超时 30min。同样占位。
- `frontend/src/api/r.js` 里的 `runGMR4` / `runBayesianERA_Mediation` 封装已存在但**无调用方**，
  视图上线才接。
- `rService.runScript` 是把 `params` 整包 `JSON.stringify` 写入 input.json，**不做字段筛选**；
  所以改入参形状要同时改三处：rController 类型、视图 `buildPayload()`、R 脚本解析。

