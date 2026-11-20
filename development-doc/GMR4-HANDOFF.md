# GMR⁴ 交接（上一会话上下文耗尽时的确切状态）

仓库：`C:/Custom/CodeRepository/Demo/electron-egg`
上一会话最后一个提交：`6743b51 fix(gmr4): 图表空白的收口`（本地领先 origin 18 个提交）。
**工作区有未提交改动**，接手第一件事先 `git diff`（约 +107/−3，涉及下面三个文件）。

> **本会话（11-20）已完成下面那条待办**，变异验证也做了，记录在 §待办 末尾。
> 旧清单两件的本会话结局：六模板对账 **已落地**（并且当场拓出了 rank1 模板造假），
> 页头居中 **根因已找到**（`global.less` 里 `#app { text-align: center }` 的继承），
> 但彻底修会改变三个已上线页的默认对齐 —— 等用户逐页看过再动。详见文末两件旧待办的现状。

## 待办：就一行 —— ✅ 已修（提交见 `git log` 的 `fix(gmr4): 导入参数进不了表单`）

`frontend/src/utils/gmr4SheetSpec.js` 的 `gmr4ToFormPatch()` 返回对象里补两个键：

```js
ranksStr: String(kv.ranks || ''),
lambdasStr: String(kv.lambdas || ''),
```

放在现有 `ranks:` / `lambdas:` 旁边。理由：表单字段名是 `xStr/yStr/zStr/ranksStr/lambdasStr`，
而补丁返回的键叫 `ranks/lambdas` → `Object.assign(this.form, patch)` 写进了不存在的属性，
参数永远进不了界面。上一会话两次正则没命中它的真实写法，所以留给肉眼。

改完应看到：

```
node r-scripts/tools/test_gmr4_view.mjs    # 实测 61/1 -> 62/0（新增两条 ranksStr 后 64/0）
node r-scripts/tools/test_gmr4_spec.mjs    # 40/0
for t in r-scripts/tools/test_*.mjs; do node $t >/dev/null 2>&1 || echo FAIL $t; done
cd frontend && npm run build
```

全绿后提交。**提交信息请保留这条脉络**：用户报的「导入数据填入表单没反应」不是一个 bug，
是两个叠在一起 —— ①预览返回 0 个 tab（于是 `apply` 被 `:disabled="!tabs.length"` 按住）
②补丁键名对不上表单字段名。只修 ①，用户仍然看不见参数。

### 本次落地的实况（含变异验证，别只信"64 绿"）

- 补的就是上面那两行；`patch.ranks/lambdas`（数组）保留，因为 `test_gmr4_spec` 靠它断言
  「ranks 留空 = 不传」「lambdas 6 档」。
- **ranksStr 原本没有任何能红的断言**（模板 ranks 留空 → 初值 `''`、期望值 `''`，永远分不出
  "填对了"和"根本没填"）。新增两条：手填 `ranks=1,2,3` 的表 → 表单真的收到；
  再导入一份 ranks 留空的表 → 旧值必须被清掉（不残留）。
- 四个变异，每个都看到对应的红：
  | 变异 | 结果 |
  |---|---|
  | 两键都缺 | 2 红（参数同步填入 / 导入填 ranksStr） |
  | 只缺 lambdasStr | 1 红（参数同步填入） |
  | 只缺 ranksStr | 1 红（导入填 ranksStr） |
  | ranksStr 改成 `if (kv.ranks)` 才写 | 1 红（再导入留空表时 `["1,2,3"]` 残留） |
- 恢复后 `test_gmr4_view` 64/0、`test_gmr4_spec` 40/0、18 个套件全绿、`npm run build` ✓。
- 脚本改文件的坑又应验了一次：`edit` 报"成功"不代表内容如你所想，
  上面的表格是靠**读回文件 + 真跑四个变异**得到的，不是靠打印。

## 已修完、已验证的部分（别重复劳动）

- **预览为空**：视图原本调 `sheetIo.previewFromFields`，那是给**群落矩阵**写的
  （内部 `if (primary.matrix && primary.species)` 才 push tab）。GMR⁴ 的 `fields.X` 是
  行优先 `{ok, ids, columns, rows}` → 实测返回 0 个 tab。已改为 spec 自己的
  `gmr4ImportTabs(ids, fields)`，并按真实形状修正两轮：表头在 **`columns`** 键
  （不是 `headers`、也不是 `X_columns`）；kv 在 **`fields.params.kv`**
  （不能遍历整个 `{ok,kv,rows}`，否则预览里会出现一行 `参数=ok`）。
- **图表空白**（上一轮）：`renderChart` 每条失败路径统一走 `fail(reason, extra)`，
  不再静默 return；`echarts.init/setOption` 抛异常也被 `.catch` 接住。用户已确认图表现在工作。
  教训写进 `frontend/src/components/r-analysis/README.md`：**「警告会响」不等于「图画得出来」**。
- **变异验证已做**（这个项目此前欠了三轮）：删掉 `ref="chartPanel"` 或页头左对齐兜底规则，
  对应断言立刻变红；恢复后 50/50。新增的 `=== 9.` 那节是**真 xlsx 走视图函数**的端到端
  （旧的两轮测试都没碰这条路，所以漏掉了这两个 bug）。

## 两件旧待办的现状（本会话更新）

1. **页头居中：根因已找到，动手要用户拍板**。真凶**不是**裸 `h1` 规则，是**继承**：
   `frontend/src/assets/global.less` 里 `#app { text-align: center }`。
   上一会话按 `h1 {` 搜当然搜不到 —— 居中没有“规则”，只有“祖先”。
   （dist 里那条 `h1{height:...}` 是 `.el-skeleton__h1` 的误匹配，不是证据。）
   现状：`.ra-shell` 系页头规则显式接管，分析页免疫；但 **Home / 任何新页面仍吃到居中**。
   彻底修法 = 去掉 #app 那行（或限定到 Home），代价是 Non-random / PERMANOVA / Med
   三个已上线页的默认对齐会一起变 —— 属设计变更，得用户逐页看过再动。
1b. **重跑样式抽取脚本会静默抹掉实机修复（本会话已堵）**。`r-analysis.css` 是生成物，
   但“内容列 max-width:1200”与“页头左对齐”两条是手工加在生成文件里的 ——
   实测：跑一次 `extract_ra_styles.mjs`，两条都没了（CSS 不报错，没人会察觉）。
   现在抽取脚本保留 `RA-MANUAL-BEGIN` 之后的内容、自检改为“生成 103 + 手工 2”守恒；
   `test_gmr4_view` 第 8 节真去重跑一次、比对字节、再原样还原（拿旧脚本做变异 → 该条立刻红）。
   附带修了一个潜伏 bug：脚本里 `function process()` 遮蔽了 Node 的 `process`，
   自检一失败 `process.exit(1)` 就抛 TypeError（报错路自己跑不通），已改名 `rewriteBlocks`。
2. **✅ 六个模板逐个真跑对账已落地**（`test_gmr4_view.mjs` 的 `=== 10.`）。
   而且**第一次跑就抓到 rank1 模板在骗人**（下面这一条就是那个循环的产出）。

## 循环抓到的新 bug：rank1 模板声称“真实秩 1”，实跑是 S=2

- 双份的假：label 写“80 样本”而 spec 是 `n: 40`；expect 写 `rank_selected: 1` 而真跑给 S=2、
  R²偏后=0.881（< 声明的 0.9 下限）。先确认不是测试路径的错：绕开 xlsx 直走 mapWorkbook
  与原路径 payload 逐字节相同、结果相同 —— 错的是模板，不是对账器。
- **根因在生成器**：`buildGmr4Design` 里 `Y = X·(AC′) + zOnY·Z + 噪声`，而 rank1 **不发 Z 列**
  （covariates=0）。Z 只能被 X 部分代理（`X = e + zOnX·Z`），代理不掉的那部分就是
  **第二条方向** —— 声称秩 1 的设计实际可解释秩是 2，引擎选 S=2 是对的。
- 修：rank1 改 `zOnX: 0, zOnY: 0, n: 60`（真跑实测 S=1、λ=1、R²偏后=0.954），label 改回 60。
  规律写进了源码注释：**不发协变量列的模板必须 zOnX=zOnY=0**。
  （fullrank / manyResp 的声称秩就是天花板 s_max，隐藏方向推不过去，不受影响；
  smallN 本来就不声明 rank_selected。）
- 这个循环的断言都过了一次变异验证：退回旧 rank1 → 3 红（label / S / R²）；
  expect 加个没人消费的键 → 2 红；删掉 biplot 的列数（秩）守卫 → 4 红，
  其中两条是上一轮已有的秩 1 断言 —— 新旧网在这条性质上对得上。

## 用户实机四条（2026-11-20 下午）与本轮处置

| 用户看到的现象 | 真因 | 处置 |
|---|---|---|
| Non-random / GMR⁴ 的 page-header 比 main-content 宽一点 | 全仓**没有 box-sizing reset**，默认 content-box；手工块的 `max-width:1200` 说的是内容宽，而页头卡片另有 padding 36×2 + border 2×2 = 76 → 实际 1276 vs 1200。另两个页没这问题因为它们根本不走 `.ra-shell` 这条规则 | 手工块里给 `.page-header` / `.main-content` 加 `box-sizing: border-box`（没碰 `.side-toolbar`：它 fixed + width:180，顺手动会少 4px）。断言钉住 |
| 刚进这两个页，视窗不在最上面而是“居中” | `router/index.js` 没有 `scrollBehavior`：hash 路由换页不重载文档，上一页的 scrollY 被带过来 | 加 `scrollBehavior`：新进入一律 `top: 0`，后退/前进才还给 `savedPosition`。源码断言钉住 |
| 真实秩 1 运行后点最后一张图，弹「图表「biplot」没画出来：no-data」 | 这不是 bug（S=1 数学上不存在二维双标图），**但把合法空白报成故障是设计 bug** —— 挘心的吐司让人以为坏了 | 新增 `chartNote` 计算属性 + `ChartPanel` 的 `note` 入参（`v-else-if` 渲染说明）：合法空白走图区说明且**零警告**；秩>=2 却缺 U/V 仍走 `fail()` 开口。两条各一条断言，另加“不许用 v-show”（v-show 期间容器 display:none，下次切回来量不到尺寸，反而变成真故障） |
| 选设计模板后卡片上写的是 undefined（本轮自查发现） | 卡片插值用了 `tpl.spec.trueRank` / `.covariates` / `.weakResponse` —— 三个键**全不存在**（真实秩叫 `S`、协变量在 `expect.covariates`、弱响应是 `expect.weak_response_index`）；而 smallN 故意没 `rank_selected`，硬套模板会写「S=undefined」 | 改成 `tplShapeLine` / `tplExpectLine` 两个计算属性，只说声明过的判据；断言：源码里不许再出现那三个插值，且六个模板卡片文字逐份验无 undefined/NaN |

另：「下载模板」现在**文件名带卡片上的中文名**（`GMR4 数据模板_时间戳_真实秩_1.xlsx`）。
数据本来就跟着 `selectedTplId` 走，但六份设计的文件名过去完全同名。
中间那一版我用的是内部 id（`_rank1` / `_smallN`），用户拿着文件回不了界面 ——
id 界面上从来不显示，所以后缀必须从 label 派生（`gmr4TemplateFileTag`）。

手测样本：`node r-scripts/tools/make_gmr4_import_fixture.mjs` 生成到
`data/GMR4_导入测试/`（data/ 在 .gitignore 里）。五份都附了**实测过的预期**：
`01` ranks=1,2,3 进框、`02` ranks 留空（导二次必须把 01 的旧值清掉）、
`03` ranks=1,2,9 要开口说越界（min(p,q)=5）、`04` lambda 只两档（网格列数=2）、
`05` 分隔符带空格与多余逗号（框里原样显示，numList 仍解析出 3 个）。

## 这一轮（用户实机又报两条 + 拍板一条）

1. **拿掉了全局广播**（用户拍板）：`global.less` 里 `#app` 不再写 `text-align: center`。
   同时：Home 自己在 `.home-container` 上声明居中（同样的画面，不同的作用域，
   Home 零变化）；`.ra-shell` 在手工块里显式 `text-align: left`。
   三条都有断言（#app 不许再写 text-align / Home 必须自己声明 / 外壳必须显式左）。
   **回归要看的**：PERMANOVA / Med 两个页以前正文是“顺手继承”来的居中，
   现在靠它们自己的 scoped 声明 —— 没声明过的块会从居中变左对齐。
2. **页头比 main-content 宽 76px**：根因不是那条 max-width 写错，而是
   **全仓没有 box-sizing reset**：content-box 下 max-width 算的是内容宽，
   页头卡片另有 padding 36×2 + border 2×2 = 76 → 1276 vs 1200。
   另两个页看不出来是因为它们不走 `.ra-shell` 这条规则。
   修：手工块里给 `.page-header` / `.main-content` 加 `box-sizing: border-box`；
   没动 `.side-toolbar`（fixed + width:180，顺手动会少 4px）。
3. **刚进页面不在顶部**：`router/index.js` 没有 `scrollBehavior`，hash 换页不重载文档，
   上一页的 scrollY 被带过来。修：新进 `top: 0`，后退/前进才还给 `savedPosition`。
4. **秩 1 点双标图弹橙色警告**：那**不是 bug**（S=1 数学上不存在二维双标图，
   正是该模板要教的东西），但把合法空白报成故障是设计 bug。
   修：`chartNote` 计算属性 + `ChartPanel` 的 `note` 入参（`v-else-if` 渲染 `.chart-empty`），
   合法空白走图区说明且零警告；秩>=2 却真缺 U/V 仍必须 `fail()` 开口。
   两个实现坑已经写进注释：chartNote 必须是计算属性而不是 renderChart 里写的状态
   （切 tab 时 DOM 要同帧，否则量不到容器）；容器用 v-else-if 而不是 v-show
   （v-show 期间 display:none，下次切回来反而变成真 zero-size 故障）。
5. **自查出的第三个 bug**：模板卡片插值用了 `tpl.spec.trueRank` / `.covariates` /
   `.weakResponse`——三个键**全不存在**（真实秩叫 `S`、协变量在 `expect.covariates`、
   弱响应是 `expect.weak_response_index`），所以卡片当着用户面写 `undefined`；
   而 smallN 故意不声明 rank_selected，硬套旧写法会写「选型回到 S=undefined」。
   修：`tplShapeLine` / `tplExpectLine` 两个计算属性，只说声明过的判据。
6. **分析后默认图**：旧代码 `rank_selected >= 2 ? 'selection' : 'cvHeat'` ——
   那是在绕开双标图，可双标图本就不是默认页；结果是真实秩 1 / 小样本跑完直接跳到
   CV 热图，用户找不到主图。现在 `defaultChartTab()` 永远返回声明里的第一张。
7. **下载模板文件名**：数据一直跟着 `selectedTplId` 走，但六份设计下出来的文件
   全同名。现在后缀取自卡片 label 的中文名（`gmr4TemplateFileTag`），逐模板断言文件名与内容同源。
   id ↔ 卡片名对照（界面只看得到右边，下一轮别再拿 id 当用户语言）：
   `lowrank3`=真实秩 3 · `rank1`=真实秩 1 · `fullrank`=真实秩=满秩 ·
   `confoundedZ`=强混杂 · `smallN`=**样本不比变量多** · `manyResp`=响应远多于变量

手测样本生成器（脚本入库、产物进 `data/`，data/ 被 gitignore）：
`node r-scripts/tools/make_gmr4_import_fixture.mjs` → 五份真 xlsx（ranks 手填 /
ranks 留空验不残留 / ranks 越界验开口 / lambda 只两档 / 分隔符带空格），
每份的“预期”都是脚本实测出来的，不是猜的。

本会话的变异记录（每条新断言都见过红）：
- 两键都缺 / 只缺 lambdasStr / 只缺 ranksStr / ranksStr 改成条件写 → 2/1/1/1 红
- 退回旧 rank1 模板 → 3 红；expect 加装饰品键 → 2 红；删 biplot 秩守卫 → 4 红
- 拿旧版抽取脚本跑新断言 → 1 红（手工块被抹）
- box-sizing / scrollBehavior / 卡片旧插值 / legit-empty 安静分支 / ChartPanel note 通道
  → 各 1 红（删 note 通道时“真缺数据仍要开口”那条仍绿，两条确实各看各的）
- #app 写回居中 / Home 删居中 / 外壳删左对齐 → 各 1 红；默认图退回三元 +
  defaultChartTab 改返第二张 → 1 + 6 红

## 这个项目的硬规矩（踩过的坑，别再踩）

- 断言写完必须**看它红一次**，否则它可能在给 bug 发绿卡。
- 源码层断言（“某某旧写法不许回来”）比对前必须**剥掉注释**：修复说明里往往会引用
  旧写法原形，不剥就是误报（本轮真实地误报了一次）。
- 脚本改文件先想清楚行尾：working tree 是 CRLF，python 拿 `\n` 去拼去匹配会
  静默不落地（本轮又造一次，靠“断言没红”发现的）。改完必须 grep 回读。
- 对齐类问题先想**继承**再想规则：按 `h1 {` 搜不到不等于不存在，
  `#app` 这种根容器上的 text-align 会广播给整棵树。
- `max-width` 在没有 box-sizing reset 的仓里算的是**内容宽**：
  padding + border 都要算到总宽里去，不然“同宽”的两块卡片实际差 76px。
- python 的 `str.replace` 不报错就是没落地：改完必须自己 verify 结果（本项目已栽 4 次）。
  具体到行尾：working tree 是 CRLF，拿 `\n` 去拼/去匹配会静默不改（本轮靠“断言应该红却没红”才发现）。
  真正可信的确认只有两种：grep 回读、以及看预期该红的断言真的红了。
- 测试里用 `comp.methods` 全量覆盖 vm 时，桩（`notify`）必须**后置**，否则被真方法顶掉。
- 不要用不存在的测试文件名跑套件（`MODULE_NOT_FOUND` 会被误读成回归）。
- 模板的 `expect` 必须是**今天重跑出来的事实**：隔了一天引擎/生成器一改，它就是愿望。
  只有默认模板被回归网兜住 = 其余五个可以随时劣化（rank1 就是这么假的）。
- 矩阵方向、`String('')`→`Number`→`0`、"方阵 ≠ 距离矩阵"这三类形状假设，
  都必须由真实数据实测来判，不能靠推理。
