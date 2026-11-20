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

## 这个项目的硬规矩（踩过的坑，别再踩）

- 断言写完必须**看它红一次**，否则它可能在给 bug 发绿卡。
- python 的 `str.replace` 不报错就是没落地：改完必须自己 verify 结果（上一会话栽了 3 次）。
- 测试里用 `comp.methods` 全量覆盖 vm 时，桩（`notify`）必须**后置**，否则被真方法顶掉。
- 不要用不存在的测试文件名跑套件（`MODULE_NOT_FOUND` 会被误读成回归）。
- 脚本改文件的坑：**补一行“读回 + grep 确认”比什么打印都可信**。本会话用 python 改
  `gmr4SheetSpec.js` 四次（包括三个变异），每次靠“测试行为变了”而非“脚本报成功”来确认落地。
- 模板的 `expect` 必须是**今天重跑出来的事实**：隔了一天引擎/生成器一改，它就是愿望。
  只有默认模板被回归网兜住 = 其余五个可以随时劣化（rank1 就是这么假的）。
- 矩阵方向、`String('')`→`Number`→`0`、"方阵 ≠ 距离矩阵"这三类形状假设，
  都必须由真实数据实测来判，不能靠推理。
