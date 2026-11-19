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
| `ToolbarActions.vue` | 侧边栏四个动作（下载模板/导入数据/导出结果/下载输入）：图标、配色、禁用条件 | 只 emit，不含业务；**按钮样式自带在本组件**（见下文「视图的 scoped 选不到子组件」） |
| `ImportDialog.vue` | 导入外壳：说明 → 选文件 → 错误/警告 → 预览 tabs → 用户点「填入表单」 | 只认 `sheets` / `tabs` |
| `ExportDialog.vue` | 导出勾选外壳 | 只认 `options` / `selected` |

## 三层切法（导入导出别再往视图里堆）

三个模块的导入导出看起来“其实不一样”，但不一样的是**声明**，不是流程：

| 层 | 内容 | 位置 |
| --- | --- | --- |
| L1 原语 | 读写工作簿、表名别名、`mapWorkbook`（按主表 ID 对齐 + 缺表拒绝 + 形状警告）、`previewFromFields`、`writeWorkbook` | `utils/sheetIo.js` |
| L2 外壳 | 工具栏四个按钮、导入对话框、导出对话框 | `components/r-analysis/*.vue`（本目录） |
| L3 声明 | 要哪几张表、导出项清单与 `build()/data()`、`planExport`、`toFormPatch` | `utils/<name>SheetSpec.js` |

**硬规定**：L3 必须是纯数据 + 纯函数，不碰 DOM、不 import file-saver。视图只负责把 L3 算出来的
任务表执行掉。为什么：以前 `build()` 写在视图 methods 里，“导出内容对不对”只能人肉开 Excel 数格子；
抽成 `planExport(keys, ctx, stamp)` 后，[test_nr_spec.mjs](../../../r-scripts/tools/test_nr_spec.mjs)
能直接断言“结论对比里 p 是真数”“没有一行第二列是空的”“PCoA 行数 = 样本数”。

**不要把三个模块合成一个带 `if (module === 'med')` 的大对话框**：分支会越长越肥，
任何模块的新需求都要动共用组件，等于把三个模块焊在同一文件里。

迁移进度：**S1 Non-random 已上**（dogfood：3 张表 + 6 个导出项）；**S2 PERMANOVA.vue 已上**（距离矩阵/样本数据/模型公式 + 5 个导出项，-439 行）；
**S3 PERMANOVA_Med.vue 已上**（Y/M/X/Z 四张表 + 5 个导出项，视图净减 299 行（+207 / −506）；按「结局 Y」的样本 ID 对齐，
表名走中英文别名，缺表/缺样本指名拒绝——以前表名写错时报的是一句跟表名无关的错）。
三个模块现在共用同一套 L1/L2，业务差异全部留在各自的 `utils/<name>SheetSpec.js`。

S2 选了“严格语义”（行为会变，已得到同意）：表名走别名而不是位置、缺必需表指名拒绝、
样本一律按**距离矩阵的样本 ID** 重排。理由不是洁癖：旧版把样本数据表按行号对齐，
在 Excel 里排一下序就会让 Group/Age 跟错样本，而图上一点异常都看不出来
（test_pm_view 里这条用例在改动前确实是红的：产出 `S4,S2,S1,S3` 配 `27,28,25,30`）。
顺带发现并清理：`validateDistanceMatrix` / `validateSampleData` 在同一个 `methods` 里
**各有两份定义**（对象字面量后者覆盖前者，前面那 100 行从来没被执行过）。

工具栏（`AnalysisToolbar` 里摆的按钮）四个动作固定同一语义、同一颜色，新模块不要自创：

| 按钮 | type | 行为 |
| --- | --- | --- |
| 下载模板 | success | 各自的 L3 声明示例数据（`nrTemplateSheets` / `pmTemplateSheets` / `medTemplateSheets`），`sheetIo.writeWorkbook` 写出；文件名统一 `templateFilename(<slug>, fileStamp())` |
| 导入数据 | primary | `readWorkbook` + `findSheet` + `parse*` + `alignBySampleId` → **先出预览再点「填入表单」** |
| 导出结果 | warning | 弹选项：Excel / PCoA 坐标 / 零分布 / JSON / 输入 JSON / 当前图表 PNG |
| 下载输入 | info | 把当前表单拼成的 payload 存成 JSON（可直接回灌） |

导入的铁律：**按样本 ID 对齐，绝不按行号**（Excel 里排个序就把分组整体错位，结果看着完全正常但毫无意义）；
解析失败或表缺失要指名缺什么；能解析但形状可疑（全 0 样本、分组列全数值）要在预览里提醒。

外壳组件（`ToolbarActions` / `ImportDialog` / `ExportDialog`）**自己带 `<style scoped>`**。
这不是随手破坏“样式只有一个来源”：视图的 scoped 样式编译成 `.toolbar-btn[data-v-父]`，
而按钮已经是子组件内部的元素，拿不到父组件的作用域属性（SSR 渲出来的 `<button>` 上确实没有 `data-v-`）。
样式留在视图里只会变成“看起来能改、改了没反应”的死 CSS，而且三个模块会同时失去对齐与尺寸。
顺带：旧 CSS 里 `.toolbar-btn[type="success"]` 一类选择器从来没生效过——`el-button` 把 `type`
当 prop 吃掉了，渲染出来只有 `type="button"`，颜色走的是 Element Plus 自己的 `el-button--success`。
（`r-analysis.css` 仍然由 `extract_ra_styles.mjs` 生成，重跑它不会弄坏外壳自己那份）

## 已知的历史不一致（改动前先读）

- **L1 函数不能只认一种数据形状**。`writeWorkbook(XLSX, sheets, …)` 以前只会 `for (const [name, aoa] of sheets)`，
  而 L3 的导出项返回的是 `[{name, aoa}]`（对象）——视图把 spec 的任务表直接传进来就炸成
  `.for is not iterable`，报的那句话跟“哪张表”毫无关系。PERMANOVA 与 Non-random 的 **Excel 导出**
  曾经全走这条死路（PNG/JSON 不受影响，所以没人发现）。现在 `asSheet()` 两种写法都收，
  `test_sheet_io.mjs` 断言两种形状产出同一个工作簿。
- **`el-table` 在 SSR 里不渲染单元格**（表头 `<tr>` 是空的）。所以“`:data` 绑了一个不存在的字段”
  这种错用真组件永远测不到。`test_med_render.mjs` 用 `ElTable`/`ElTableColumn` 替身把行内容
  与列头写进 HTML，才能断言“预览里真带着 S1|1.2|3.4”（注入 `:data="t.row"` 验证过这条确实会红）。
- 视图的侧边栏要把外壳包在 `<div class="toolbar-content">` 里，并且**同时传 `:can-run` 与
  `:has-result`**。`side-toolbar` 收起时是 `width:0 + overflow:visible`，靠 `.toolbar-content` 的
  opacity/visibility 才藏得住；少一个 `:can-run` 不会报错，只会让「下载输入」永远灰着。
  （S2/S3 都踩过，现在 `test_pm_view` / `test_med_view` 各钉了一条）
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
- 弹提示不要直接调 `ElMessage`：测试里没有 `document`，直接调会在 Node 里炸。现在有两个口子：
  Non-random 走自己的 `notify(type, msg)`，PERMANOVA / -Med 走 `this.$message`（全局注册的 Element Plus）。
  两者都能被替身接管（harness 把 `vm.$message` / `vm.notify` 换成收集函数，还能断言“用户到底看到了什么”）；
  新模块二选一即可，**别再开第三个口子**。
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

## 三条新踩出来的硬规定

1. **下载模板不只是格式说明，它是一份会被真点「运行」的数据。**
   Med 的模板以前只有 2 个样本，导入后一定撞「样本数过少」——用户接触这个功能的
   第一次尝试就是死路。现在 `test_med_view.mjs` 第 4 段把整链跑到底：
   `medTemplateSheets()` → 写 xlsx → `mapWorkbook` → `medToFormPatch` → `buildRunParams()`
   → **真跑 R**，断言 success 且中介 p<0.05、协变量真的进了模型。
   新模块的模板同理：样本数要过引擎下限、连续协变量要带小数（整数逐行会被当成多水平因子）。
2. **空输入≠格式错**。`inspectMatrix('')` / `inspectSampleTable('')` 返回
   `{ ok:false, empty:true, error:'等待输入' }`。不拦的话刚进页面就一片
   「JSON 格式错误：Unexpected end of JSON input」，用户以为自己的数据坏了；
   卡片已经写了「等待输入」的，`checkAll()` 不要再把解析器术语挂到 `error-text` 里
   （`test_nr_render` 两头都钉了：空态不许有 JSON 术语、真填坏格式必须要有）。
3. **导入的「填入表单」必须关对话框 + 没解析时给错。** 只写 `if (!imported) return;`
   又不关窗，用户看到的就是“点了没反应”（Non-random 实机报的就是这条）。
4. **`el-upload` 配 `:limit="1"` + `:auto-upload="false"` 时，第二次选文件根本不会触发 `on-change`。**
   Element Plus 的 `uploadFiles` 是这么写的：
   `if (limit && fileList.length + files.length > limit) { onExceed(files, fileList); return; }`。
   而 `show-file-list="false"` 又让人看不见那个残留文件，`onExceed` 默认是空函数 ⇒ 彻底静默。
   这就是“上传完模板后点填入表单没反应”的真因（三个模块共用外壳，所以三个一起中招）。
   `ImportDialog` 现在同时做了两件事：`on-exceed` 里 `clearFiles()` 后把新文件照原路 emit（后选覆盖先选），
   以及 `watch modelValue` 在**打开时**清队列。`test_import_shell.mjs` 直接跑组件的 methods/watch，
   不需要浏览器；把 `:on-exceed` 摘掉它就是红的。
5. **示例数据有统计下限，不是“有几行算几行”**（都是实测，不是猜）：

   | 模块 | 示例设计 | 实测结果 |
   | --- | --- | --- |
   | PERMANOVA | 8 样本（4 Control + 4 Treatment），组内 0.05~0.10、组间 0.32~0.48 | `p=0.014`、`F=40.4`（旧 5 样本：`p=0.53`） |
   | Non-random | 12 样本 = **3 批次 × 每批 2 Case + 2 Control** | `p_free=0.0071`、`p_constrained=0.0103`、`feasible_blocks=3` |
   | PERMANOVA-med | 20 样本，Y3/M4/X1/Z2（协变量带小数） | `success`、中介 `p=0.0198`、协变量真的进模型 |

   Non-random 旧模板是 6 样本、每批 **1 Case + 1 Control**：把所有批次标签同时翻转得到的置换
   与观测设计完全同构 ⇒ 零分布退化、**p 下界约 0.25，效应再强也不会显著**（实测 `p_free=1`、`p_constrained=1`）。
   每批 2:2 才有 `C(4,2)^3 = 216` 个置换（约 108 个等价类，p 下界 ≈ 0.009）。
   这三个“模板→导入→真跑 R”现在都是固定断言（`test_pm_view` 5b / `test_nr_view` 9 / `test_med_view` 4）。
6. **示例数据属于各自的 L3，不属于 L1。** `sheetIo.buildTemplateSheets()` 已删，
   Non-random 的示例回到 `nrTemplateSheets()`。L1 只留下两个命名原语：
   `fileStamp()`（`2026-11-18-03-25-18`，不带冒号也不带 `T`）与
   `templateFilename(slug, stamp)` → `<slug> 数据模板_<stamp>.xlsx`。
   以前三个模块三种写法（无时间戳会互相覆盖、`_数据模板` 与下划线混用、两种时间戳格式）。

7. **「初次分析图表不画、切 tab 才画」是时序 bug，不是 ECharts 的问题。**
   结果区是 `v-if="analysisResult"` 刚出现的，同一帧里去找它的 DOM 有概率拿不到；
   旧代码三份 `renderChart` 各写过 `if (!el) return;`——静默放弃，之后再没人叫它画。
   现在统一走 `utils/chartHost.js`，两层都堵：
   - `hostWhenReady`：有界等几帧；**容器存在但 `clientWidth/Height` 为 0 也算没就绪**
     （ECharts 在 0 尺寸容器上 `init` 不报错，只画一个看不见的空图 —— 这就是"切 tab 才出现"的另一半原因）
   - `drawWhenReady`：返回 `{ ok, reason: 'no-host' | 'zero-size' | 'no-option', waited, width, empty }`，
     `setOption` 后下一帧再 `resize()` 一次，并自己量 `getWidth()`；量到 0 就返回 `empty:true`
   - 三个视图都改成**数据驱动重画**（`watch: chartData / analysisResult`），不再只赌 `runXxx` 里那一次
     `$nextTick`：首次分析时 `activeChart` 常常压根没变，watcher 不触发，旧代码就只剩那一帧的运气
   拿不到 / 量不到 / 画成 0 宽，三种情况现在都会给用户一句话，不再出现"空白但无提示"。
   `test_chart_host.mjs`（42 项）用注入的假 echarts 测时序，不需要浏览器；另有静态断言盯着
   「不许再写 `if (!el) return`」和「必须有数据驱动的 watch」。
8. **检验本身不可能显著时，引擎必须开口（`diagnostics`）。** Non-random 每层只有一例待比较
   水平（1 Case + 1 Control）时，大量置换与观测设计算出**同一个 F**，p 被并列频率钉死（实测下界 0.27），
   屏幕上却与「没效应」长得一模一样。现在 `nonrandom_permanova.R` 输出 `diagnostics: [ … ]`，
   视图渲染成红框、Excel 的「结论对比」各占一行、旧脚本缺字段时按空处理。
   第一版这里踩过坑：拿 `mean(f_null >= f_obs)` 当"下界"，把 9/26 个教学模板全误报了——
   那个量就是 p 本身，没效应的设计自然 ≈0.5。真正的下界只来自**与观测完全相等的比例**。

另：R 里拼字符串只能用 `paste0`。写 `"甲" + "乙"` 不会提示语法错，而是在**报错分支里**
抛“二进列运算符中有非数值参数”——错误信息自己坏了，把真实原因遮掉。
本轮新加的 4 处引擎报错都踩了这个坑（包括 n<6 那条本该给用户看的那句）。

## 三个在用模块的校验覆盖

```
node r-scripts/tools/test_sheet_io.mjs                # L1：模板写出→读回整链、脏表拒收、两种 sheets 形状、文件名/时间戳（67 项）
node r-scripts/tools/test_import_shell.mjs              # L2 外壳：limit=1 的第二次选文件必须走 on-exceed（16 项）
node r-scripts/tools/test_chart_host.mjs                # 画图时序：晚到/0 尺寸/画成空图都要说（42 项）
node r-scripts/tools/test_nr_options.mjs              # 界面选项 ↔ R 白名单 ↔ 模板 一致（75 项）
node r-scripts/tools/test_nr_spec.mjs                 # Non-random 导入声明 + 导出计划器 + 引擎提醒通路（45 项）
node r-scripts/tools/test_nr_view.mjs                 # Non-random 视图 + 对话框开关 + 模板真跑 R + 退化设计 + 画图时序（93 项）
node r-scripts/tools/test_nr_render.mjs               # Non-random SSR 5 状态 + 空态不报格式错 + 引擎提醒上屏（57 项）
node r-scripts/tools/test_nr_charts.mjs               # 4 张图 × 5 个设计（162 项，含 formatter 真调用）
node r-scripts/tools/verify_nonrandom_templates.mjs   # 26 模板真跑 R，p 方向逐条断言
Rscript r-scripts/tools/verify_nonrandom_engine.R     # F/R² 对齐 adonis2；连续变量必须报错
node r-scripts/tools/test_pm_spec.mjs                 # PERMANOVA 导入声明 + 导出计划器 + 示例形状（50 项）
node r-scripts/tools/test_pm_view.mjs                 # PERMANOVA 视图 + 「下载模板→导入→真跑 R」（65 项）
node r-scripts/tools/test_med_view.mjs                # Med 视图：四表按 ID 对齐 / 导出任务表 / 外壳契约 / 模板真跑 R（61 项）
node r-scripts/tools/test_med_render.mjs              # Med SSR：4 状态 + 预览行内容与列头接线（37 项）
node r-scripts/tools/test_med_charts.mjs              # 5 张图用真 R 输出驱动（77 项）
node r-scripts/tools/test_matrix_input.mjs            # 三种历史写法归一 + 空输入≠格式错（45 项）
node r-scripts/tools/test_input_formats.mjs           # 四种写法真跑 R，结果逐字相等
node r-scripts/tools/verify_med_templates.mjs         # 25 模板真跑 R（中介 p<0.05 逐个断言）
node r-scripts/tools/test_home_status.mjs             # 首页卡片状态 ↔ 真实代码（28 项）
```

改完一律跑一遍：`for t in r-scripts/tools/test_*.mjs; do node $t || break; done`。
绿灯必须带计数——“没报错”与“一句没输出”不是一回事：`test_input_formats.mjs` 以前把
`medTemplates.js` 复制成 `.mjs` 再 import，抽了 `rng.js` 之后直接 ERR_MODULE_NOT_FOUND，
而 `| tail` 这类管道把 exit=1 掩盖成了“跑过了”。现在它走 `load_frontend_utils.mjs` 的 ESM 沙箱。

SSR 冒烟里两个坑（已经踩过，改动时别再碰回去）：
- `el-dialog` 的内容走 `<teleport to="body">`，`renderToString` 只留 `<!---->` → 对话框内部根本没被渲染。
  用立即渲染的 `ElDialog`/`ElUpload` 替身接管，**替身必须尊重 `modelValue`**，而且必须
  `app.component()` 全局注册：对话框现在是子组件，局部 `components` 注册不会被子组件继承。
- Vue 的 SSR 会**吞掉渲染错误**：render 里抛 TypeError 时 `renderToString` 照样 resolve，
  只留 `<!---->`。所以“没抛异常”不算测到了，得断言捕获到的 `[error]` 为空。
  往 `ImportDialog.vue` 里注入 `:max-height="t.nope.n"` 验证过这道闸确实会红。

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


---

## 交接：GMR⁴ / Bayesian ERA 开工前必读（2026-11-18 核实）

这三条是我今天逐条跑出来的事实，不是从旧文档抄的，能省掉一次返工：

1. **依赖不用下载**。`r-runtime.lock.json` 里 177 个包、`missing_required = null`；
   `verify_r_runtime.R` 对 `gmr4`（jsonlite, Matrix —— 2026-11-18 重写为闭式解后已去掉 glmnet）与 `bayesian_era`（jsonlite, MASS）
   都报「依赖齐全」，真 exit=0。所有包都是 CRAN Windows 二进制（`Built: R 4.6.1; windows; Archs: x64`），
   92 个含编译 DLL ⇒ 以后要补包走「下 zip 拷进 `r-portable/library` + 重跑
   `export_r_lockfile.R` 并提交 lock」这条路，别装到用户库里去。
2. **现状比"占位实现"更空**：`r-scripts/gmr4.R` 100 行、`r-scripts/bayesian_era_mediation.R` 103 行，
   而 `frontend/src/views/r-analysis/` 里只有 PERMANOVA / Nonrandom / Med **三个视图**——
   GMR⁴ 与 Bayesian ERA 连视图文件都不存在。所以这是整条模块的量级（L3 声明 + 视图 + 引擎 + harness），
   不是"补 25 个模板"。
3. **受限置换的 4 类互作有现成锚点**：`verify_r_runtime.R` 已经把 `LDM::permanovaFL` 的 23 个形参列全了
   （`perm.within.type / perm.between.type / perm.within.ncol / perm.within.nrow / n.perm.max /
   n.rej.stop / tree / cluster.id / strata / how / square.dist / center.dist / scale.otu.table /
   binary / n.rarefy / test.mediation / n.cores …`）。GMR⁴ 的置换语义应当直接落在这套参数上，
   自己另写一套置换 = 再造一遍 Non-random 已经踩过的坑。
4. **Bayesian ERA 不要碰 JAGS/rjags/rstan**：打包侧已经删过 `jags.dll`（不让运行时依赖外部二进制），
   用 `MASS::mvrnorm` 手写共轭 Gibbs，ESS / R̂ / BAIC 自己实现——它们本来就要显示在结果里。

### GMR⁴ 已于 2026-11-19 上线（下面的量级已做完，只剩 Bayesian ERA）
引擎闭式重写（`# STATUS: implemented`）+ 17 项 `verify_gmr4_engine.R` + L3 `gmr4SheetSpec.js`
（含确定性模板与 `expect` 判据）+ 视图 `GMR4.vue` + 路由 + 首页卡片可用。
新增 harness：`test_gmr4_spec.mjs`(40) / `test_gmr4_view.mjs`(39)。glmnet 已从 required 去掉。

**唯一剩余模块：Bayesian ERA**（脚本仍是 `# STATUS: placeholder`，视图不存在）。
它的验收要点应当沿用 GMR⁴ 这一轮定下的三条：STATUS 状态行 + 恒等式级校验 + 模板 expect 对账。

### 开工顺序（每一步都要能单独提交且全套绿）
L3 声明（`gmr4SheetSpec.js` + `test_gmr4_spec.mjs`）→ 引擎（`gmr4.R` 重写 + `verify_gmr4_engine.R`）→
示例模板（**必须有统计下限**，见上面第 5 条：先实测出 p<0.05 再定样本数，别照抄 5 样本那种）→
视图（三层外壳 + 数据驱动画图）→ 端到端「下载模板 → 导入 → 真跑 R」。

### 新会话最先该跑的三条命令
```
for t in r-scripts/tools/test_*.mjs; do node $t > /dev/null 2>&1 || echo "FAIL $t"; done
./r-portable/bin/Rscript.exe r-scripts/tools/verify_r_runtime.R     # 看真 exit 码，别接 | tail
cd frontend && npm run build
```
基线：16 个套件、960+ 项断言全绿（`test_pm_view` 90 项里含"陷阱/退化/ID 列"三类语义断言）。
