# 多变量统计分析桌面端

离线运行的统计分析桌面应用（Electron + Vue + 便携版 R）。面向微生物组 / 生态 / 医学社科数据：
距离矩阵置换检验、中介分析、受限置换、广义多响应回归、贝叶斯扩展冗余分析。

**所有统计量都在本地 R 里算，前端不计算任何 p 值、校正或效应量。**
每个模块都配"已知答案自检"（与 `vegan::adonis2`、`p.adjust`、闭式 OLS/岭解等独立实现逐位对照），
下面「验证」一节是可直接运行的命令，不是承诺。

---

## 1. 预先准备（新机器按这个顺序走）

### 1.1 装 JS 依赖

```bash
npm run setup:js          # 根目录 + frontend 两级依赖，一条命令
# 或严格照 lockfile 安装（CI / 复现用这个）：
npm run setup:js:frozen
```

不用 `npm install && npm --prefix frontend install` 那种链式写法：Windows 自带的
PowerShell 5.x 不支持 `&&`。这一步交给 `r-scripts/tools/install_deps.mjs`，跨平台行为一致。

要求：Node ≥ 18（实测 24.x）、npm 可用。

### 1.2 装 R 运行时与包

本项目**不把 603MB 的 R 运行时塞进 git**，而是用 lockfile 精确声明 + 一条命令装配：

| 文件 | 作用 |
| --- | --- |
| `r-runtime.lock.json` | 177 个包的精确版本 + 每个模块需要哪些包 + R 最低版本 |
| `scripts/setup-r-runtime.ps1` | 唯一装配入口（4 种来源，自动校验） |
| `r-scripts/tools/verify_r_runtime.R` | 校验运行时是否满足 lockfile（含两个真实冒烟分析） |
| `r-scripts/tools/export_r_lockfile.R` | 从"这台跑通过的机器"重新导出 lockfile |

```bash
npm run setup:r           # 依次尝试 verify -> fromRelease -> fromRepos，并说清下一步该做什么
npm run setup:r:repos     # 直接从 CRAN / Bioconductor 现装（需要联网，不需要管理员）
npm run setup:r:verify    # 只检查现有 r-portable 是否可用（几秒钟）
```

> ⚠️ **现状说明**：`r-runtime.lock.json` 里 `release.url` 与 `release.sha256` 仍是 `null`，
> 所以 `-Mode fromRelease`（整包下载）目前**用不了**。能用的路径是 `-Mode fromLocal -From <本机备份目录或zip>`
> 和 `-Mode fromRepos`。要把这条通道打通，需上传运行时到 GitHub Release 后把
> `tag / url / sha256 / size_bytes` 写回 lockfile（`npm run verify:env` 会把这件事作为提示列出来）。

必需包很少，且都不需要编译：

| 模块 | 需要的 R 包 |
| --- | --- |
| PERMANOVA / 事后检验 | `jsonlite` `vegan` |
| PERMANOVA-med | `jsonlite` `vegan` **`LDM`**（Bioconductor） |
| Non-random PERMANOVA | `jsonlite` `vegan` |
| GMR⁴ | `jsonlite` `Matrix` |
| Bayesian ERA | `jsonlite` `MASS` |

### 1.3 自检（推荐每次换机器/换分支后先跑）

```bash
npm run verify:env
```

它只回答一个问题：**现在这台机器缺什么，下一步敲哪条命令。**
输出分级是有道理的——运行时和包都齐了的话，"Release 地址为空"只算提示，不算环境未就绪
（那是发布渠道的待办，不影响本机跑分析）。

### 1.4 启动

```bash
npm run dev               # 开发模式（前端热更新 + Electron）
npm run build && npm run start
```

---

## 2. 使用手册

打开应用后是方法卡片首页。五张卡片对应五个方法，卡片上的「N 套设计模板」是**可对账的数字**
（`test_home_status.mjs` 会拿它和 spec/JSON 里的真实数量比对，写错就红）。

| 方法 | 路由 | 引擎 |
| --- | --- | --- |
| PERMANOVA（含事后检验） | `/r-analysis/permanova` | `permanova.R` / `permanova_posthoc.R` |
| PERMANOVA-med | `/r-analysis/permanova-med` | `permanova_med.R` |
| Non-random PERMANOVA | `/r-analysis/nonrandom-permanova` | `nonrandom_permanova.R` |
| GMR⁴ | `/r-analysis/gmr4` | `gmr4.R` |
| Bayesian ERA | `/r-analysis/bayesian-era` | `bayesian_era_mediation.R` |

（路由定义在 `frontend/src/router/routerMap.js`；卡片与路由的对应关系由 `test_home_status.mjs` 检查，
标了"可用"却没有视图/路由会直接红。）

通用操作：**下载模板 → 填 xlsx → 导入 → 检查预览 → 运行 → 导出**。
模板下载给的是三张表（数据 + 参数 + 填写说明），导入按样本 ID 对齐，行序不需要你排。

### 2.1 PERMANOVA（群落差异的置换检验）

- **输入**：距离矩阵（首行首列为样本名，对称、对角 0）＋ 样本表 ＋ 模型公式
- **样本表**：列字典 `{列名: [值…]}`。**第一列约定放样本 ID**，但这是约定、不是规则——
  引擎按取值判断：逐样本唯一才算 ID；若首列取值只有几个水平（如 `Habitat` 三档），
  它会被当普通分组列正常建模。
- **公式**：写**列名**，不写取值。支持 `+`（加项）、`*`（嵌套＋交互）、`:`（交互）、
  `as.factor(x)`（显式因子）。33 套内置模板由 `frontend/src/data/permanova-templates.json`
  渲染成按钮，加一套模板只改 JSON 即可。
- **输出两张表**（重要）：
  1. **整模型**（Model / Residual / Total）——`Model` 行是**所有项合起来**的检验，
     不是"第一个变量的结果"；
  2. **分项（边际）检验**——公式项数 > 1 时自动给（`adonis2 by = "terms"`），
     这才是"哪个变量显著"。分项 R² 相加恒等于整模型 R²。
- **随机种子**：置换次数旁边的输入框。同数据换种子，R²/F 不变、p 会在 `1/(次数+1)` 量级上抖——
  这是置换检验的分辨率，不是 bug。若结论随种子翻转，说明它本来就悬在阈值上，请加置换次数。
- **PCoA**：按公式首项着色，坐标可单独导出。

**事后检验（pairwise PERMANOVA）**

在结果区点「运行事后检验」。每对组**单独**做一次两组 PERMANOVA（在它们自己的样本上重新置换
pseudo-F），不是拿整体 p 去拆。

- 默认 999 次随机置换；组合数 ≤ 5 万的配对自动改用**穷举精确**置换（表里"置换口径"列会写"精确 N 个划分"）。
- 三列 p 并列给出：`p（置换）`、`p（BH）`、`p（Bonferroni）`。**下拉框选的只是星号从哪列起**，
  两列永远都算给你——两者结论不同的对子最该被看见，不由软件替读者决定。
- 导出 xlsx 含「说明」表：写明 p 来自 `r-scripts/permanova_posthoc.R`、分辨率下限怎么读、本次口径。

**常见拒绝与含义**

| 报错 | 为什么 | 怎么办 |
| --- | --- | --- |
| `X 是样本 ID 列（第一列，N 个样本有 N 个不同取值）` | 首列逐样本唯一，建模它会"完美拟合"，F/p 无定义 | 把分组列写到公式首项，ID 列不进公式 |
| `不是样本表里的列名` | 把取值当列名写进公式了 | 提示里会列出可用列**和每列取值**，照列名改 |
| `因子项 X 有 N 个水平，而样本一共 N 个` | 每样本自成一组，残差自由度 0 | 合并水平或加样本；本就是连续量就别包 `as.factor` |
| `样本数 (n) 与距离矩阵 (m) 不匹配` | 表和矩阵不是同一批样本 | 检查表头/行名，或重新导出距离矩阵 |
| `距离矩阵不对称 / 对角线不为 0 / 有负值` | 不是合法的两两距离 | 检查上游算法（非度量相异度需换方法） |

### 2.2 PERMANOVA-med（中介分析）

基于 `LDM::permanovaFL`，给直接效应、间接效应与总效应。25 套设计模板。

三条硬约束（不满足会**当场拒单**并说明原因，不会给你一个假的 p）：

1. **置换次数必须是 100 的整数倍**——LDM 内部分块置换（`n.perm.block = 100`）。
2. **样本数 n ≥ 6**，建议 ≥ 20：n ≤ 4 直接崩，n = 5 随机崩，n < 15 功效极低。
3. Y / M 里不能留文本列（X 里的分组文本会自动编码，Y/M 不会——那是被解释端）。

### 2.3 Non-random PERMANOVA（受限 / 分层 / 空间置换）

采样设计本身不允许自由乱序时用这个（批次、区组、空间邻域）。26 套模板。
按 `scheme` 选择置换受限方式，`strata` 指定区组列，`distance` 支持 bray / ws / jaccard 等。
`ws`（加权 Wossmann）在本机 vegan 2.7.6 里没有对应实现，脚本内自实现并校验了距离公理。

### 2.4 GMR⁴（广义多响应回归 + 选型）

多响应 ~ 多预测的降秩回归，交叉验证选**秩 S** 与正则强度 λ。9 套模板。
口径已对齐全闭式：满秩 + λ→0 逐元素等于逐响应 OLS；满秩等于岭解；RSS 随秩单调。
真实秩为 1 的设计只有一维，载荷双标图画不出来——界面会明说，不给一张空图。

### 2.5 Bayesian ERA（扩展冗余分析 + 中介，共轭 Gibbs 采样）

X→M→Y 拆成直接 / 间接 / 总三条通路，每个格子给后验均值、HDI 区间、`P(β>0)`，
并按 Borcard 三分法拆 `X 独有 / X∩M（经中介）/ M 独有 / 残差`。附 split-R̂ 与 ESS 收敛诊断。
12 套设计模板（含"两条中介相互抵消"、"shared 为负"等教学夹具）。

**方差分解出现负数怎么办**：负值不是算错，也**不是共线造成的**（共线很强时 `shared ≈ R²(X) ≥ 0`）。
两个真实机制：① X 与 M 本来无关时 shared 的真值就是 0，样本内多列过拟合让估计在 0 两侧飘
（模板 🧲 `shared 为负` 实测 −0.20）；② 文献里常用**调整后 R²**，其罚项也会产生负分量。
对比数字前先看清是哪一种口径。

**秩亏会硬停**：若 X 与 M 合起来线性相关（比如同一时点只测一次的中介），引擎直接拒单，
不静默丢列、不给不可解释的系数。

---

## 3. 验证（这些命令是真能跑的）

```bash
npm run verify            # 全部：24 个 node 套件 + 4 个 R 尺子
npm run verify:js         # 只跑 node（视图渲染 / spec 对账 / 运行时链路）
npm run verify:r          # 只跑 R 尺子（统计口径的已知答案）
npm run verify:one era    # 名字含 era 的都跑
```

| 尺子 | 项数 | 关键锚点 |
| --- | --- | --- |
| `verify_permanova_engine.R` | 37 | 与 `vegan::adonis2` 逐位；分项 R² 之和 = 整模型 R²；H0 下拒绝率与 KS 均匀性 |
| `verify_posthoc_engine.R` | 80 | 与 `adonis2` 逐位；BH/Bonferroni 与 `p.adjust` 逐位；穷举 p = k/C(n,k)；40 轮零假设校准 |
| `verify_era_engine.R` | 64 | 与闭式 OLS / 岭解逐位；后验均值与 MLE 对齐；恒等式 Σ 分中介通路 = 合计间接效应 |
| `verify_gmr4_engine.R` | 27 | 满秩 λ→0 = OLS；满秩 = 岭解；RSS 随秩单调 |

另有两类不靠 R 的套件：`test_ipc_chain.mjs`（30 项）逐个验证 6 个通道的运行时链路；
`test_packaging.mjs`（26 项）验证打包链路的三个环节（见 §5）。

四条纪律（写代码时必须守，都是踩坑换来的）：

1. **已知答案不许从被验代码推。** 锚点必须是独立实现（`vegan::adonis2`、`p.adjust`、闭式解）。
   本项目曾因"手算期望值与错公式一起错"自证通过。
2. **前置条件不成立时必须红。** 空表会让 `max(abs(空)) < tol` 变成 `-Inf < tol`，
   什么都没测到却绿。现在依赖它的判据一律标红（"前置条件失败，未验证"）。
3. **判据必须打在生效的那一层。** 注释里保留旧代码当证据时，文本匹配会命中注释而假红/假绿；
   所以匹配前先剥注释（含 HTML 注释）。
4. **计数锁。** 每个套件跑到的判据数必须等于写死的 `EXPECT_TOTAL`，多一条少一条都算失败——
   曾经有一节测试被插进 `catch` 分支里，一次都没执行而汇总仍报"0 失败"。

改引擎时的验证顺序：**改动能编译 → 立刻提交 → 才允许任何恢复手段**（还原用文件副本，
不用 `git checkout --`，后者会连未提交的工作一起抹掉）。

---

## 4. 目录结构（只列与统计有关的部分）

```
r-scripts/                  分析引擎（R）
  permanova.R               PERMANOVA 主引擎（含分项边际检验）
  permanova_posthoc.R       事后两两 PERMANOVA（受限置换 pseudo-F + BH/Bonferroni）
  permanova_med.R           中介分析（LDM::permanovaFL）
  nonrandom_permanova.R     受限/分层/空间置换
  gmr4.R                    广义多响应降秩回归
  bayesian_era_mediation.R  贝叶斯 ERA + 中介（共轭 Gibbs）
  mcmc_diagnostics.R        split-R̂ / ESS / HDI（引擎与验收脚本共用同一份实现）
  tools/                    验收与开发脚本（verify_* 尺子、test_* 套件、装配自检）
  reference/                上游文档摘录（LDM 参数、permanovaFL 说明）
frontend/src/utils/         各模块的 spec（模板、表单映射、导出表列定义）——界面内容唯一来源
frontend/src/data/          PERMANOVA / med 的公式模板 JSON
electron/                   主进程：rController（参数白名单）+ rIpc（通道注册）
development-doc/            设计文档与逐轮记录（BAYESIAN-ERA-DESIGN.md 是主线索）
scripts/setup-r-runtime.ps1 R 运行时装配入口
r-runtime.lock.json         R 运行时锁定声明
```

每个引擎头部有 `# STATUS: implemented | library | partial | placeholder`，
且声明 `implemented` 的必须被某个 harness 引用——这条由 `test_home_status.mjs` 锁着：
**"可用"两个字必须有机器可查的依据。**

---

## 5. 打包

```bash
npm run build-w        # Windows x64
npm run build-m        # macOS arm64
npm run build-m-x86    # macOS x86_64
npm run build-l        # Linux
```

打包不只是一条命令，有三个环节必须同时对上，否则**装得上、跑不了**：

| 环节 | 现在怎么做的 | 谁来守 |
| --- | --- | --- |
| R 脚本随包分发 | 四个平台的 builder 配置都声明 `asarUnpack: ["r-scripts/**/*"]`；主进程解析到 `app.asar.unpacked/r-scripts` | `test_packaging.mjs` |
| 为什么不能只放 asar 里 | R 进程走真实文件系统，**不认识 asar**；传归档内路径只会得到一句没有上下文的 cannot open file | 同上 |
| R 运行时随包分发 | 把 `r-portable/` 放进 `build/extraResources/`，electron-builder 会拷到 `<安装目录>/resources/extraResources/r-portable`；主进程的候选列表已包含该位置 | 同上 |
| 没带运行时时的傅底 | 继续找用户目录下的 R-Portable 与 PATH 里的 Rscript；都找不到时日志把**搜过的位置全列出来** | 同上 |

> ⚠️ **现状**：`build/extraResources/` 里目前只有 `dll/`，**没有 r-portable**。
> 也就是说：现在直接 `npm run build-w` 打出来的安装包，用户装好后一跑分析就找不到 R。
> 发布前必须先把运行时拷进 `build/extraResources/r-portable`（本机已有，约 603MB），
> 或者接受"用户自己装 R + 加入 PATH"。

> 上一轮之前更糟：主进程里把搜索根**写成了开发机的绝对路径**，且 `r-scripts` 根本没进打包清单
> —— 开发机上两者恰好都能命中，所以从来没人发现。

---

## 6. 当前未完成 / 已知边界

诚实清单（都有 grep 依据，不是免责套话）：

- 导出已全部走 spec（五个视图都是 `writeWorkbook(...)`，视图里不再有 `json_to_sheet` /
  `book_append_sheet`）—— 这条原本在待办里，本轮做完并从清单移除了。
- **安装包里的 R 运行时尚未就位**（见上面 §5 的 ⚠）：这是目前真正挡住"发给别人用"的那一项。
- `r-runtime.lock.json` 的 `release.url` / `sha256` 仍为 `null` → 新开发者 clone 后只能用
  `-Mode fromLocal` 或 `-Mode fromRepos` 装配 R。
- 导出已全部走 spec（五个视图都是 `writeWorkbook(...)`，视图里不再有 `json_to_sheet` /
  `book_append_sheet`）—— 这条原本在待办里，本轮做完并从清单移除了。仍然缺的是：
  **导出内容与界面显示的一致性**只有源码级断言，没有"打开 xlsx 逐格核对"的运行时测试。
- 运行时链路测试（`test_ipc_chain.mjs`，30 项）覆盖 6 个通道到"引擎出数"，
  但没有覆盖 Electron 主进程真实启动（`ElLoading` 那层需要浏览器 DOM）。
- 分项（边际）检验只给了 PERMANOVA 主引擎；`permanova_med` / `nonrandom` 语义不同，不照搬。

---

## 7. 许可与来源

基于 [ElectronEgg V5](https://github.com/dromara/electron-egg)（Apache-2.0）构建。
统计实现依赖 R 与 [vegan](https://cran.r-project.org/package=vegan)、
[LDM](https://bioconductor.org/packages/LDM) 等上游包，各自遵循其许可证。
