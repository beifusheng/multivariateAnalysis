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

工具栏（`AnalysisToolbar` 里摆的按钮）四个动作固定同一语义、同一颜色，新模块不要自创：

| 按钮 | type | 行为 |
| --- | --- | --- |
| 下载模板 | success | `utils/sheetIo.js` 的 `buildTemplateSheets()` 写出 xlsx（物种矩阵 / 样本信息 / 坐标 / 填写说明） |
| 导入数据 | primary | `readWorkbook` + `findSheet` + `parse*` + `alignBySampleId` → **先出预览再点「填入表单」** |
| 导出结果 | warning | 弹选项：Excel / PCoA 坐标 / 零分布 / JSON / 输入 JSON / 当前图表 PNG |
| 下载输入 | info | 把当前表单拼成的 payload 存成 JSON（可直接回灌） |

导入的铁律：**按样本 ID 对齐，绝不按行号**（Excel 里排个序就把分组整体错位，结果看着完全正常但毫无意义）；
解析失败或表缺失要指名缺什么；能解析但形状可疑（全 0 样本、分组列全数值）要在预览里提醒。

组件一律不写 `<style>`：样式只有 `r-analysis.css` 一个来源，否则会出现「同一个按钮三处不同圆角」。

## 已知的历史不一致（改动前先读）

- `TemplateButton` 取 `template.name` / `template.tooltip`；`DataTemplateSelector` 取
  `item.label` / `item.tip`（与 `medTemplates.js` / `nonrandomTemplates.js` 的规格一致）。
  统一字段要改两个既有视图，属于独立一次变更，别顺手混进功能提交里。
- 视图必须**自己注册用到的 Element Plus 图标**（`main.js` 只全局注册 `components/global/*.vue`）。
  漏注册不会报错，只会「按钮在、图标空白」——`test_nr_render.mjs` 会把这类 Vue 运行告警当失败。
- **`el-dialog` 的内容在 SSR 下渲染不到**（走 `<teleport to="body">`），`renderToString` 只留一个
  `<!---->`。要看对话框内部的标记，得像 `test_nr_render.mjs` 那样用立即渲染的替身接管 `ElDialog`
  （替身必须尊重 `modelValue`，否则没打开的弹窗会污染空态断言）。
- **Vue 的 SSR 会吞掉渲染错误**：组件 render 抛 TypeError 时 `renderToString` 照样 resolve，
  只留 `<!---->` 占位。所以冒烟测试必须把 `errorHandler` / `console.error` 捕获到的东西也算失败，
  光断言「没抛异常」是假的绿。
- 弹提示走视图自己的 `notify(type, msg)` 一个口子，别直接调 `ElMessage`：测试里没有 `document`，
  直接调会在 Node 里炸；换成 `notify` 后测试可以把 `vm.notify` 换成收集函数，
  还能断言“用户到底看到了什么”。
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
node r-scripts/tools/test_sheet_io.mjs        # 模板写出→读回整链 + 脏表拒绝（52 项）
node r-scripts/tools/verify_nonrandom_templates.mjs   # 26 模板真跑 R，p 方向逐条断言
Rscript r-scripts/tools/verify_nonrandom_engine.R     # F/R² 对齐 adonis2；连续变量必须报错
node r-scripts/tools/test_nr_charts.mjs       # 4 张图 × 5 个设计（162 项，含 formatter 真调用）
node r-scripts/tools/test_nr_view.mjs         # canRun / payload / 导入导出（67 项）
node r-scripts/tools/test_nr_render.mjs       # SSR 渲染 5 种状态 + 告警与吞错必须为 0（41 项）
node r-scripts/tools/test_home_status.mjs    # 首页卡片状态 ↔ 真实代码（28 项）
```

图表的 formatter **必须被真调一次**：`series.data` 写成对象项（`{ value, itemStyle }`）时
`params.data` 是整个对象、`params.value` 才是数值。结论对比图用了 `params.data`，柱顶和
tooltip 全渲染成 N/A，而且 `p.data < 0.05` 恒为 false——把 p=0.001 的显著结果写成了「不显著」。
结构断言（几个柱子、什么颜色）永远查不出这种问题。
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

