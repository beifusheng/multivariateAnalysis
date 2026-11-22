# STATUS: implemented   （implemented=已通过验收脚本；placeholder=占位，首页卡片必须标开发中）
# ============================================================================
# Bayesian ERA —— 贝叶斯扩展冗余分析（含中介效应）
# ----------------------------------------------------------------------------
# 模型（全部在**按列标准化**尺度上，系数可跨列比较）：
#   M 侧：  m_k = Xc γ_k + e_k ,  e_k ~ N(0, σ_k² I)
#   Y 侧：  y_q = Xc β_q + Mc ω_q + ε_q ,  ε_q ~ N(0, τ_q² I)
#   先验：  γ_k, (β_q,ω_q) ~ N(0, λ⁻¹ I)（与方差独立），λ 默认 1
#          σ_k², τ_q² ~ Inv-Gamma(1e-3, 1e-3)
#   派生：  直接 = β_q ；间接 = Σ_k γ_[·,k]·ω_[k,q] ；总 = 直接 + 间接
#
# 为什么这条恒等式精确成立（不是近似）：把 m_k = Xγ_k + e_k 代回 Y 的方程，
# X 前的系数就是 β_q + Σ_k γ_k ω_{k,q}。所以 tot = dir + ind 是**代数事实**，
# 引擎里当内部校验用（残差 > 1e-8 就是实现错了，直接写进 diagnostics）。
#
# 为什么手写共轭 Gibbs 而不是 rstan/JAGS：
#   1) 打包侧删过 jags.dll —— 运行时不许依赖外部二进制（README 已定这条）；
#   2) 这组条件后验本来就有闭式（正态-逆伽马），不需要采样器；
#   3) 闭式解能跟 OLS 做**恒等式级**校验，"看起来收敛"骗不过去。
#
# 与旧脚本的关系（别删这段）：旧 bayesian_era_mediation.R 依赖 rstan、且从未成功执行；
# 注释里写的 BAIC 没有任何定义 —— 本实现改用有明确公式的 WAIC，并把这一点写进设计文档。
#
# 诊断口径（split-R̂ / split-ESS / 分位数区间）**必须**用 r-scripts/mcmc_diagnostics.R
# 那一份实现：引擎自己算一遍、验收脚本再算一遍的话，"验收通过"就没有内容。
# ============================================================================

args_all <- commandArgs(trailingOnly = FALSE)
# 按**脚本自身位置**找兄弟文件：后端 spawn Rscript 时不设 cwd，
# 靠 getwd() 或 file.path("r-scripts", ...) 会在打包环境里当场找不到文件。
# 也不要写 sys.frame(1)$ofile —— Rscript 直接跑脚本时没有那个调用帧（本项目踩过）。
this_dir <- local({
  fa <- grep("^--file=", args_all, value = TRUE)
  if (length(fa) == 1L) {
    p <- normalizePath(sub("^--file=", "", fa), mustWork = FALSE)
    d <- dirname(p)
    if (file.exists(file.path(d, "mcmc_diagnostics.R"))) return(d)
  }
  for (d in c("r-scripts", "./r-scripts", "../r-scripts")) {
    if (file.exists(file.path(d, "mcmc_diagnostics.R"))) return(normalizePath(d, mustWork = FALSE))
  }
  stop("找不到 mcmc_diagnostics.R：Bayesian ERA 依赖它提供 R̂/ESS/区间的统一口径")
})
source(file.path(this_dir, "mcmc_diagnostics.R"))

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) {
  stop("Usage: Rscript bayesian_era_mediation.R <input.json> <output.json> <error.txt>")
}
input_file <- args[1]; output_file <- args[2]; error_file <- args[3]

`%||%` <- function(a, b) if (is.null(a)) b else a

# ---- 数值内核：求逆一律 chol/backsolve，不用 solve() 裸解 ----
# 病态设计矩阵上 solve() 会给出"看起来是个矩阵"的垃圾数；chol 失败当场报错，
# 报错比垃圾数字好（本项目硬规定）。
chol_inv <- function(A, tag) {
  CH <- tryCatch(chol(A), error = function(e) NULL)
  if (is.null(CH)) {
    stop(sprintf("%s：设计矩阵不正定（变量之间存在完全共线，或样本数不足）。", tag))
  }
  backsolve(CH, forwardsolve(t(CH), diag(nrow(A))))
}

# 行优先的二维数组 / 单列向量都接得住；顺手做形状与缺失值检查
as_num_matrix <- function(M, tag, must_exist = TRUE) {
  if (is.null(M)) {
    if (must_exist) stop(sprintf("%s 缺失：这个分析必须有 %s。", tag, tag))
    return(NULL)
  }
  if (is.atomic(M) && !is.matrix(M)) M <- matrix(M, ncol = 1)
  M <- as.matrix(M)
  storage.mode(M) <- "double"
  if (anyNA(M)) {
    bad <- which(is.na(M), arr.ind = TRUE)
    stop(sprintf("%s 有 %d 个缺失值（例如第 %d 行第 %d 列）。请先删掉这些样本或补齐，本分析不做插补。",
                 tag, nrow(bad), bad[1, 1], bad[1, 2]))
  }
  if (nrow(M) < 1L || ncol(M) < 1L) stop(sprintf("%s 是空表。", tag))
  M
}

# 按列标准化 + 常量列剔除。不用 `<<-` 往外部攛诊断：函数只报告，
# 由调用方统一拼到 diagnostics 上（攛变量的副作用写法在包里很难调试）。
zcols <- function(M, tag) {
  sds <- apply(M, 2, stats::sd)
  keep <- which(is.finite(sds) & sds > 1e-12)
  msg <- if (length(keep) < ncol(M))
    sprintf("%s 里有常量列（第 %s 列，方差为 0），已自动剔除；常量列不可能解释任何变异。",
            tag, paste(setdiff(seq_len(ncol(M)), keep), collapse = ",")) else NULL
  if (!length(keep)) stop(sprintf("%s 全是常量列，无法分析。", tag))
  list(Z = scale(M[, keep, drop = FALSE], center = TRUE, scale = sds[keep]),
       keep = keep, center = unname(colMeans(M[, keep, drop = FALSE])),
       scale = unname(sds[keep]), msg = msg)
}

tryCatch({
  params <- jsonlite::fromJSON(input_file)

  diagnostics <- character(0)
  Xraw <- as_num_matrix(params$X, "X")
  Yraw <- as_num_matrix(params$Y, "Y")
  Mraw <- as_num_matrix(params$M, "M")
  if (nrow(Xraw) != nrow(Yraw) || nrow(Xraw) != nrow(Mraw)) {
    stop(sprintf("三张表的样本数不一致：X=%d、M=%d、Y=%d。中介分析按行配对，必须先对齐样本。",
                 nrow(Xraw), nrow(Mraw), nrow(Yraw)))
  }
  n <- nrow(Xraw)

  chains   <- max(2L, as.integer(params$chains   %||% 4L))
  niter    <- max(200L, as.integer(params$iterations %||% 4000L))
  thin     <- max(1L, as.integer(params$thin %||% 5L))
  seed     <- as.integer(params$seed %||% 12345L)
  prior_l  <- as.numeric(params$prior_lambda %||% 1)
  prob     <- as.numeric(params[["prob"]] %||% 0.95)   # 注意：params`prob` 是非法语法
  RHAT_MAX <- 1.05; ESS_MIN <- 400          # 阈值写死在验收里，不让入参偷偷放宽

  if (!is.finite(prior_l) || prior_l <= 0) stop("prior_lambda 必须是正数（默认 1）。")

  dz <- list()
  Xz <- zcols(Xraw, "X"); Mz <- zcols(Mraw, "M"); Yz <- zcols(Yraw, "Y")
  diagnostics <- c(diagnostics, Xz$msg, Mz$msg, Yz$msg)
  Xc <- Xz$Z; Mc <- Mz$Z; Yc <- Yz$Z
  p <- ncol(Xc); k <- ncol(Mc); q <- ncol(Yc)

  # 自由度下限：Y 侧一次要估 p+k 个系数。低于这个线后验基本由先验决定，
  # 却照样能吐出一堆好看的区间 —— 必须拦，而不是"能算就算"。
  if (n <= p + k + 2L) {
    stop(sprintf("样本数 %d 太少：Y 侧要同时估 %d 个系数（X %d + M %d），至少需要 %d 个样本。",
                 n, p + k, p, k, p + k + 3L))
  }
  if (n <= 15L) {
    diagnostics <- c(diagnostics, sprintf(paste0("样本数只有 %d：区间宽度主要由先验撑着，",
                                                 "间接效应的方向都可能翻转，别把结论写成因果。"), n))
  }
  # X 与 M 完全共线时直接与间接不可分离 —— 这是识别问题，不是收敛问题，要说清
  rcond_side <- tryCatch({
    D <- cbind(Xc, Mc)
    min(svd(D, nu = 0L, nv = 0L)$d) / max(svd(D, nu = 0L, nv = 0L)$d)
  }, error = function(e) NA_real_)
  if (is.finite(rcond_side) && rcond_side < 1e-10) {
    diagnostics <- c(diagnostics, paste0("X 与 M 几乎完全共线（最小奇异值比 < 1e-10）：",
                                         "直接效应与间接效应在数学上不可分离，给出的区间会宽到没有意义。",
                                         "这不是采样不够，是识别问题 —— 需要改变设计（比如增加 M 的测量时点）。"))
  }

  # ---------------- 共轭 Gibbs：给定方差是正态，给定系数是逆伽马 ----------------
  # 注意精度矩阵里是 X'X/s2 + λI，等价于 (X'X + s2·λI)⁻¹ —— 写成 (X'X+λI)⁻¹
  # 就等于把先验偷偷缩放成 g-prior，是**另一个模型**（这一条在 spike 里差点混过去）。
  block_gibbs <- function(D, Y, seed0, tag) {
    m <- ncol(D); nn <- nrow(D); ry <- ncol(Y)
    XtX <- crossprod(D); Xty <- crossprod(D, Y); Im <- diag(m)
    keep_n <- niter %/% thin
    out <- array(NA_real_, c(keep_n, m, ry)); s2out <- matrix(NA_real_, keep_n, ry)
    beta <- matrix(0, m, ry); s2 <- rep(1, ry)
    cnt <- 0L
    for (it in seq_len(niter)) {
      for (j in seq_len(ry)) {
        V <- chol_inv(XtX + s2[j] * prior_l * Im, sprintf("【%s】第 %d 列", tag, j))
        beta[, j] <- MASS::mvrnorm(1, drop(V %*% Xty[, j]), s2[j] * V)
        r <- Y[, j] - D %*% beta[, j]
        s2[j] <- (1e-3 + 0.5 * sum(r^2) + 0.5 * prior_l * sum(beta[, j]^2)) /
                 stats::rgamma(1, 1e-3 + nn / 2)
      }
      if (it %% thin == 0L) { cnt <- cnt + 1L; out[cnt, , ] <- beta; s2out[cnt, ] <- s2 }
    }
    list(beta = out, sigma2 = s2out)
  }

  set.seed(seed)                          # 链种子由总 seed 决定：同输入必同输出
  chain_seeds <- sample.int(.Machine$integer.max, chains)
  Skeep <- niter %/% thin
  DIRa <- array(NA_real_, c(chains, Skeep, p, q))
  INDa <- array(NA_real_, c(chains, Skeep, p, q))
  tau2s <- matrix(NA_real_, chains * Skeep, q)
  betas <- array(NA_real_, c(chains * Skeep, p + k, q))
  gammas <- array(NA_real_, c(chains * Skeep, p, k))

  for (ci in seq_len(chains)) {
    gm <- block_gibbs(Xc, Mc, chain_seeds[ci], "M 侧")
    ym <- block_gibbs(cbind(Xc, Mc), Yc, chain_seeds[ci] + 7919L, "Y 侧")
    Gd <- gm$beta                     # Skeep x p x k
    Bd <- ym$beta                     # Skeep x (p+k) x q
    for (s in seq_len(Skeep)) {
      # k=1 或 q=1 时 R 会把只有 1 个维度的下标结果**掉成向量**，
      # 直接 %*% 就变成内积而不是矩阵乘 —— 必须先把两边固定成 p x k 与 k x q。
      g <- Gd[s, , , drop = TRUE]
      if (k == 1L) g <- matrix(g, nrow = p, ncol = 1)
      om <- Bd[s, (p + 1):(p + k), , drop = TRUE]
      if (k == 1L && q == 1L) om <- matrix(om, nrow = 1, ncol = 1)
      else if (q == 1L) om <- matrix(om, nrow = k, ncol = 1)
      else if (k == 1L) om <- matrix(om, nrow = 1, ncol = q)
      INDa[ci, s, , ] <- g %*% om
      dd <- Bd[s, 1:p, , drop = TRUE]
      if (q == 1L) dd <- matrix(dd, nrow = p, ncol = 1)
      DIRa[ci, s, , ] <- dd
    }
    idx <- (ci - 1L) * Skeep + seq_len(Skeep)
    betas[idx, , ] <- Bd
    gammas[idx, , ] <- Gd
    tau2s[idx, ] <- ym$sigma2
  }

  dir_flat  <- matrix(NA_real_, chains * Skeep, p * q)
  ind_flat  <- dir_flat
  for (ci in seq_len(chains)) {
    dir_flat[((ci - 1) * Skeep + 1):(ci * Skeep), ] <- matrix(DIRa[ci, , , ], Skeep, p * q)
    ind_flat[((ci - 1) * Skeep + 1):(ci * Skeep), ] <- matrix(INDa[ci, , , ], Skeep, p * q)
  }
  tot_flat <- dir_flat + ind_flat
  cell_lab <- as.vector(outer(paste0("X", seq_len(p)), paste0("Y", seq_len(q)),
                              function(a, b) paste0(a, "\u2192", b)))
  colnames(dir_flat) <- colnames(ind_flat) <- colnames(tot_flat) <- cell_lab

  # ---------------- 收敛诊断：口径来自 mcmc_diagnostics.R，不在这里另写一份 ----------------
  as_chains <- function(flat) lapply(seq_len(chains), function(ci)
    flat[((ci - 1) * Skeep + 1):(ci * Skeep), , drop = FALSE])
  rhat_cells <- split_rhat_matrix(as_chains(dir_flat), cell_lab)
  rhat_cells <- c(rhat_cells, split_rhat_matrix(as_chains(ind_flat), cell_lab))
  ess_cells  <- ess_split_matrix(as_chains(dir_flat), cell_lab)
  ess_cells  <- c(ess_cells, ess_split_matrix(as_chains(ind_flat), cell_lab))
  bad_r <- rhat_cells[!is.finite(rhat_cells) | rhat_cells > RHAT_MAX]
  bad_e <- ess_cells[!is.finite(ess_cells) | ess_cells < ESS_MIN]
  if (length(bad_r)) {
    diagnostics <- c(diagnostics, sprintf(paste0("%d 个量的 split-R̂ 超过 %.2f（最坏 %s=%.3f）：",
                                                 "链之间没达成一致，区间不可信。把 iterations 加到当前的 2–4 倍重跑，"),
                 length(bad_r), RHAT_MAX, names(which.max(bad_r)), max(bad_r),
                 "或减少变量数。"))
  }
  if (length(bad_e)) {
    diagnostics <- c(diagnostics, sprintf(paste0("%d 个量的有效样本量 ESS 低于 %d（最低 %s=%.0f）：",
                                                 "后验形状是被自相关撑开的，尾部区间尤其不可信。"),
                 length(bad_e), ESS_MIN, names(which.min(ess_cells)), min(ess_cells)))
  }

  # ---------------- 内部校验：恒等式 + 与闭式 OLS 对齐 ----------------
  ident_res <- max(abs(tot_flat - (dir_flat + ind_flat)))
  if (ident_res > 1e-8) {
    diagnostics <- c(diagnostics, sprintf("内部校验失败：总效应 − (直接 + 间接) = %.3g，实现有 bug，请报告。", ident_res))
  }
  # lm.fit 在**只有一个响应列**时把 coefficients 返回成向量（不是 m x 1 矩阵），
  # 于是 ols_full[1:p, , drop=FALSE] 两个下标当场报“量度数目不正确”（p=k=q=1 实测）。
  # 这里不靠运气：不管回来的是向量还是矩阵，都按 (行=系数, 列=响应) 钉成矩阵。
  as_coef_mat <- function(cf, nrows, ncols, tag) {
    v <- as.vector(cf)
    if (length(v) != nrows * ncols) {
      stop(sprintf("%s：闭式解返回 %d 个数，无法排成 %d x %d —— 设计与响应形状对不上。",
                   tag, length(v), nrows, ncols))
    }
    matrix(v, nrows, ncols)
  }
  ols_full <- as_coef_mat(stats::lm.fit(cbind(Xc, Mc), Yc)$coefficients, p + k, q, "Y 侧 OLS")
  ols_g    <- as_coef_mat(stats::lm.fit(Xc, Mc)$coefficients, p, k, "M 侧 OLS")
  ols_dir  <- ols_full[1:p, , drop = FALSE]
  ols_ind  <- ols_g %*% ols_full[(p + 1):(p + k), , drop = FALSE]
  pm_dir   <- matrix(colMeans(dir_flat), p, q)
  pm_ind   <- matrix(colMeans(ind_flat), p, q)
  # 先验 λ=prior_l 会带来一点收缩，所以不能用硬阈值比小数位。
  # 标准化尺度上收缩因子≈ λ·s²/(n + λ·s²)，拿它推一个与效应量成比例的容差。
  shr <- (prior_l * mean(tau2s)) / (n + prior_l * mean(tau2s))
  tol <- 0.02 + 3 * shr * max(abs(c(ols_dir, ols_ind)))
  dev_dir <- max(abs(pm_dir - ols_dir)); dev_ind <- max(abs(pm_ind - ols_ind))
  if (dev_dir > tol || dev_ind > tol) {
    diagnostics <- c(diagnostics, sprintf(paste0("后验均值与同数据 OLS 偏差偏大（直接 %.4f、间接 %.4f，容差 %.3f）：",
                                                 "要么没收敛，要么先验太强 —— 别把这些区间当结论。"),
                 dev_dir, dev_ind, tol))
  }

  # ---------------- 效应表（视图直接吃）----------------
  eff_block <- function(flat, ols) {
    iv <- hdi_matrix(flat, prob)
    list(mean = colMeans(flat), sd = apply(flat, 2, stats::sd), median = apply(flat, 2, stats::median),
         hdi_lo = iv["lo", ], hdi_hi = iv["hi", ],
         prob_gt0 = colMeans(flat > 0),                 # 用后验概率说话，不造"贝叶斯 p 值"
         rhat = as.numeric(split_rhat_matrix(as_chains(flat), cell_lab)),
         ess  = as.numeric(ess_split_matrix(as_chains(flat), cell_lab)),
         ols  = as.vector(ols))
  }
  effects <- list(direct = eff_block(dir_flat, ols_dir),
                  indirect = eff_block(ind_flat, ols_ind),
                  total = eff_block(tot_flat, ols_dir + ols_ind))
  # 总效应的频率派对照：Y~X 单侧回归（不含 M）。它与 dir+ind 的差别本身就是信息：
  # 差别大说明 M 参与了通路；这里只把它作为参照给出，不当判据。
  effects$total$ols_single_predictor_regression <-
    as.vector(as_coef_mat(stats::lm.fit(Xc, Yc)$coefficients, p, q, "总效应 OLS 参照"))

  # ---------------- 方差分解（Borcard 三段式，逐响应 + 总体）----------------
  r2_of <- function(D) {
    # 同理：单响应时 residuals 是长度 n 的向量，colSums 会直接报错
    r <- as.matrix(stats::lm.fit(D, Yc)$residuals)
    if (ncol(r) != q) stop("内部校验失败：残差列数与响应数不一致，lm.fit 的形状假设不成立。")
    1 - colSums(r^2) / colSums(Yc^2)
  }
  r2x <- r2_of(Xc); r2m <- r2_of(Mc); r2xm <- r2_of(cbind(Xc, Mc))
  part <- list(
    x_unique = r2xm - r2m, m_unique = r2xm - r2x,
    shared = r2x + r2m - r2xm, residual = 1 - r2xm,
    x_unique_total = sum(r2xm - r2m) / q, shared_total = sum(r2x + r2m - r2xm) / q,
    m_unique_total = sum(r2xm - r2x) / q, residual_total = sum(1 - r2xm) / q
  )
  psum <- part$x_unique + part$m_unique + part$shared + part$residual
  if (max(abs(psum - 1)) > 1e-6) {
    diagnostics <- c(diagnostics, sprintf("内部校验失败：方差分解各分量之和偏离 1（最大偏差 %.3g）。",
                                          max(abs(psum - 1))))
  }

  # ---------------- WAIC（Y 侧多元回归；逐观测 pointwise）----------------
  # 旧脚本写的 BAIC 没有定义，这里换成有明确公式的量：
  #   lpd_i = log mean_s exp(ll_i,s)，p_waic = Σ_i var_s(ll_i,s)，WAIC = -2(lpd_sum - p_waic)
  Dfull <- cbind(Xc, Mc)
  pwise_lpd <- numeric(0); pwise_var <- numeric(0)
  for (c_ in seq_len(q)) {
    fitted_s <- tcrossprod(betas[, , c_], Dfull)              # draws x n
    resid <- t(t(fitted_s) - Yc[, c_])                        # 逐观测残差
    sd_m <- matrix(sqrt(tau2s[, c_]), nrow = nrow(fitted_s), ncol = n, byrow = TRUE)
    ll <- stats::dnorm(resid, mean = 0, sd = sd_m, log = TRUE)
    mx <- apply(ll, 1, max)
    pwise_lpd <- c(pwise_lpd, mx + log(colMeans(exp(t(ll) - mx))))   # 带最大值的 logsumexp
    pwise_var <- c(pwise_var, apply(ll, 1, stats::var))
  }
  waic_out <- list(lpd = sum(pwise_lpd), p_waic = sum(pwise_var),
                   waic = -2 * (sum(pwise_lpd) - sum(pwise_var)),
                   scope = "Y 侧多元回归（逐观测 pointwise；M 侧不计入）")

  # ---------------- 给图的抽样（控制体积：每量最多 600 个 draw）----------------
  keep_rows <- if (nrow(dir_flat) > 600L)
    as.integer(round(seq(1, nrow(dir_flat), length.out = 600L))) else seq_len(nrow(dir_flat))
  draws_out <- list(dir = t(dir_flat[keep_rows, , drop = FALSE]),
                    ind = t(ind_flat[keep_rows, , drop = FALSE]),
                    tot = t(tot_flat[keep_rows, , drop = FALSE]),
                    n_kept = length(keep_rows))

  # ---------------- 结论那句话（不能只把数摆出来）----------------
  med_ratio <- sum(abs(matrix(colMeans(ind_flat), p, q))) /
    max(1e-12, sum(abs(matrix(colMeans(tot_flat), p, q))))
  verdict <- if (any(effects$indirect$hdi_lo > 0) || any(effects$indirect$hdi_hi < 0)) {
    sprintf("至少有一个 X→Y 通路存在中介：%d 个格子的 %d%% 区间不含 0，间接效应占总效应的量级约 %.0f%%。",
            sum(effects$indirect$hdi_lo > 0 | effects$indirect$hdi_hi < 0),
            round(prob * 100), 100 * med_ratio)
  } else {
    sprintf("没有一个格子的 %d%% 区间不含 0：这份数据**不支持中介结论**。", round(prob * 100))
  }
  if (length(bad_r) || length(bad_e)) {
    verdict <- paste0("（收敛未达标，下面这句先别当结论）", verdict)
  }

  output <- list(
    success = TRUE,
    method = "Bayesian ERA (extended redundancy analysis) with mediation, conjugate Gibbs sampler",
    n = n, p = p, k = k, q = q,
    chains = chains, iterations = niter, thin = thin, kept_per_chain = Skeep,
    seed = seed, prior_lambda = prior_l, prob = prob,
    thresholds = list(rhat_max = RHAT_MAX, ess_min = ESS_MIN),
    X_center = Xz$center, X_scale = Xz$scale, X_kept = Xz$keep,
    M_center = Mz$center, M_scale = Mz$scale, M_kept = Mz$keep,
    Y_center = Yz$center, Y_scale = Yz$scale, Y_kept = Yz$keep,
    cell_labels = cell_lab,
    effects = effects,
    direct_matrix = pm_dir, indirect_matrix = pm_ind, total_matrix = pm_dir + pm_ind,
    variance_partition = part,
    r2 = list(X = r2x, M = r2m, XM = r2xm),
    convergence = list(rhat_max = max(rhat_cells, na.rm = TRUE),
                       ess_min = min(ess_cells, na.rm = TRUE),
                       rhat = rhat_cells, ess = ess_cells,
                       ok = !(length(bad_r) || length(bad_e))),
    identity_check = list(total_minus_parts = ident_res,
                          posterior_vs_ols_direct = dev_dir, posterior_vs_ols_indirect = dev_ind,
                          tolerance = tol),
    waic = waic_out,
    draws = draws_out,
    diagnostics = as.list(diagnostics),
    interpretation = sprintf("%s X 侧 %d 个变量、M 侧 %d 个中介、Y 侧 %d 个响应；%s 共 %d 个效应格子。",
                             verdict, p, k, q,
                             sprintf("每格给出直接/间接/总效应的后验均值与 %.0f%% 区间。", prob * 100),
                             p * q)
  )

  cat(sprintf("[Bayesian ERA] n=%d p=%d k=%d q=%d 链=%d 迭代=%d -> R̂max %.4f / ESSmin %.0f（诊断 %d 条）\n",
              n, p, k, q, chains, niter, max(rhat_cells, na.rm = TRUE),
              min(ess_cells, na.rm = TRUE), length(diagnostics)))

  # digits 不能截：恒等式与 OLS 对齐校验都要逐位比，截到 4 位会把实现问题掩成数值问题
  writeLines(jsonlite::toJSON(output, auto_unbox = TRUE, digits = NA, pretty = TRUE, null = "null"),
             output_file)

}, error = function(e) {
  # 不套三层壳、不带 R 调用帧：只留一句能复现的话
  writeLines(sprintf("[Bayesian ERA] %s", conditionMessage(e)), error_file)
  quit(status = 1)
})
