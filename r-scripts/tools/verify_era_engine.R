# ============================================================================
# Bayesian ERA 引擎验收
# ----------------------------------------------------------------------------
# 用法：r-portable/bin/Rscript.exe r-scripts/tools/verify_era_engine.R
# 退出码：0 = 全过；1 = 有失败项
#
# §1 是**尺子自己的已知答案自检**，不是引擎测试。顺序是刻意的：
# 2026-11-20 的 spike 里出现过四个"坏消息"（R̂ 不随迭代下降、覆盖率 37.5%、
# RMSE 0.369、双标图弹警告），事后逐条查明**全是检查器写错**，模型没问题。
# 其中最阴的一个是 split-R̂ 把 B 写成 nn*var(rowMeans(H))：它给出常数偏高的 R̂，
# 而且对链间差异**完全不敏感** —— 一个分不清干净与脏的诊断，比没有诊断更糟，
# 因为它会稳定地产出"看起来通过"的结论。
# 所以引擎本体之前，先把"能不能抓住坏尺子"这件事验掉。
#
# §2 起（恒等式 / vegan::rda 锚点 / 可复现 / 契约字段）等 bayesian_era_mediation.R
# 从占位改写后补进来；在那之前本脚本只跑 §1，并明确报告"引擎尚未验收"。
# ============================================================================

root <- getwd()
for (i in 1:6) {
  if (file.exists(file.path(root, "r-scripts", "mcmc_diagnostics.R"))) break
  parent <- dirname(root)
  if (identical(parent, root)) break
  root <- parent
}
if (!file.exists(file.path(root, "r-scripts", "mcmc_diagnostics.R"))) {
  stop("找不到 r-scripts/mcmc_diagnostics.R：请在项目根目录跑本脚本")
}
setwd(root)
source(file.path("r-scripts", "mcmc_diagnostics.R"))

pass <- 0L; fails <- character(0)
ok <- function(cond, msg, detail = "") {
  if (isTRUE(cond)) { pass <<- pass + 1L; cat(sprintf("  \u2713 %s\n", msg)) }
  else { fails <<- c(fails, msg); cat(sprintf("  \u2717 %s\n      %s\n", msg, substr(detail, 1, 240))) }
}
errors_with <- function(expr) inherits(try(expr, silent = TRUE), "try-error")
# 取报错文案（没报错就返回空串），用来断言"这话是我们说的"而不是 R 顺手抛的
err_text <- function(expr) {
  r <- tryCatch({ expr; "" }, error = function(e) conditionMessage(e))
  if (!is.character(r)) "" else r
}
grabs <- function(f) paste(sprintf("%s=%.4f", names(f), f), collapse = " ")

set.seed(20261120)
N <- 1000L; NC <- 4L
iid_chains <- lapply(seq_len(NC), function(i) rnorm(N))

cat("\n\u2500\u2500 1. 尺子自检：split-R̂ 能不能分清干净与脏 \u2500\u2500\n")
r_iid <- split_rhat(iid_chains)
ok(r_iid >= 0.99 && r_iid <= 1.02, "T1 四条 iid 链的 split-R̂ ∈ [0.99, 1.02]",
   sprintf("实测 %.5f", r_iid))

# T2 链间系统性分离。上一版 spike 用"只把一条链平移 0.3σ"当失败例，那是我对 R̂ 的理解
# 错了：R̂ 是方差比，8 个半链里 2 个偏 0.3 只能把 V 推高约 1.7%，它本来就不该报警。
# 要测的能力是"链与链不同分布时抓不抓得住"，所以逐链加阶梯式偏移。
shifted <- lapply(seq_len(NC), function(i) rnorm(N) + (i - 1) * 0.5)
r_shift <- split_rhat(shifted)
ok(r_shift > 1.05, "T2 逐链偏移 0.5σ -> R̂ > 1.05（抓不到就是尺子坏了）",
   sprintf("实测 %.5f", r_shift))

rw <- function(seed) {                 # 随机游走：名义同分布，实际不混合
  set.seed(seed); x <- numeric(N); for (i in 2:N) x[i] <- x[i - 1L] + rnorm(1) * 0.3; x
}
r_rw <- split_rhat(lapply(seq_len(NC), rw))
ok(r_rw > 1.1, "T3 随机游走链 -> R̂ > 1.1", sprintf("实测 %.5f", r_rw))

cat("\n\u2500\u2500 2. 尺子自检：ESS 的量级对不对 \u2500\u2500\n")
e_iid <- ess_split(iid_chains)
ok(abs(e_iid - N * NC) / (N * NC) < 0.2, "T4 iid 的 split-ESS ≈ 总 draws（偏差 < 20%）",
   sprintf("实测 %.1f，期望 %d", e_iid, N * NC))

# AR(1) φ=0.9：积分自相关时间 tau ≈ (1+φ)/(1-φ) = 19 -> ESS/N ≈ 0.0526
ar1 <- function(seed, phi = 0.9) {
  set.seed(seed); x <- numeric(N); x[1] <- rnorm(1)
  for (i in 2:N) x[i] <- phi * x[i - 1L] + sqrt(1 - phi^2) * rnorm(1); x
}
e_ar <- ess_split(lapply(seq_len(NC), ar1))
frac <- e_ar / (N * NC); want <- (1 - 0.9) / (1 + 0.9)
ok(frac > want * 0.5 && frac < want * 2, "T5 AR(1) φ=0.9 的 ESS/N ≈ (1-φ)/(1+φ)（0.5–2 倍容差）",
   sprintf("实测 %.4f，理论 %.4f", frac, want))

cat("\n\u2500\u2500 3. 尺子自检：非法输入必须报错，不许给数 \u2500\u2500\n")
ok(errors_with(split_rhat(list(rep(1, N), rep(1, N)))),
   "T6 常数链必须报错（W=0 时返回 NaN/1 都是骗人）", "居然算出来了")
ok(errors_with(split_rhat(list(rnorm(100), rnorm(50)))),
   "T7 链长不等必须报错（静默截断会让 W/B 口径错开）", "居然算出来了")
ok(errors_with(split_rhat(list(rnorm(6), rnorm(6)))),
   "T8 链太短必须报错（几十个点上的 R̂ 没有意义）", "居然算出来了")
ok(errors_with(split_rhat(list(rnorm(N)))),
   "T9 只有一条链必须报错（split 诊断至少 2 条）", "居然算出来了")

cat("\n\u2500\u2500 4. 尺子自检：多维聚合方向（spike 里连错两次的那个）\u2500\u2500\n")
# 构造：4 列各不相同（均值 -3/-1/1/3、sd 0.1/0.3/0.5/0.7），只有第 3 列是脏的
# （逐链阶梯偏移）。如果实现把"列"和"draws"搞反（rowMeans/colMeans 那一类错），
# 结果要么所有列同一个数，要么脏列的报警落在别的列上 —— 两种都能被下面抓住。
mk <- function(dirty_col, scale_col) {
  lapply(seq_len(NC), function(i) {
    mu <- c(-3, -1, 1, 3); sdv <- c(0.1, 0.3, 0.5, 0.7)
    sdv[scale_col] <- sdv[scale_col] * 4
    M <- matrix(rnorm(N * 4, rep(mu, each = N), rep(sdv, each = N)), N, 4)
    if (!is.null(dirty_col)) M[, dirty_col] <- M[, dirty_col] + (i - 1) * 0.8
    M
  })
}
clean <- mk(NULL, 2L)
rmat <- split_rhat_matrix(clean, names. = c("q1", "q2", "q3", "q4"))
ok(all(rmat >= 0.99) && all(rmat <= 1.02), "T10 多维全干净 -> 四列 R̂ 都在 [0.99,1.02]",
   grabs(rmat))
ref_each <- vapply(seq_len(4L), function(j) split_rhat(lapply(clean, function(M) M[, j])), 1)
names(ref_each) <- names(rmat)
ok(max(abs(rmat - ref_each)) < 1e-12,
   "T11 多维入口与逐列单独计算结果一致（把列聚合了就不可能一致）",
   paste0(grabs(rmat), "  vs  " , grabs(ref_each)))

d3 <- mk(3L, 2L)
rmat3 <- split_rhat_matrix(d3, names. = c("q1", "q2", "q3", "q4"))
ok(rmat3[["q3"]] > 1.05 && max(rmat3[-3]) < 1.02,
   "T12 只有第 3 列脏 -> 报警必须只落在第 3 列", grabs(rmat3))

# 后验区间同理：逐列分位数，不许跨列平均
draws <- do.call(rbind, clean)
iv <- hdi_matrix(draws)
manual <- rbind(apply(draws, 2, quantile, .025), apply(draws, 2, quantile, .975))
ok(identical(dim(iv), c(2L, 4L)) && max(abs(iv - manual)) < 1e-12,
   "T13 HDI 逐列分位数 = 手工逐列算法（区间不许跨量共享端点）",
   paste(sprintf("[% .3f,%.3f]", iv[1, ], iv[2, ]), collapse = " "))
ok(length(unique(round(iv[1, ], 4))) == 4L, "T14 四个量的下界互不相同（错版会把它们平均成一个数）",
   paste(sprintf("%.4f", iv[1, ]), collapse = " "))
# 注意：`quantile(na.rm = FALSE)` 遇到 NA **自己就会报错**，所以"报错了吗"这个判据
# 根本没在验我们那层守卫（守卫的价值是把 R 的中英混排堆栈换成一句人话）。
# 判据必须看**报错文案**出自谁：断言我们自己的话，删掉守卫就红。
m15 <- err_text(hdi_matrix(matrix(c(1, NA, 3, 4), 2, 2)))
ok(grepl("draws 矩阵里有 NA", m15, fixed = TRUE),
   "T15 矩阵含 NA 必须走我们自己的报错（不是漏给 quantile 的英文堆栈）", substr(m15, 1, 160))
m15b <- err_text(hdi_quantile(c(1, 2, NA)))
ok(grepl("后验不该出现缺失", m15b, fixed = TRUE),
   "T16 向量版同理：报错要说是后验缺数，而不是 R 的内部提示", substr(m15b, 1, 160))

engine <- file.path("r-scripts", "bayesian_era_mediation.R")
head1 <- if (file.exists(engine)) readLines(engine, n = 1, warn = FALSE) else ""
cat(sprintf("\n\u2500\u2500 引擎状态：%s\n",
            ifelse(grepl("STATUS: implemented", head1, fixed = TRUE), "implemented（§2 起待补）",
                   "仍是 placeholder —— 本脚本目前只验收了尺子")))

cat("\n\u2500\u2500\u2500 Bayesian ERA 验收汇总 \u2500\u2500\u2500\n")
if (length(fails)) {
  cat(sprintf("[FAIL] %d 项通过 / %d 项失败\n", pass, length(fails)))
  for (f in fails) cat("  - ", f, "\n", sep = "")
  quit(status = 1)
}
cat(sprintf("[PASS] %d 项全过\n", pass))
