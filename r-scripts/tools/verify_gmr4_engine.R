# ============================================================================
# GMR4 引擎校验：只断言"闭式解必须是真"的东西，不比较小数点后的观感
# ----------------------------------------------------------------------------
# 用法：r-portable/bin/Rscript.exe r-scripts/tools/verify_gmr4_engine.R
# 退出码：0 = 全过；1 = 有失败项（装配脚本与 CI 据此红）
#
# 为什么值得这么写：gmr4.R 旧版是个从未成功执行过的占位（真跑 exit=1），
# 而"能跑"不等于"算对"。下面 10 条里有 3 条是恒等式级别的：
#   秩取满 + lambda=0 必须逐元素等于 OLS；秩取满必须等于岭解；RSS 随秩单调。
# 这三条一旦实现走样就必红，比任何截图都硬。
# ============================================================================

# 项目根：从当前目录往上找 r-scripts/gmr4.R。
# 不要写 sys.frame(1)$ofile 那一类“巧”写法 —— Rscript 直接跑脚本时根本没有调用帧，
# 上一版就是这么当场堆在“堆叠上没有这么多的环境框”。
root <- getwd()
for (i in 1:6) {
  if (file.exists(file.path(root, "r-scripts", "gmr4.R"))) break
  parent <- dirname(root)
  if (identical(parent, root)) break
  root <- parent
}
if (!file.exists(file.path(root, "r-scripts", "gmr4.R"))) {
  stop("找不到 r-scripts/gmr4.R：请在项目根目录跑本脚本")
}
setwd(root)

RSCRIPT <- file.path(R.home("bin"), "Rscript.exe")
GMR4    <- "r-scripts/gmr4.R"
TMP     <- file.path(tempdir(), "gmr4_verify"); dir.create(TMP, showWarnings = FALSE, recursive = TRUE)

pass <- 0L; fails <- character(0)
ok   <- function(cond, msg, detail = "") {
  if (isTRUE(cond)) { pass <<- pass + 1L; cat(sprintf("  \u2713 %s\n", msg)) }
  else { fails <<- c(fails, msg); cat(sprintf("  \u2717 %s\n      %s\n", msg, substr(detail, 1, 200))) }
}

run_gmr4 <- function(payload, tag) {
  i <- file.path(TMP, paste0(tag, ".json")); o <- paste0(i, ".out"); e <- paste0(i, ".err")
  # 必须 digits = NA：jsonlite 默认只写 4 位有效数字，于是夹具先把 X/Y 舍入，
  # 再拿全精度的 OLS 去比引擎 —— 恒等式检查看到的其实是自己的舍入（实测 1e-5，
  # 进程内不比 JSON 时是 1.4e-10）。这类"测试自己造的误差"最会骗人。
  writeLines(jsonlite::toJSON(payload, auto_unbox = TRUE, digits = NA), i)
  st <- system2(RSCRIPT, c(GMR4, shQuote(i), shQuote(o), shQuote(e)), stdout = FALSE, stderr = FALSE)
  if (st != 0) return(list(code = st, err = if (file.exists(e)) paste(readLines(e, warn = FALSE), collapse = " ") else ""))
  # simplifyVector=TRUE：矩阵要拿回 matrix 而不是一层套一层的 list
  list(code = 0, out = jsonlite::fromJSON(o, simplifyVector = TRUE))
}

set.seed(11L)
mk_truth <- function(n, p, q, S, snr = 0.15) {
  X <- matrix(rnorm(n * p), n)
  B <- matrix(rnorm(p * S), p) %*% matrix(rnorm(S * q), S)      # 精确秩 S
  Y <- X %*% B + matrix(rnorm(n * q, 0, snr), n)
  list(X = X, Y = Y, B = B)
}

cat("\n\u2500\u2500 1. 恒等式：满秩 + lambda≈0 必须等于逐响应 OLS \u2500\u2500\n")
{
  tr <- mk_truth(60, 4, 5, 2)
  r <- run_gmr4(list(X = tr$X, Y = tr$Y, ranks = c(4), lambdas = c(1e-8)), "identity")
  ok(r$code == 0, "引擎跑通", r$err %||% "")
  if (r$code == 0) {
    Bstd <- as.matrix(r$out$coefficients)
    # 用标准化后的 X/Y 跑 lm，系数应与闭式解一致（在标准化尺度上）
    Xs <- scale(tr$X); Ys <- scale(tr$Y)
    # lm.fit(X, y) 不含截距列：coef() 就是 p 个真系数，不能 [-1] 当截距丢掉
    ols <- sapply(1:5, function(j) coef(lm.fit(Xs, Ys[, j])))
    ok(max(abs(Bstd - ols)) < 1e-8, "满秩 lambda->0 的 B 逐元素等于 OLS",
       paste(dim(Bstd), collapse = "x "))
    ok(isTRUE(all.equal(as.numeric(r$out$R2_per_response),
                        sapply(1:5, function(j) summary(lm(Ys[, j] ~ Xs))$r.squared), tol = 1e-6)),
       "各响应 R2 等于对应 lm() 的 R2")
  }
}

cat("\n\u2500\u2500 2. 恒等式：满秩时必须等于岭解 (X'X+lambda I)^-1 X'Y \u2500\u2500\n")
{
  tr <- mk_truth(60, 4, 5, 2)
  lam <- 2.5
  r <- run_gmr4(list(X = tr$X, Y = tr$Y, ranks = c(4), lambdas = c(lam)), "ridgelink")
  if (r$code == 0) {
    Xs <- scale(tr$X); Ys <- scale(tr$Y)
    Bring <- as.matrix(solve(crossprod(Xs) + lam * diag(4), crossprod(Xs, Ys)))
    ok(max(abs(as.matrix(r$out$coefficients) - Bring)) < 1e-8, "满秩 S=min(p,q) 的 B 等于岭回归解",
       paste("max|diff| =", format(max(abs(as.matrix(r$out$coefficients) - Bring)), digits = 3)))
  } else ok(FALSE, "满秩岭对照跑通", r$err)
}

cat("\n\u2500\u2500 3. 单调性：秩越低，训练 RSS 越大 \u2500\u2500\n")
{
  tr <- mk_truth(60, 5, 6, 3)
  rs <- lapply(1:5, function(S) run_gmr4(list(X = tr$X, Y = tr$Y, ranks = c(S), lambdas = c(0.1)), paste0("mono", S)))
  rss <- sapply(rs, function(x) if (x$code == 0) x$out$rss_reduced else NA_real_)
  ok(all(is.finite(rss)) && all(diff(rss) <= 1e-8), "RSS(S) 随 S 上升而不增",
     paste(round(rss, 3), collapse = " -> "))
}

cat("\n\u2500\u2500 4. 统计下限：真实秩 3，选型必须找回 3 \u2500\u2500\n")
{
  seeds <- c(101, 202, 303)
  got <- sapply(seeds, function(sd) {
    set.seed(sd); tr <- mk_truth(80, 6, 9, 3, snr = 0.1)
    r <- run_gmr4(list(X = tr$X, Y = tr$Y, seed = sd), paste0("recover", sd))
    if (r$code == 0) r$out$rank_selected else NA_integer_
  })
  ok(all(got == 3), "3 个不同种子下广义 1-SE 规则都选中 S=3", paste(got, collapse = ", "))
}

cat("\u2500\u2500 5. 小样本必须拒绝，不能给荒谬系数 \u2500\u2500\n")
{
  tr <- mk_truth(2, 3, 3, 2)
  r <- run_gmr4(list(X = tr$X, Y = tr$Y), "tiny")
  ok(r$code != 0 && grepl("至少需要 4 个样本", r$err), "n=2 被拒绝且说清原因", r$err)
}

cat("\u2500\u2500 6. 退化输入的诊断（常量列 / p>=n / 方阵形状）\u2500\u2500\n")
{
  tr <- mk_truth(40, 4, 5, 2)
  Xc <- tr$X; Xc[, 3] <- 7                       # 常量列
  r <- run_gmr4(list(X = Xc, Y = tr$Y), "constcol")
  ok(r$code == 0 && length(r$out$diagnostics) >= 1 &&
       any(grepl("常量列", unlist(r$out$diagnostics))), "常量列被剔除并报告",
     paste(unlist(r$out$diagnostics), collapse = " | "))
  r2 <- run_gmr4(list(X = matrix(rnorm(6 * 6), 6), Y = tr$Y[, 1:5]), "squareX")
  ok(r2$code != 0 && grepl("方阵", r2$err), "6x6 方阵形状的 X 被拒（像距离矩阵）", r2$err)
  r3 <- run_gmr4(list(X = as.vector(tr$X), Y = tr$Y), "flatvec")
  ok(r3$code != 0 && grepl("一维数组", r3$err), "一维数组被拒并说明要二维", r3$err)
}

cat("\u2500\u2500 7. 协变量必须被偏正交化掉（Frisch-Waugh）\u2500\u2500\n")
{
  set.seed(9L); n <- 120
  Z <- matrix(rnorm(n), n)
  X <- matrix(rnorm(n * 3), n) + matrix(Z, n, 3)  # X 与 Z 强共线（逐列广播）
  B <- matrix(rnorm(3 * 2), 3) %*% matrix(rnorm(2 * 4), 2)
  Y <- X %*% B + matrix(4 * Z, n, 4) + matrix(rnorm(n * 4, 0, .05), n)   # Z 对 Y 有强直接效应
  a <- run_gmr4(list(X = X, Y = Y, ranks = c(2), lambdas = c(0.01)), "z_on")
  b <- run_gmr4(list(X = X, Y = Y, Z = Z, ranks = c(2), lambdas = c(0.01)), "z_off")
  if (a$code == 0 && b$code == 0) {
    r2_nocov <- a$out$R2; r2_cov <- b$out$R2
    ok(abs(r2_cov) < abs(r2_nocov) || b$out$covariates_partialled_out == 1,
       "带 Z 时确实偏掉了 1 个协变量", sprintf("R2 无Z=%.4f 有Z=%.4f", r2_nocov, r2_cov))
    ok(max(abs(as.matrix(a$out$coefficients) - as.matrix(b$out$coefficients))) > 1e-6,
       "偏正交化确实改变了 B（不是原样返回）",
       paste("max|diff| =", format(max(abs(as.matrix(a$out$coefficients) - as.matrix(b$out$coefficients))), digits = 3)))
  } else ok(FALSE, "Z 两条都跑通", paste(a$err, b$err))
}

cat("\u2500\u2500 8. 可复现：同输入两次必须逐字节相同 \u2500\u2500\n")
{
  tr <- mk_truth(50, 4, 5, 2)
  a <- run_gmr4(list(X = tr$X, Y = tr$Y), "rep1")
  b <- run_gmr4(list(X = tr$X, Y = tr$Y), "rep2")
  fa <- paste(readLines(paste0(file.path(TMP, "rep1.json"), ".out"), warn = FALSE), collapse = "")
  fb <- paste(readLines(paste0(file.path(TMP, "rep2.json"), ".out"), warn = FALSE), collapse = "")
  ok(a$code == 0 && identical(fa, fb), "两次运行的输出 JSON 完全一致", "存在随机性未固定")
}

cat("\u2500\u2500 9. 契约字段齐全（视图与 L3 要读的东西）\u2500\u2500\n")
{
  tr <- mk_truth(50, 4, 5, 2)
  r <- run_gmr4(list(X = tr$X, Y = tr$Y), "contract")
  need <- c("success", "method", "n_samples", "p", "q", "rank_selected", "lambda_selected",
            "rank_grid", "lambda_grid", "s_max", "kfold", "seed", "selection_rule",
            "coefficients", "coefficients_raw_scale", "U", "V", "R2", "R2_per_response",
            "cv", "rss_reduced", "rss_full", "covariates_partialled_out",
            "X_center", "X_scale", "Y_center", "predicted", "diagnostics", "interpretation")
  if (r$code == 0) {
    miss <- setdiff(need, names(r$out))
    ok(length(miss) == 0, "输出契约字段齐全", paste(miss, collapse = ", "))
    # 嵌套字段不能用 names(r$out) 去比（那是顶层键），单独查一层
    cvmiss <- setdiff(c("mean", "se", "best", "se_min"), names(r$out$cv))
    ok(length(cvmiss) == 0, "cv 里 mean/se/best/se_min 齐（前端阈值线靠 se_min）",
       paste(cvmiss, collapse = ", "))
    ok(nrow(as.matrix(r$out$predicted)) == 50 && ncol(as.matrix(r$out$predicted)) == 5, "predicted 形状 = n x q",
       paste(dim(as.matrix(r$out$predicted)), collapse = "x"))
    ok(nrow(as.matrix(r$out$coefficients)) == 4 && ncol(as.matrix(r$out$coefficients)) == 5,
       "coefficients 形状 = p x q")
  } else ok(FALSE, "契约检查跑通", r$err)
}

cat("\n\u2500\u2500\u2500 gmr4 引擎校验汇总 \u2500\u2500\u2500\n")
if (length(fails)) {
  cat(sprintf("[FAIL] %d 项通过 / %d 项失败\n", pass, length(fails)))
  for (f in fails) cat("  - ", f, "\n", sep = "")
  quit(status = 1)
}
cat(sprintf("[PASS] %d 项全过\n", pass))

