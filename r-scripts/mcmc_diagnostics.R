# ============================================================================
# MCMC 诊断（split-R̂ / ESS / HDI）—— 引擎与验收脚本**共用同一份实现**
# ----------------------------------------------------------------------------
# 为什么要单独成文件：诊断如果引擎算一遍、校验脚本再算一遍，两处一旦不一致，
# "验收通过"这句话就没有内容（本项目在别的模块上就这么自己骗过自己）。
#
# 为什么这三个函数各自都带着一段血泪注释：2026-11-20 的 spike 里，四个"模型不收敛 /
# 覆盖率 37.5% / RMSE 0.369"的坏消息**全部是诊断代码写错造出来的**，模型本身没问题。
# 两个坑是同型的（rowMeans / colMeans），所以这里把正确写法与错误后果都写在脸上。
# ============================================================================

# 把每条链从中间切成两半（split 的本意：一条链内部的漂移也要被抓出来）
# 要求所有链等长；不等长就报错，不静默截断——静默截断会让 W/B 的样本量口径错开。
.split_halves <- function(chains, what = "chains") {
  if (!is.list(chains) || length(chains) < 2) {
    stop(sprintf("%s 至少需要 2 条链才能算 split 诊断（给了 %d）", what, length(chains)))
  }
  lens <- vapply(chains, length, 1L)
  if (length(unique(lens)) != 1L) {
    stop(sprintf("%s 长度不一致（%s）：split 诊断要求等长链，别用截断糊过去",
                 what, paste(lens, collapse = ",")))
  }
  if (lens[[1]] < 8L) stop(sprintf("%s 太短（%d draws），诊断数字没有意义", what, lens[[1]]))
  h <- lens[[1]] %/% 2
  out <- list()
  for (x in chains) out <- c(out, list(x[seq_len(h)]), list(x[(h + 1L):(2L * h)]))
  # 奇数长度时丢掉最后一个 draw（两半等长才有合法的 W/B 口径），这是有意的
  out
}

# ---- split-R̂（Gelman–Rubin，向 Vehtari 2021 的 rank-split 取"够用就好"的版本）----
# 输入：list of numeric vectors（每条链同一标量量的 draws）
# 关键两行：means 必须是**每条半链自己的均值** -> colMeans(H)（长度 = 半链条数）。
# 写成 rowMeans(H) 是"各半链按位平均"，它的方差≈W/M，会让 R̂ 变成
#   sqrt( ((n-1)/n)W + var(行均值) ) / W ) ≈ 常数 1.06，
# 并且**对链间差异完全不敏感** —— spike 里那句"R̂ 不随迭代下降"就是这么造出来的。
split_rhat <- function(chains) {
  halves <- .split_halves(chains, "chains")
  H <- do.call(cbind, halves)
  n <- nrow(H); m <- ncol(H)
  W <- mean(apply(H, 2, stats::var))
  if (!is.finite(W) || W <= 0) {
    stop("链内方差为 0：采出来的全是同一个数，先查采样器，别来问 R̂")
  }
  B <- n * stats::var(colMeans(H))
  V <- ((n - 1) / n) * W + B / n
  sqrt(V / W)
}

# 多个标量量一起算：chains 是 list(链) ，每链是 matrix（draws × 量）
# 返回每个量的 R̂ 向量。**逐列调用 split_rhat**，不要在这里再做任何均值聚合。
split_rhat_matrix <- function(chains, names. = NULL) {
  stopifnot(all(vapply(chains, is.matrix, TRUE)))
  nq <- ncol(chains[[1]])
  if (any(vapply(chains, ncol, 1L) != nq)) stop("各链的列数不一致（量的个数变了？）")
  nm <- names. %||% colnames(chains[[1]]) %||% paste0("q", seq_len(nq))
  out <- vapply(seq_len(nq), function(j) {
    split_rhat(lapply(chains, function(M) M[, j]))
  }, 1)
  names(out) <- nm
  out
}

`%||%` <- function(a, b) if (is.null(a)) b else a

# ---- 有效样本量 ESS（初始正序和 / initial positive sequence）----
# 同样按"半链"口径算再求和：这是 split-ESS 的常规定义，与 split-R̂ 口径一致。
.ess_one <- function(x) {
  N <- length(x)
  x <- x - mean(x)
  ac <- stats::acf(x, plot = FALSE, lag.max = min(N - 1L, 300L))$acf[, , 1]
  s <- 1; i <- 2L
  while (i + 1L <= length(ac)) {          # 成对相加，出现负和就截断
    pair <- ac[i] + ac[i + 1L]
    if (pair < 0) break
    s <- s + 2 * pair
    i <- i + 2L
  }
  tau <- max(1, s - 1)                    # 积分自相关时间 >= 1
  N / tau
}
ess_split <- function(chains) {
  halves <- .split_halves(chains, "chains")
  sum(vapply(halves, .ess_one, 1))
}
ess_split_matrix <- function(chains, names. = NULL) {
  nq <- ncol(chains[[1]])
  nm <- names. %||% colnames(chains[[1]]) %||% paste0("q", seq_len(nq))
  out <- vapply(seq_len(nq), function(j) ess_split(lapply(chains, function(M) M[, j])), 1)
  names(out) <- nm
  out
}

# ---- HDI（等尾分位数区间；本项目用它而不是最高密度区间，理由见下）----
# 为什么不用真的 HDI 算法：真的 HDI 要在密度上搜索最窄覆盖区间，实现复杂且对
# 采样噪声敏感；而界面要传达的是"这个效应的可信范围有多宽、含不含 0"，
# 等尾 95% 区间在单峰后验上与之几乎重合，且**可复算、可口径一致地断言**。
# 这点必须在 UI 文案里写清"95% 分位数区间"，不许含糊成"最高密度区间"。
hdi_quantile <- function(draws, prob = 0.95) {
  if (anyNA(draws)) stop("draws 里有 NA：后验不该出现缺失，先查采样与派生量")
  a <- (1 - prob) / 2
  stats::quantile(draws, c(a, 1 - a), names = FALSE)
}
hdi_matrix <- function(draws, prob = 0.95) {
  if (anyNA(draws)) stop("draws 矩阵里有 NA")
  lo <- apply(draws, 2, stats::quantile, probs = (1 - prob) / 2, na.rm = FALSE)
  hi <- apply(draws, 2, stats::quantile, probs = 1 - (1 - prob) / 2, na.rm = FALSE)
  # 逐列（每个量）的分位数 -> 用 apply(..., MARGIN=2)。
  # 这里如果再犯 colMeans/rowMeans 那类方向错误，得到的就是"把所有量平均成一个数"
  # 的区间（spike#3 实测：后验均值 0.1156 配 HDI [0.606, 0.779]，自相矛盾）。
  rbind(lo = lo, hi = hi)
}
