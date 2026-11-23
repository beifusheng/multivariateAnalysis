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

RSCRIPT <- file.path(R.home("bin"), "Rscript.exe")
if (!file.exists(RSCRIPT)) RSCRIPT <- "Rscript"     # 系统 R 也能跑，别把自己绑死在便携版
TMP <- file.path(tempdir(), "era_verify"); dir.create(TMP, showWarnings = FALSE, recursive = TRUE)

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

if (!file.exists(engine)) {
  cat("\n引擎文件还不存在 —— 本次只验收尺子（§1）\n")
} else {

# 标准化尺度下的真值换算：spike 里那个“覆盖率 37.5%”的假事故就是拿原始尺度真值
# 去比标准化尺度后验造出来的。这里故意用**独立的 sweep 实现**（不与引擎共码）：
# 对了是两边都对，错的时候不会一起错。
truth_std <- function(G, B, W, X, M, Y) {
  sX <- apply(X, 2, sd); sM <- apply(M, 2, sd); sY <- apply(Y, 2, sd)
  list(dir = as.vector(sweep(sweep(B, 1, sX, '*'), 2, sY, '/')),
       ind  = as.vector(sweep(sweep(G, 1, sX, '*'), 2, sM, '/') %*%
                        sweep(sweep(W, 1, sM, '*'), 2, sY, '/')),
       tot  = NULL)
}
sim_xy <- function(n, G, B, W, sdM = 0.8, sdE = 0.7, seed = 11) {
  set.seed(seed)
  # G 是 p x k（行=预测变量），B 是 p x q，W 是 k x q。
  # 上一版把 p 当成 ncol(G)（那就是 k），X %*% G 当场“非整合参数”——
  # 夹具自己把维度读反，跟引擎无关，所以这类错也要当 bug 修而不是“换个写法绕过去”。
  p <- nrow(G); k <- ncol(G); q <- ncol(B)
  stopifnot(nrow(B) == p, nrow(W) == k, ncol(W) == q)
  X <- matrix(stats::rnorm(n * p), n, p)
  M <- X %*% G + matrix(stats::rnorm(n * k) * sdM, n, k)
  Y <- X %*% B + M %*% W + matrix(stats::rnorm(n * q) * sdE, n, q)
  list(X = X, M = M, Y = Y)
}
run_era <- function(payload, tag) {
  i <- file.path(TMP, paste0(tag, ".json")); o <- paste0(i, ".out"); e <- paste0(i, ".err")
  # digits = NA：默认只写 4 位有效数字，夹具先把数据舍入再拿去比全精度闭式解，
  # 恒等式检查看到的就是自己的舍入（gmr4 验收脚本实测过这个坑）
  writeLines(jsonlite::toJSON(payload, auto_unbox = TRUE, digits = NA), i)
  st <- system2(RSCRIPT, c(shQuote(engine), shQuote(i), shQuote(o), shQuote(e)),
                stdout = FALSE, stderr = FALSE)
  if (st != 0L) {
    return(list(code = st, err = if (file.exists(e))
      paste(readLines(e, warn = FALSE), collapse = " ") else ""))
  }
  list(code = 0L, r = jsonlite::fromJSON(readLines(o, warn = FALSE)), file = o)
}

G0 <- matrix(c(0.9, -0.5), 2, 1); W0 <- matrix(c(0.8, -0.6), 1, 2)
B0 <- matrix(c(0.4, -0.2, 0.0, 0.35), 2, 2)
d0 <- sim_xy(200, G0, B0, W0)

cat("\n\u2500\u2500 5. 引擎：正常路径与输出契约 \u2500\u2500\n")
b <- run_era(list(X = d0$X, M = d0$M, Y = d0$Y, chains = 4L, iterations = 4000L,
                  thin = 5L, seed = 12345L), "base")
ok(b$code == 0L, "E1 真跑通（exit=0）", b$err)

if (b$code == 0L) {
  r <- b$r
  need <- c("effects", "variance_partition", "convergence", "identity_check",
            "waic", "draws", "diagnostics", "interpretation", "cell_labels",
            "X_scale", "M_scale", "Y_scale", "thresholds")
  ok(all(need %in% names(r)), "E2 契约字段齐全（视图只读这些）",
     paste(setdiff(need, names(r)), collapse = ","))
  efields <- c("mean", "sd", "median", "hdi_lo", "hdi_hi", "prob_gt0", "rhat", "ess", "ols")
  ok(all(unlist(lapply(r$effects, function(e) all(efields %in% names(e))))),
     "E3 直接/间接/总三块的字段一致且齐全",
     paste(setdiff(efields, names(r$effects$indirect)), collapse = ","))
  ok(length(r$effects$indirect$mean) == r$p * r$q && length(r$cell_labels) == r$p * r$q,
     "E4 格子数与标签数都 = p*q",
     sprintf("mean %d / labels %d / p*q %d", length(r$effects$indirect$mean),
             length(r$cell_labels), r$p * r$q))
  # 标签顺位必须是“预测快 / 响应慢”：spike 里选错顺序会得到“覆盖 8/12”这种假发现
  ok(identical(r$cell_labels[1], "X1\u2192Y1") && identical(r$cell_labels[2], "X2\u2192Y1"),
     "E5 标签顺序与展平口径一致（X 快 / Y 慢）",
     paste(head(r$cell_labels, 4), collapse = " | "))

  cat("\n\u2500\u2500 6. 引擎：三条硬校验 \u2500\u2500\n")
  ok(r$identity_check$total_minus_parts < 1e-8, "E6 恒等式 tot = dir + ind（逐 draw）",
     sprintf("残差 %.3g", r$identity_check$total_minus_parts))
  ok(isTRUE(r$convergence$ok) && r$convergence$rhat_max <= r$thresholds$rhat_max &&
       r$convergence$ess_min >= r$thresholds$ess_min,
     "E7 收敛达标（R̂ 与 ESS 都在阈内）",
     sprintf("R̂max %.4f / ESSmin %.0f", r$convergence$rhat_max, r$convergence$ess_min))
  ok(r$identity_check$posterior_vs_ols_direct <= r$identity_check$tolerance &&
       r$identity_check$posterior_vs_ols_indirect <= r$identity_check$tolerance,
     "E8 后验均值与同数据 OLS 对齐",
     sprintf("direct %.4f / indirect %.4f，容差 %.4f",
             r$identity_check$posterior_vs_ols_direct,
             r$identity_check$posterior_vs_ols_indirect, r$identity_check$tolerance))

  ts <- truth_std(G0, B0, W0, d0$X, d0$M, d0$Y)
  hit <- sum(r$effects$indirect$hdi_lo <= ts$ind & ts$ind <= r$effects$indirect$hdi_hi)
  ok(hit == length(ts$ind), "E9 间接效应区间覆盖**标准化尺度**真值（逐格）",
     sprintf("%d/%d；真值 %s vs 区间 %s", hit, length(ts$ind),
             paste(round(ts$ind, 3), collapse = ","),
             paste(sprintf("[%.2f,%.2f]", r$effects$indirect$hdi_lo,
                           r$effects$indirect$hdi_hi), collapse = " ")))
  ok(max(abs(r$effects$indirect$mean - ts$ind)) < 0.15,
     "E10 后验均值与标准化真值量级对得上（不只靠区间活着）",
     sprintf("最大偏差 %.4f", max(abs(r$effects$indirect$mean - ts$ind))))

  cat("\n\u2500\u2500 7. 方差分解：逐响应 + 外部锚点 \u2500\u2500\n")
  vp <- r$variance_partition
  ok(max(abs(vp$x_unique + vp$m_unique + vp$shared + vp$residual - 1)) < 1e-6,
     "E11 四块之和 = 1（逐响应）",
     sprintf("最大偏差 %.3g", max(abs(vp$x_unique + vp$m_unique + vp$shared + vp$residual - 1))))
  # 独立闭式路径（qr.residual，不走引擎里的 lm.fit）重算逐响应 R²(XM)：
  # 防的是“r2_of 自己方向错”这类只能在外部发现的错
  zc <- function(M) scale(M, center = TRUE, scale = apply(M, 2, sd))
  Yz <- zc(d0$Y); Dz <- cbind(zc(d0$X), zc(d0$M))
  ind_r2 <- 1 - apply(qr.resid(qr(Dz), Yz)^2, 2, sum) / colSums(Yz^2)
  ok(max(abs(ind_r2 - r$r2$XM)) < 1e-8, "E12 逐响应 R²(XM) = 独立闭式 qr 算法",
     paste(sprintf("%.6f", c(ind_r2, r$r2$XM)), collapse = " / "))
  suppressMessages(library(vegan))
  rd <- vegan::rda(Yz ~ ., data = as.data.frame(Dz))
  ok(abs(mean(r$r2$XM) - rd$CCA$tot.chi / rd$tot.chi) < 1e-6,
     "E13 多元整体 R²(XM) 与 vegan::rda 约束惯量比一致（真外部锚点）",
     sprintf("%.8f vs %.8f", mean(r$r2$XM), rd$CCA$tot.chi / rd$tot.chi))

  cat("\n\u2500\u2500 8. 可复现与退化形状 \u2500\u2500\n")
  b2 <- run_era(list(X = d0$X, M = d0$M, Y = d0$Y, chains = 4L, iterations = 4000L,
                     thin = 5L, seed = 12345L), "rep")
  # 注意：tools::md5sum() 返回的是**带文件名**的向量，两个输出文件名字不同，
  # 直接 identical() 永远假 —— 上一版 E14 就是这个自己判错了，引擎其实完全确定
  # （单独复跑两次逐字段对比：零差异）。比的是摘要值，不是带名字的向量。
  ok(b2$code == 0L && identical(unname(tools::md5sum(b$file)), unname(tools::md5sum(b2$file))),
     "E14 同 seed 两次输出文件逐字节相同",
     if (b2$code != 0L) b2$err else
       paste(unname(tools::md5sum(b$file)), unname(tools::md5sum(b2$file)), sep = " vs "))

  # p=k=q=1：R 在这里会把单维度下标结果掉成向量，%*% 就变成内积而不是矩阵乘
  G1 <- matrix(0.8, 1, 1); B1 <- matrix(0.3, 1, 1); W1 <- matrix(-0.7, 1, 1)
  d1 <- sim_xy(120, G1, B1, W1, seed = 5)
  s11 <- run_era(list(X = d1$X, M = d1$M, Y = d1$Y, chains = 2L, iterations = 2000L,
                      thin = 3L, seed = 7L), "k1q1")
  ok(s11$code == 0L && s11$r$p == 1L && s11$r$k == 1L && s11$r$q == 1L &&
       s11$r$identity_check$total_minus_parts < 1e-8,
     "E15 p=k=q=1 退化形状不崩且恒等式仍成立",
     if (s11$code != 0L) s11$err else sprintf("tot-diff %.3g", s11$r$identity_check$total_minus_parts))

  cat("\n\u2500\u2500 9. 必须拦住的情形（报错而不是一堆好看的区间）\u2500\u2500\n")
  bad <- function(payload, pat, msg) {
    z <- run_era(payload, paste0("bad_", abs(sum(utf8ToInt(substr(msg, 1, 8))))))
    ok(z$code != 0L && grepl(pat, z$err, fixed = TRUE), msg,
       if (z$code == 0L) "居然大获成功，把错误当成结果交了" else substr(z$err, 1, 180))
  }
  Xn <- d0$X; Xn[3, 2] <- NA
  bad(list(X = Xn, M = d0$M, Y = d0$Y), "\u7f3a\u5931\u503c", "E16 含 NA 报错且说清有多少个")
  bad(list(X = d0$X[1:4, ], M = d0$M[1:4, ], Y = d0$Y[1:4, ]), "\u6837\u672c\u6570",
      "E17 样本数不够估系数直接拒（能给数不等于能给结论）")
  bad(list(X = d0$X, M = d0$M, Y = d0$Y[1:20, ]), "\u6837\u672c\u6570\u4e0d\u4e00\u81f4",
      "E18 三表行数不同必须报错（按行配对的分析静默错位最阴）")
  bad(list(X = d0$X, Y = d0$Y), "M \u7f3a\u5931", "E19 没有中介表时报错，不许退化成普通回归交差")
  Xc2 <- d0$X; Xc2[, 1] <- 2
  zc2 <- run_era(list(X = Xc2, M = d0$M, Y = d0$Y, chains = 2L, iterations = 2000L,
                      thin = 4L, seed = 9L), "const")
  ok(zc2$code == 0L && zc2$r$p == 1L &&
       any(grepl("\u5e38\u91cf\u5217", unlist(zc2$r$diagnostics), fixed = TRUE)),
     "E20 常量列被剔除、p 变小、而且要说出来（静默丢列等于偷偷改模型）",
     if (zc2$code != 0L) zc2$err else paste(unlist(zc2$r$diagnostics), collapse = " | "))

  cat("\n\u2500\u2500 9b. \u79e9\u4e8f\uff1a\u4e0d\u53ef\u8bc6\u522b\u7684\u8f93\u5165\u5fc5\u987b\u5f53\u573a\u62d2\u7edd\uff08\u4e0d\u662f\u52a0\u4e00\u6761\u8bca\u65ad\u7136\u540e\u7ee7\u7eed\u8dd1\uff09\u2500\u2500\n")
  # \u73b0\u6848\uff1an=6 \u7684\u624b\u6413\u6570\u636e\u91cc X2 = 2\u00b7X1\uff0clm.fit \u7ed9\u88ab\u6324\u6389\u7684\u7cfb\u6570\u586b NA\uff0cNA \u4e00\u8def\u6d41\u5230
  # `if (dev_dir > tol || ...)` \u624d\u70b8\uff0c\u7528\u6237\u770b\u5230\u7684\u662f\u300c\u9700\u8981TRUE/FALSE\u503c\u7684\u5730\u65b9\u4e0d\u53ef\u4ee5\u7528\u7f3a\u5c11\u503c\u300d
  # \u2014\u2014 \u4e00\u53e5\u6ca1\u4eba\u770b\u5f97\u61c2\u7684 R \u5185\u90e8\u9519\u8bef\u3002\u73b0\u5728\u6309\u4e0d\u53ef\u8bc6\u522b\u7684\u79cd\u7c7b\u5206\u522b\u62d2\u7edd\u3002
  mk_rank <- function(X, M, Y, tag) run_era(list(X = X, M = M, Y = Y, chains = 2L,
                                                 iterations = 600L, thin = 4L, seed = 7L), tag)
  # 把「逐样本返回一行」的函数拼成 n × k 矩阵。
  # 别用 vapply(FUN.VALUE = numeric(1))：k=2 时它直接报“values must be length 1”
  # （本轮就是这么撞的）；也别写一行 sapply 套 matrix 的巧写法，看不出来它在转置谁。
  colseq <- function(n, f) {
    rows <- lapply(seq_len(n), f)
    k <- length(rows[[1]])
    matrix(as.vector(unlist(rows)), nrow = n, ncol = k, byrow = TRUE)
  }

  z1 <- mk_rank(colseq(40, function(i) c(i %% 7, 2 * (i %% 7))),
                matrix(sin(seq_len(40)), 40, 1), matrix(cos(seq_len(40)), 40, 2), "rk_x")
  ok(z1$code != 0L && grepl("X \u7684\u5217\u4e4b\u95f4\u5b58\u5728\u5b8c\u5168\u5171\u7ebf", z1$err, fixed = TRUE),
     "E21 X \u4e24\u5217\u6210\u6bd4\u4f8b -> \u62d2\u7edd\u5e76\u70b9\u540d X", substr(z1$err, 1, 150))
  z1b <- mk_rank(colseq(40, function(i) c(i, i + 0.37)),
                 matrix(sin(seq_len(40)), 40, 1), matrix(cos(seq_len(40)), 40, 2), "rk_x2")
  ok(z1b$code != 0L && grepl("\u5b8c\u5168\u5171\u7ebf", z1b$err, fixed = TRUE),
     "E22 X \u4e24\u5217\u53ea\u5dee\u4e00\u4e2a\u5e38\u6570 -> \u540c\u6837\u62d2\u7edd\uff08\u6807\u51c6\u5316\u51cf\u5747\u503c\u540e\u5c31\u662f\u540c\u4e00\u5217\uff0c\u6700\u5bb9\u6613\u6f0f\uff09",
     substr(z1b$err, 1, 150))
  base_x <- matrix(stats::rnorm(40 * 3), 40, 3)
  z2 <- mk_rank(base_x, cbind(base_x[, 1, drop = FALSE] * 2 + 5, sin(seq_len(40))),
                matrix(stats::rnorm(40 * 2), 40, 2), "rk_mx")
  ok(z2$code != 0L && grepl("X \u4e0e M \u5408\u8d77\u6765\u79e9\u4e8f", z2$err, fixed = TRUE),
     "E23 \u4e2d\u4ecb\u80fd\u88ab X \u5b8c\u5168\u89e3\u91ca -> \u62d2\u7edd\u5e76\u8bf4\u6e05\u76f4\u63a5/\u95f4\u63a5\u4e0d\u53ef\u5206\u79bb\uff08\u8bc6\u522b\u95ee\u9898\uff0c\u4e0d\u662f\u91c7\u6837\u95ee\u9898\uff09",
     substr(z2$err, 1, 150))
  z3 <- mk_rank(matrix(stats::rnorm(40 * 2), 40, 2),
                cbind(matrix(sin(seq_len(40)), 40, 1), matrix(sin(seq_len(40)), 40, 1)),
                matrix(stats::rnorm(40 * 2), 40, 2), "rk_m2")
  ok(z3$code != 0L && grepl("M \u7684\u5217\u4e4b\u95f4\u5b58\u5728\u5b8c\u5168\u5171\u7ebf", z3$err, fixed = TRUE),
     "E24 \u4e24\u4e2a\u4e2d\u4ecb\u5176\u5b9e\u540c\u4e00\u4e2a -> \u62d2\u7edd\u5e76\u70b9\u540d M", substr(z3$err, 1, 150))

  cat("\n\u2500\u2500 9c. \u751f\u4ea7\u8c03\u7528\u5f62\u6001\uff1a\u7edd\u5bf9\u811a\u672c\u8def\u5f84 + \u5916\u90e8 cwd \u2500\u2500\n")
  # Electron \u90a3\u4fa7 spawn \u65f6\u4e0d\u8bbe cwd\uff0c\u4f20\u7684\u662f\u7edd\u5bf9\u811a\u672c\u8def\u5f84\uff1b\u672c\u4f1a\u8bdd\u6240\u6709\u6d4b\u8bd5\u90fd\u7528\u4ed3\u5e93\u5185
  # \u76f8\u5bf9\u8def\u5f84\uff0c\u8fd9\u6761\u8def\u5f84\u4e00\u76f4\u6ca1\u88ab\u8d70\u8fc7 \u2014\u2014 \u4e00\u8d70\u5c31\u649e\u51fa\u4e86 E21 \u90a3\u4e2a NA \u5d29\u6e83\u3002
  old_wd <- getwd()
  eng_abs <- normalizePath(engine, mustWork = TRUE)
  setwd(TMP)
  ip <- file.path(TMP, "prod.json"); op <- paste0(ip, ".out"); ep <- paste0(ip, ".err")
  writeLines(jsonlite::toJSON(list(X = d0$X, M = d0$M, Y = d0$Y, chains = 2L,
                                   iterations = 1500L, thin = 5L, seed = 9L),
                              auto_unbox = TRUE, digits = NA), ip)
  st <- system2(RSCRIPT, c(shQuote(eng_abs), shQuote(ip), shQuote(op), shQuote(ep)),
                stdout = FALSE, stderr = FALSE)
  setwd(old_wd)
  ok(st == 0L && file.size(op) > 1000,
     "E25 \u7edd\u5bf9\u8def\u5f84 + cwd \u5728 tempdir\uff1a\u4ecd\u80fd source \u5230 mcmc_diagnostics.R \u5e76\u51fa\u7ed3\u679c",
     if (st != 0L) {
       if (file.exists(ep)) paste(readLines(ep, warn = FALSE), collapse = " ")
       else paste0("exit=", st, " 但没写出 error 文件 —— 说明崩在 tryCatch 之前，前端只能显示「执行失败」")
     } else paste0("size=", file.size(op)))

  cat("\n\u2500\u2500 10. 结论话术要跟数据一致，不能只会报数 \u2500\u2500\n")
  dz0 <- sim_xy(200, G0, B0, matrix(0, 1, 2), seed = 21)
  r0 <- run_era(list(X = dz0$X, M = dz0$M, Y = dz0$Y, chains = 4L, iterations = 4000L,
                     thin = 5L, seed = 3L), "nome")
  ok(r0$code == 0L && grepl("\u4e0d\u652f\u6301\u4e2d\u4ecb", r0$r$interpretation, fixed = TRUE),
     "E26 真没有中介（W=0）-> 解读必须说“不支持中介”，而不是沉默地给一堆区间",
     if (r0$code != 0L) r0$err else substr(r0$r$interpretation, 1, 160))

  Bs2 <- matrix(c(0.9, 0.0, -0.9, 0.0), 2, 2)
  Ws2 <- matrix(c(-0.9, 0.9), 1, 2)
  ds <- sim_xy(240, G0, Bs2, Ws2, seed = 33)
  rs <- run_era(list(X = ds$X, M = ds$M, Y = ds$Y, chains = 4L, iterations = 4000L,
                     thin = 5L, seed = 4L), "supp")
  sgn_ok <- rs$code == 0L &&
    any(sign(rs$r$effects$direct$mean) != sign(rs$r$effects$indirect$mean) &
        abs(rs$r$effects$direct$mean) > 0.15 & abs(rs$r$effects$indirect$mean) > 0.15)
  ok(sgn_ok, "E27 栽了符号相反的直接/间接（遮掩效应）-> 能报出方向不一致",
     if (rs$code != 0L) rs$err else
       paste(sprintf("%.2f/%.2f", rs$r$effects$direct$mean, rs$r$effects$indirect$mean),
             collapse = " "))
  ok(is.finite(rs$r$waic$waic) && rs$r$waic$p_waic >= 0 &&
       grepl("Y \u4fa7", rs$r$waic$scope, fixed = TRUE),
     "E28 WAIC 可算且口径写明只算 Y 侧（旧脚本的 BAIC 无定义，已换掉）",
     if (rs$code != 0L) "没跑成" else rs$r$waic$scope)

  set.seed(4)
  Gh <- matrix(c(0.9, -0.5, 0.3, 0.4, 0.0, -0.6, 0.2, 0.5, -0.3), 3, 3, byrow = TRUE)
  Wq <- matrix(stats::rnorm(3 * 12, sd = 0.6), 3, 12)
  Bh <- matrix(stats::rnorm(3 * 12, sd = 0.3), 3, 12)
  dh <- sim_xy(160, Gh, Bh, Wq, sdM = 0.9, sdE = 1.0, seed = 77)
  t_h <- proc.time()[[3]]
  rh <- run_era(list(X = dh$X, M = dh$M, Y = dh$Y, chains = 4L, iterations = 4000L,
                     thin = 5L, seed = 8L), "highdim")
  el <- round(proc.time()[[3]] - t_h, 1)
  kb <- round(file.info(file.path(TMP, "highdim.json.out"))$size / 1024)
  ok(rh$code == 0L && rh$r$convergence$rhat_max <= 1.05,
     "E29 高维 p=3,k=3,q=12 跑通且默认 4000 迭代下 R̂ 达标",
     if (rh$code != 0L) rh$err else sprintf("R̂max %.4f / ESSmin %.0f", rh$r$convergence$rhat_max,
                                            rh$r$convergence$ess_min))
  cat(sprintf("     高维实测：用时 %.1fs，R̂max %.4f，ESSmin %.0f，输出 %d KB —— 默认迭代数就是照这个定的\n",
              el, if (rh$code == 0L) rh$r$convergence$rhat_max else NA,
              if (rh$code == 0L) rh$r$convergence$ess_min else NA, kb))
}

head1 <- readLines(engine, n = 1, warn = FALSE)
cat(sprintf("\n\u5f15\u64ce\u72b6\u6001\uff1a%s\n",
            ifelse(grepl("STATUS: implemented", head1, fixed = TRUE),
                   "implemented（恒等式/锚点/报错段已跑）",
                   "placeholder —— 首页卡片继续标开发中")))
}

# ── 30. 分中介通路：拆开看得见，且不许误报 ────────────────────────
# 引擎每个格子原本只报合计间接效应。两条方向相反的强通路会在合计里互相抹平，
# 于是「间接效应不含 0」不成立被读成「没有中介」—— 那是反的。
#
# 读法必须 simplifyVector = FALSE。fromJSON 默认会把「对象数组」简化成 data.frame：
# per_mediator 两个块变成 2 行 9 列，length() 拿到 9（列数）而不是 2 ——
# 断言就对着一个被重塑过的结构比划。这个坑只在 R 侧自查时出现（JS 拿到的是对象数组），
# 第一次撞上就是刚才那次「通路组 9 / 中介 2」。
{
  from_json_raw <- function(f) jsonlite::fromJSON(
    paste(readLines(f, warn = FALSE), collapse = ""), simplifyVector = FALSE)
  nums <- function(x) as.numeric(unlist(x))

  # 语义复核：凡是引擎标成「抵消」的格子，必须真的满足"合计被抹到最大通路的一半以下、
  # 而且第二大通路不算微弱"。
  # 为什么这样写，而不是"某个夹具应该报 0 格"：偏回归会把相关中介的权重放大，
  # 设计系数是 (+1.0, -0.5) 的夹具，报出来的比值可以是 0.35 —— 那两格被标记是判据在
  # 正常工作，我硬断言"不许报"就把对的判成错的（第一版就是这样，红了两格）。
  # 复核"报出来的东西名不副实"才稳：它与夹具噪声无关，而把 |合计| <= 0.4·最大 放宽到
  # 1.2 一定会让它红 —— 否则那个常数就没有任何东西守着。
  flag_audit <- function(j, tag) {
    bm <- j$indirect_by_mediator
    cells <- bm$cells
    marked <- unlist(bm$cancelled_cells)
    pm <- lapply(bm$per_mediator, function(b) nums(b$mean))
    bad <- 0L; worst_ratio <- 0; worst_second <- 1
    for (ci in seq_along(cells)) {
      if (!(cells[[ci]] %in% marked)) next
      v <- sapply(pm, function(x) x[ci])
      o <- sort(abs(v), decreasing = TRUE)
      ratio <- abs(sum(v)) / o[1]
      worst_ratio <- max(worst_ratio, ratio); worst_second <- min(worst_second, o[2])
      if (ratio > 0.45 || o[2] < 0.15) bad <- bad + 1L
    }
    ok(bad == 0L,
       sprintf("%s：标为抵消的 %d 格名实相符（最大比值 %.2f <= 0.45，最小次通路 %.3f >= 0.15）",
               tag, length(marked), worst_ratio, worst_second),
       sprintf("%d 格名不副实（最大比值 %.2f / 最小次通路 %.3f）", bad, worst_ratio, worst_second))
  }

  mk_paths <- function(samesign) {
    n <- 80
    X <- matrix(stats::rnorm(n * 2), n, 2)
    G <- matrix(c(1.2, 0.9, 0.8, 1.1), 2, 2, byrow = TRUE)          # p x k
    M <- X %*% G + matrix(stats::rnorm(n * 2, 0, 0.35), n, 2)        # 噪声不能为 0，否则秩亏拒单
    W <- if (samesign) matrix(c(1.0, 0.9, 1.0, 0.9), 2, 2, byrow = TRUE)
         else matrix(c(1.0, -0.9, -1.0, 0.9), 2, 2, byrow = TRUE)    # 反号 => 相互抵消
    B <- matrix(c(0.5, -0.3, 0.2, 0.4), 2, 2, byrow = TRUE)
    Y <- X %*% B + M %*% W + matrix(stats::rnorm(n * 2, 0, 0.7), n, 2)
    list(X = unname(X), M = unname(M), Y = unname(Y))
  }

  set.seed(77L); canc <- mk_paths(FALSE)
  rc <- run_era(canc, tag = "paths_cancel")
  if (rc$code != 0L) {
    ok(FALSE, "分中介通路：反向抵消夹具能跑通", rc$err)
  } else {
    r <- from_json_raw(rc$file); bm <- r$indirect_by_mediator
    ncell <- length(bm$cells); p_ <- as.integer(r$p); q_ <- as.integer(r$q)
    ok(length(bm$per_mediator) == 2L && length(bm$mediator_labels) == 2L,
       "两个中介就给出两条通路（不是把合计拆成好看的份数）",
       sprintf("通路组 %d / 中介 %d", length(bm$per_mediator), length(bm$mediator_labels)))
    ssum <- nums(bm$per_mediator[[1]]$mean)
    if (length(bm$per_mediator) > 1L) for (kk in 2:length(bm$per_mediator)) ssum <- ssum + nums(bm$per_mediator[[kk]]$mean)
    ind_mean <- nums(r$effects$indirect$mean)
    ok(ncell == p_ * q_ && max(abs(ssum - ind_mean)) < 1e-9,
       "恒等式：Σ 分通路后验均值 == 合计间接效应（逐格）",
       sprintf("格 %d / 最大偏差 %.3g", ncell, max(abs(ssum - ind_mean))))
    so <- nums(bm$per_mediator[[1]]$ols)
    if (length(bm$per_mediator) > 1L) for (kk in 2:length(bm$per_mediator)) so <- so + nums(bm$per_mediator[[kk]]$ols)
    ok(max(abs(so - nums(r$effects$indirect$ols))) < 1e-9,
       "恒等式同样成立于频率派一侧（Σ OLS 通路 == OLS 间接）",
       sprintf("最大偏差 %.3g", max(abs(so - nums(r$effects$indirect$ols)))))
    # 阈值按实测（2/4）留一格余量，而不是按"设计上应该 4 格全部抵消"的愿望。
    # 为什么不是 4：X1 两条通路的量级差得比 X2 多一些（噪声实现不同，标准化后比例不同），
    # 判据是比例式的，所以格子数本来就随数据走 —— 要的是"能识别出抵消"，不是数满。
    ok(as.integer(bm$cancelled_count) >= 2L,
       sprintf("反向通路被识别为抵消（%d/%d 格）", as.integer(bm$cancelled_count), ncell),
       sprintf("count=%s cells=%s", bm$cancelled_count, paste(unlist(bm$cancelled_cells), collapse = "/")))
    ok(all(unlist(bm$cancelled_cells) %in% bm$cells),
       "抵消必须点名到具体格子（只给个数用户无法复核）",
       paste(unlist(bm$cancelled_cells), collapse = "/"))
    ok(any(grepl("抵消", unlist(r$diagnostics))), "诊断里说了「抵消」并把两个方向摆出来",
       paste(unlist(r$diagnostics), collapse = " / "))
    flag_audit(r, "反向抵消夹具")
    path_max <- max(abs(unlist(lapply(bm$per_mediator, function(b) nums(b$mean)))))
    tot_max <- max(abs(ind_mean))
    ok(tot_max < 0.5 * path_max,
       sprintf("合计被压到单条通路的一半以下（%.3f vs %.3f）", tot_max, path_max),
       sprintf("合计最大 %.4f / 单条最大 %.4f", tot_max, path_max))
    ok(all(unlist(lapply(bm$per_mediator, function(b)
      length(b$hdi_lo) == ncell && length(b$hdi_hi) == ncell))),
       "每条通路都给上下界（只给均值就画不出「拆开看得见」）",
       paste(sapply(bm$per_mediator, function(b) length(b$hdi_lo)), collapse = "/"))
  }

  set.seed(77L); same <- mk_paths(TRUE)
  rs <- run_era(same, tag = "paths_same")
  if (rs$code != 0L) {
    ok(FALSE, "分中介通路：同向夹具能跑通", rs$err)
  } else {
    jrs <- from_json_raw(rs$file); bms <- jrs$indirect_by_mediator
    # 同向对照组。注意它守的是"必须有反号"这一层，**不守量级阈值**：
    # 我试过把量级下限从 0.15 放到 0.02，这条一条都不红（同向夹具里根本没有负号）。
    # 量级那一层由下面"符号随机但通路微弱"那条对照守，它被同一个变异打掉了。
    ok(as.integer(bms$cancelled_count) == 0L,
       "同向强通路不许报抵消（对照组，只守符号那一层）",
       sprintf("报了 %s 格：%s", bms$cancelled_count, paste(unlist(bms$cancelled_cells), collapse = "/")))
    flag_audit(jrs, "同向夹具")   # 0 格时自动通过，但它在放宽阈值的变异下必须红
    ims <- nums(jrs$effects$indirect$mean)
    ok(min(abs(ims)) > 0.2, "同向时合计应当远离 0（拆开与不拆开结论一致）",
       paste(sprintf("%.2f", ims), collapse = " "))
  }

  # 第三个对照：**符号随机但通路都很微弱**。这条才真正守量级阈值。
  # 为什么需要它：我先把"同向不报警"当成阈值收紧的依据，然后把下限从 0.15 放到 0.02
  # 去做变异 —— 一条都不红。因为同向夹具里根本没有负号，它只守得住"必须有反号"。
  # 而线上真正的误报来源是 highdim 那种"随机符号互相碰"（曾经报 5/24 格）。
  set.seed(79L)
  n3 <- 60
  X3 <- matrix(stats::rnorm(n3 * 3), n3, 3)
  G3 <- matrix(stats::rnorm(9) * 0.6, 3, 3)                     # p x k，中等强度
  M3 <- X3 %*% G3 + matrix(stats::rnorm(n3 * 3, 0, 1), n3, 3)
  W3 <- matrix(c(0.06, -0.05, 0.04, -0.06, 0.05, -0.04, 0.05, 0.04, -0.06), 3, 3, byrow = TRUE)
  B3 <- matrix(stats::rnorm(9) * 0.2, 3, 3)
  Y3 <- X3 %*% B3 + M3 %*% W3 + matrix(stats::rnorm(n3 * 3, 0, 1), n3, 3)
  rw <- run_era(list(X = unname(X3), M = unname(M3), Y = unname(Y3),
                     chains = 2L, iterations = 2000L, thin = 4L, seed = 11L,
                     prior_lambda = 1, prob = 0.95), tag = "paths_weak")
  if (rw$code != 0L) {
    ok(FALSE, "分中介通路：微弱随机符号夹具能跑通", rw$err)
  } else {
    jw <- from_json_raw(rw$file); bmw <- jw$indirect_by_mediator
    flag_audit(jw, "微弱随机符号夹具")
    wmax <- max(abs(unlist(lapply(bmw$per_mediator, function(b) nums(b$mean)))))
    ok(as.integer(bmw$cancelled_count) == 0L,
       sprintf("符号随机但通路微弱（最大 %.3f）不许报抵消 —— 这条守的是量级阈值", wmax),
       sprintf("报了 %s 格：%s", bmw$cancelled_count, paste(unlist(bmw$cancelled_cells), collapse = "/")))
  }

  # 第四个对照：**只抵消掉一半的不算抵消**。
  # 这条是专门给 |合计| <= 0.4·最大 那个常数造的：夹具里每条格子的两条通路是
  # (+1.0, -0.5)，合计 0.5 —— 比值 0.5 落在 0.4 之外、1.2 之内，而另外两条判据
  # （第二大 >= 0.15 且 >= 0.3·最大）都满足。于是"拦下它"这件事只可能由那 0.4 做到：
  # 把 0.4 放宽到 1.2 必须让这条红。没有它，那个常数就是没有守卫的装饰品。
  set.seed(81L)
  # n 要够大：上一版用 60，逐格的"合计/最大通路"比值本身就带抽样噪声，
  # 有两格飘到 0.4 以下被标记 —— 那是判据在正常工作，我的断言太硬。
  # 把 n 提到 200、迭代加倍，比值收敛到设计值 0.5，"不许报"才站得住。
  n4 <- 200
  X4 <- matrix(stats::rnorm(n4 * 2), n4, 2)
  G4 <- matrix(c(1.0, 0.5, 1.0, 0.5), 2, 2, byrow = TRUE)          # p x k：X -> M1 强，X -> M2 弱
  M4 <- X4 %*% G4 + matrix(stats::rnorm(n4 * 2, 0, 0.35), n4, 2)
  W4 <- matrix(c(1.0, 1.0, -1.0, -1.0), 2, 2, byrow = TRUE)         # M2 下游反号 => 部分抵消
  B4 <- matrix(c(0.4, -0.2, 0.3, 0.2), 2, 2, byrow = TRUE)
  Y4 <- X4 %*% B4 + M4 %*% W4 + matrix(stats::rnorm(n4 * 2, 0, 0.7), n4, 2)
  rp <- run_era(list(X = unname(X4), M = unname(M4), Y = unname(Y4),
                     chains = 2L, iterations = 4000L, thin = 8L, seed = 13L,
                     prior_lambda = 1, prob = 0.95), tag = "paths_partial")
  if (rp$code != 0L) {
    ok(FALSE, "分中介通路：部分抵消夹具能跑通", rp$err)
  } else {
    jp <- from_json_raw(rp$file); bmp <- jp$indirect_by_mediator
    flag_audit(jp, "部分抵消夹具")
    # 同时要求这条夹具确实**没有把全部格子**都标掉：如果 8 格全标，
    # 说明判据退化成了"有两条通路就报"
    ok(as.integer(bmp$cancelled_count) < length(bmp$cells),
       sprintf("部分抵消夹具里标记必须是少数（%s/%d 格），不能一视同仁",
               bmp$cancelled_count, length(bmp$cells)), "")
  }

  # k=1 是最容易把结构写崩的形状：通路层必须还在，而且与合计逐格相等
  set.seed(77L); one <- mk_paths(FALSE); one$M <- one$M[, 1, drop = FALSE]
  r1 <- run_era(one, tag = "paths_k1")
  if (r1$code != 0L) {
    ok(FALSE, "分中介通路：只有一个中介时能跑通", r1$err)
  } else {
    j1 <- from_json_raw(r1$file); bm1 <- j1$indirect_by_mediator
    ok(length(bm1$per_mediator) == 1L && as.integer(bm1$cancelled_count) == 0L &&
         max(abs(nums(bm1$per_mediator[[1]]$mean) - nums(j1$effects$indirect$mean))) < 1e-12,
       "k=1 时通路层保留、与合计完全一致、且不误报抵消",
       sprintf("组 %d / 抵消 %s", length(bm1$per_mediator), bm1$cancelled_count))
    raw <- paste(readLines(r1$file, warn = FALSE), collapse = " ")
    ok(grepl('"mediator_labels"[ \t]*:[ \t]*\\[', raw),
       "k=1 时 mediator_labels 在 JSON 里仍是数组",
       substr(raw, max(1L, regexpr('"mediator_labels"', raw)), 60))
    ok(grepl('"cancelled_cells"[ \t]*:[ \t]*\\[', raw),
       "没有抵消格子时 cancelled_cells 是空数组而不是 null",
       substr(raw, max(1L, regexpr('"cancelled_cells"', raw)), 60))
  }
}


cat("\n\u2500\u2500\u2500 Bayesian ERA 验收汇总 \u2500\u2500\u2500\n")
if (length(fails)) {
  cat(sprintf("[FAIL] %d 项通过 / %d 项失败\n", pass, length(fails)))
  for (f in fails) cat("  - ", f, "\n", sep = "")
  quit(status = 1)
}
cat(sprintf("[PASS] %d 项全过\n", pass))
