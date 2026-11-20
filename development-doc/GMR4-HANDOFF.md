# GMR⁴ 交接（上一会话上下文耗尽时的确切状态）

仓库：`C:/Custom/CodeRepository/Demo/electron-egg`
上一会话最后一个提交：`6743b51 fix(gmr4): 图表空白的收口`（本地领先 origin 18 个提交）。
**工作区有未提交改动**，接手第一件事先 `git diff`（约 +107/−3，涉及下面三个文件）。

## 待办：就一行

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
node r-scripts/tools/test_gmr4_view.mjs    # 59/1 -> 60/0
node r-scripts/tools/test_gmr4_spec.mjs    # 40/0
for t in r-scripts/tools/test_*.mjs; do node $t >/dev/null 2>&1 || echo FAIL $t; done
cd frontend && npm run build
```

全绿后提交。**提交信息请保留这条脉络**：用户报的「导入数据填入表单没反应」不是一个 bug，
是两个叠在一起 —— ①预览返回 0 个 tab（于是 `apply` 被 `:disabled="!tabs.length"` 按住）
②补丁键名对不上表单字段名。只修 ①，用户仍然看不见参数。

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

## 仍未闭环的两件（诚实清单）

1. **页头居中的根因没消除**。真凶是全局一条裸 `h1 { text-align: center }`
   （用户 Computed 面板给出的顺序：兜底规则 > `.ra-shell .page-title` > `h1`）。
   仓库里搜不到来源，应在 `frontend/public` 下 HTML 内联样式或运行时注入。
   现在靠更高特异性压住 —— **它还在影响别处的 `<h1>`**，该揪出来限定作用域。
2. **`gmr4ImportTabs` 只在 lowrank3 / rank1 两个模板上验过**。其余四个（fullrank /
   confoundedZ / smallN / manyResp）走的是同一条代码路径，但没断言。上一会话明确说过：
   「六个模板逐个真跑对账」那个循环**始终没有落地**（python 锚点不匹配而静默未改），
   目前 6 个模板的 `expect` 只有默认模板被回归网兜住。

## 这个项目的硬规矩（踩过的坑，别再踩）

- 断言写完必须**看它红一次**，否则它可能在给 bug 发绿卡。
- python 的 `str.replace` 不报错就是没落地：改完必须自己 verify 结果（上一会话栽了 3 次）。
- 测试里用 `comp.methods` 全量覆盖 vm 时，桩（`notify`）必须**后置**，否则被真方法顶掉。
- 不要用不存在的测试文件名跑套件（`MODULE_NOT_FOUND` 会被误读成回归）。
- 矩阵方向、`String('')`→`Number`→`0`、"方阵 ≠ 距离矩阵"这三类形状假设，
  都必须由真实数据实测来判，不能靠推理。
