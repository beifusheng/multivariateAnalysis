# permanova_posthoc.R
# STATUS: implemented —— 已知答案自检见 r-scripts/tools/verify_posthoc_engine.R
#
# PERMANOVA 的事后两两比较：每一对组单独做一次「两组 PERMANOVA」，
# 组标签随机置换（小设计走穷举精确），再按 BH（主口径）+ Bonferroni（对照列）校正。
#
# 这个文件存在的理由：视图里原来那版事后检验这样造 p ——
#     const p = Math.random() < 0.05 ? Math.random() * 0.05 : 0.05 + Math.random() * 0.1;
#     const p_adj = p; // TODO: 实现 FDR/Bonferroni 校正
# 然后把原始 p 标成「校正 p 值」、从它推出星号、写进 Excel 导出。
# 那不是"功能还没做"，那是**给用户编造统计结论**。
#
# 输入（JSON）：
#   distanceMatrix : n x n 距离方阵（对称、对角为 0、无 NA/Inf、非负）
#   groups         : 长度 n 的分组标签（来自模型公式里那一列）
#   permutations   : 每组对子的置换次数，默认 999
#   seed           : 默认 12345；同输入必同输出
#   exact_max      : 组合数不超过它时用穷举精确置换，默认 50000
# 输出：逐对子的 n1/n2、组内与组间平均距离、pseudo-F、R²、p_raw、p_bh、p_bonferroni、
#       星号、是否穷举、实际置换数 + diagnostics / interpretation

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) stop("Usage: Rscript permanova_posthoc.R <input.json> <output.json> <error.txt>")
input_file <- args[1]; output_file <- args[2]; error_file <- args[3]

`%||%` <- function(a, b) if (is.null(a)) b else a

# auto_unbox=TRUE 会把长度 1 的向量拍成裸标量。只有 2 个分组时 pairs/p_bh 都只有 1 个元素，
# 视图对它调 .map() 当场崩 —— 本项目在 ERA 与 GMR⁴ 上各撞过一次，这里一开始就钉住。
as_arr  <- function(v) I(as.vector(as.numeric(v)))
as_carr <- function(v) I(as.character(v))

run <- function() {
  params <- jsonlite::fromJSON(input_file)
  diagnostics <- character(0)

  ## ---------------- 输入校验：每句都说清「哪里、几个、怎么办」 ----------------
  D_raw <- params$distanceMatrix
  if (is.null(D_raw)) {
    stop("缺少距离矩阵（distanceMatrix）。请先算出或导入 PERMANOVA 用的那份距离。")
  }
  D <- if (is.list(D_raw)) {
    as.matrix(do.call(rbind, lapply(D_raw, function(r_) as.numeric(unlist(r_)))))
  } else {
    as.matrix(D_raw)
  }
  if (length(dim(D)) != 2L || nrow(D) != ncol(D)) {
    stop(sprintf("distanceMatrix 不是方阵：%d x %s。它必须是 n 个样本两两距离的 n x n 矩阵。",
                 nrow(D), if (is.null(ncol(D))) "?" else as.character(ncol(D))))
  }
  if (anyNA(D) || !all(is.finite(D))) {
    b <- which(is.na(D) | !is.finite(D), arr.ind = TRUE)[1, ]
    stop(sprintf("距离矩阵里有 %d 个缺失或非有限值（例如第 %d 行第 %d 列）。请先补齐或剔除这些样本 —— 本分析不做插补。",
                 sum(is.na(D) | !is.finite(D)), b[1], b[2]))
  }
  # 对称性用相对容差：Bray-Curtis 这类距离常带 1e-16 量级的浮点不对称，
  # 硬绝对阈值会把合法输入当错误拒掉。
  scale_d <- max(mean(D), 1e-12)
  asym <- max(abs(D - t(D))) / scale_d
  if (asym > 1e-8) {
    stop(sprintf("距离矩阵不对称（最大偏离均值的 %.3g）。两两距离必须满足 d(i,j) = d(j,i)，请检查上游算法。", asym))
  }
  if (max(abs(diag(D))) > 1e-8) {
    stop(sprintf("距离矩阵对角线不为 0（最大 %.4g）。自己到自己的距离必须是 0。", max(abs(diag(D)))))
  }
  if (any(D < -1e-8)) stop(sprintf("距离矩阵里有负值（最小 %.4g）。", min(D)))

  lab_in <- params$groups
  if (is.null(lab_in)) {
    stop("缺少分组变量（groups）。它应该是模型公式里那一列整列的值，不是你自己挑的子集。")
  }
  lab <- as.character(unlist(lab_in))
  n0 <- nrow(D)
  if (length(lab) != n0) {
    stop(sprintf("分组向量长度 %d 与距离矩阵 %d 不一致。请整列传入分组，长度必须等于样本数。",
                 length(lab), n0))
  }
  keep <- !is.na(lab) & nzchar(trimws(lab))
  if (sum(keep) != n0) {
    diagnostics <- c(diagnostics, sprintf("%d 个样本没有分组标签，已从比较中排除（它们仍在你的距离矩阵里，但不进任何对子）。",
                                          n0 - sum(keep)))
    lab <- lab[keep]; D <- D[keep, keep, drop = FALSE]
  }
  n <- length(lab)
  if (n < 4L) stop(sprintf("有分组的样本只剩 %d 个，太少：置换检验的组内方差估不出来。请至少留 4 个有标签的样本。", n))
  gps <- sort(unique(lab))
  if (length(gps) < 2L) stop(sprintf("只剩一个分组「%s」，没有可比较的对子。", gps))

  B <- as.integer(params$permutations %||% 999L)
  if (is.null(params$permutations)) {
    diagnostics <- c(diagnostics, "置换次数用默认 999。")
  }
  if (B < 100L) {
    diagnostics <- c(diagnostics, sprintf("置换次数 %d 太少，已抬到 100：p 的分辨率就是 1/(置换数+1)，%d 次时任何 p<0.01 都不可能算出来。",
                                          B, max(B, 100L)))
    B <- 100L
  }
  seed <- as.integer(params$seed %||% 12345L)
  exact_max <- as.integer(params$exact_max %||% 50000L)

  ## ---------------- 每对子：两组 PERMANOVA ----------------
  # 惯例与 vegan 一致：F 统计量在**平方距离**上算。
  #   SS_total = Σ_{i<j} d²,  SS_within = 同组对子之和,  SS_between = SS_total - SS_within
  #   pseudo-F = (SS_between/(g-1)) / (SS_within/(n-g))，两组时 g-1 = 1
  # 表格里显示的组内/组间平均距离则用**原始距离**（可核对的量，不是统计量）。
  combos <- utils::combn(gps, 2L)
  npairs <- ncol(combos)
  res <- vector("list", npairs)
  p_floor <- numeric(npairs)

  for (s in seq_len(npairs)) {
    # utils::combn 返回的矩阵里装的是**值本身**，不是下标。
    # 上一版写成 gps[combos[1,s]]，字符索引字符 => A/Bg 全是 NA，
    # 于是报出「对子 NA vs NA 里有一组只有 0 个样本」这种疯话。
    A <- combos[1, s]; Bg <- combos[2, s]
    sel <- which(lab %in% c(A, Bg))
    nA <- sum(lab[sel] == A); nB <- length(sel) - nA
    if (nA < 2L || nB < 2L) {
      stop(sprintf("对子 %s vs %s 里有一组只有 %d 个样本（%s）。两组都得至少 2 个，否则组内距离全为 0，pseudo-F 无从定义。",
                   A, Bg, min(nA, nB), if (nA < 2) A else Bg))
    }
    Dsub <- D[sel, sel, drop = FALSE]
    up <- which(upper.tri(Dsub), arr.ind = TRUE)
    ii <- up[, 1]; jj <- up[, 2]
    d_raw  <- Dsub[cbind(ii, jj)]                  # 原始距离：给表格用
    dd2    <- d_raw ^ 2                            # 平方距离：给 F 用
    sst    <- sum(dd2)
    if (!(sst > 0)) {
      stop(sprintf("对子 %s vs %s 内部所有距离都是 0：这份距离矩阵区分不了任何样本，检验无从谈起。", A, Bg))
    }
    cA <- which(gps == A); cB <- which(gps == Bg)
    code <- ifelse(lab[sel] == A, cA, cB)
    same <- code[ii] == code[jj]

    # ---------------- 统计量必须按 Anderson (2001) 的 SS 定义，不能自己拍 ----------------
    # 我第一版写的是 pseudo-F = (Σ跨组d²/1) / (Σ同组d²/(n-2))，看着像 ANOVA，其实**错**：
    # PERMANOVA 的组内平方和带 **每组自己的权重 2/n_g**，总平方和带 2/n：
    #     SS_W = Σ_g (2/n_g) · Σ_{i<j∈g} d²
    #     SS_T = (2/n)   · Σ_{i<j}     d²        （置换下不变）
    #     SS_A = SS_T - SS_W
    #     F    = (SS_A/(g-1)) / (SS_W/(n-g))
    # 平衡设计时错的版本与对的版本差一个固定线性关系（我的 R² = (1+vegan)/2），
    # 不平衡时连线性关系都没有 —— 与 vegan::adonis2 逐设计对照时最大偏差 0.51，
    # 这条锚点把 bug 抓了出来。写科学计算时"看着像公式"就是错。
    ss_total_g <- (2 / length(sel)) * sst
    within_part <- function(m, co) {
      wA <- sum(dd2[m & (co[ii] == cA)]); wB <- sum(dd2[m & (co[ii] == cB)])
      (2 / nA) * wA + (2 / nB) * wB
    }
    ss_w0 <- within_part(same, code)
    ss_a0 <- ss_total_g - ss_w0
    f_obs <- if (ss_w0 > 0) (ss_a0 / 1) / (ss_w0 / (length(sel) - 2)) else Inf
    r2_obs <- ss_a0 / ss_total_g
    f_of <- function(m, co) {
      w <- within_part(m, co)
      if (w > 0) ((ss_total_g - w) / 1) / (w / (length(sel) - 2)) else Inf
    }

    ncomb <- choose(length(sel), nA)
    exact <- is.finite(ncomb) && ncomb <= exact_max
    if (exact) {
      # 穷举：两组 PERMANOVA 的零分布只取决于「哪 nA 个样本进 A」，
      # 所以 C(n, nA) 个划分已经把零分布走满 —— 观测那次天然在内，p 不会等于 0。
      mats <- utils::combn(length(sel), nA)
      ge <- 0L
      for (t in seq_len(ncol(mats))) {
        a <- rep(cB, length(sel)); a[mats[, t]] <- cA      # 谁进 A：只取决于这个划分
        ft <- f_of(a[ii] == a[jj], a)
        if (is.finite(f_obs)) { if (ft >= f_obs - 1e-12) ge <- ge + 1L } else ge <- ge + 1L
      }
      p_raw <- ge / ncol(mats)
      n_used <- ncomb
      n_ge <- ge; n_space <- ncol(mats)   # 穷举：样本空间就是划分总数
      p_floor[s] <- 1 / ncomb
    } else {
      set.seed(seed + s)                            # 每个对子独立且可复现的随机流
      ge <- 0L
      for (t in seq_len(B)) {
        a <- code[sample.int(length(sel), length(sel))]
        ft <- f_of(a[ii] == a[jj], a)
        if (is.finite(f_obs)) { if (ft >= f_obs - 1e-12) ge <- ge + 1L } else ge <- ge + 1L
      }
      p_raw <- (1 + ge) / (1 + B)                   # 教科书式 P：把观测那次也算进去
      n_used <- B
      n_ge <- ge; n_space <- B                 # 随机：样本空间就是置换次数
      p_floor[s] <- 1 / (B + 1)
    }

    res[[s]] <- list(
      g1 = A, g2 = Bg, n1 = nA, n2 = nB,
      mw1 = if (sum(same & (code[ii] == cA)) > 0) mean(d_raw[same & (code[ii] == cA)]) else 0,
      mw2 = if (sum(same & (code[ii] == cB)) > 0) mean(d_raw[same & (code[ii] == cB)]) else 0,
      mb  = if (sum(!same) > 0) mean(d_raw[!same]) else 0,
      f = f_obs, r2 = r2_obs, p = p_raw, ge = n_ge, space = n_space,
      exact = exact, n_used = n_used
    )
  }

  p_raw <- vapply(res, function(x) x$p, numeric(1))
  p_bh  <- stats::p.adjust(p_raw, method = "BH")
  p_bf  <- stats::p.adjust(p_raw, method = "bonferroni")

  # 用户在下拉框里选的口径决定「显著性」那一列，但三列**永远都给**：
  # 让 BH 与 Bonferroni 并排摆着本身就是信息（两者结论不同的对子最该被看见）。
  # 星号的判定只在这里做一次 —— 前端不许再实现一遍，否则两处会漂。
  primary <- tolower(as.character(params$primary %||% "bh"))
  p_primary <- switch(primary, bonferroni = p_bf, none = p_raw, unlist(list(p_bh))[1] * 0 + p_bh)
  if (!primary %in% c("bh", "fdr", "bonferroni", "none")) {
    diagnostics <- c(diagnostics, sprintf("不认识校正口径「%s」，按 BH 处理。可选：bh / bonferroni / none。", primary))
    primary <- "bh"; p_primary <- p_bh
  }
  if (primary == "fdr") primary <- "bh"                       # 视图里 FDR 与 BH 是同一个东西
  stars <- ifelse(p_primary < 0.001, "***", ifelse(p_primary < 0.01, "**",
             ifelse(p_primary < 0.05, "*", "ns")))

  ## ---------------- 自检：跑在生产路径上，不是只在测试里 ----------------
  if (any(p_bh < p_raw - 1e-12)) {
    diagnostics <- c(diagnostics, "内部校验失败：BH 校正后出现比原始 p 更小的值，请报告这组输入。")
  }
  if (npairs > 1L && any(p_bh > p_bf + 1e-12)) {
    diagnostics <- c(diagnostics, "内部校验失败：BH 本应不宽于 Bonferroni，请报告这组输入。")
  }
  if (any(p_raw < p_floor - 1e-12)) {
    diagnostics <- c(diagnostics, sprintf("内部校验失败：出现低于分辨率下限 1/(置换数+1) 的 p（最小 %.4g），请报告。",
                                          min(p_raw)))
  }
  if (any(!is.finite(vapply(res, function(x) x$f, numeric(1))))) {
    diagnostics <- c(diagnostics, "有对子的组内距离全为 0（同组样本完全相同），pseudo-F 记为 Inf：这通常说明分组或距离算法有问题。")
  }
  p_chk <- switch(primary, bonferroni = p_bf, none = p_raw, p_bh)
  if (any(abs(p_primary - p_chk) > 1e-15)) {
    diagnostics <- c(diagnostics, "内部校验失败：p_primary 与所选口径的列不一致，请报告。")
  }
  if (npairs == 1L) {
    diagnostics <- c(diagnostics, "只有 2 个分组 => 只有 1 个对子。此时 BH 与 Bonferroni 都等于原始 p，多重校正在这里不起作用（不是「没校正」）。")
  }
  n_exact <- sum(vapply(res, function(x) x$exact, logical(1)))
  if (n_exact > 0 && n_exact < npairs) {
    diagnostics <- c(diagnostics, sprintf("%d/%d 个对子用穷举精确置换（组合数 <= %d），其余用 %d 次随机置换：两种 p 的分辨率不同，别直接横向比。",
                                          n_exact, npairs, exact_max, B))
  }

  list(
    success = TRUE,
    method = "pairwise PERMANOVA（每组对子独立置换 pseudo-F；BH 主口径 + Bonferroni 对照）",
    n_samples = n, n_groups = length(gps), n_pairs = npairs,
    groups = as_carr(gps),
    permutations = B, seed = seed, exact_max = exact_max,
    p_floor = as_arr(p_floor),
    pairs     = as_carr(vapply(res, function(x) sprintf("%s vs %s", x$g1, x$g2), character(1))),
    group1    = as_carr(vapply(res, function(x) x$g1, character(1))),
    group2    = as_carr(vapply(res, function(x) x$g2, character(1))),
    n1 = as_arr(vapply(res, function(x) x$n1, numeric(1))),
    n2 = as_arr(vapply(res, function(x) x$n2, numeric(1))),
    mean_within_1 = as_arr(vapply(res, function(x) x$mw1, numeric(1))),
    mean_within_2 = as_arr(vapply(res, function(x) x$mw2, numeric(1))),
    mean_between  = as_arr(vapply(res, function(x) x$mb,  numeric(1))),
    pseudo_f = as_arr(vapply(res, function(x) x$f, numeric(1))),
    r2       = as_arr(vapply(res, function(x) x$r2, numeric(1))),
    p_raw = as_arr(p_raw), p_bh = as_arr(p_bh), p_bonferroni = as_arr(p_bf),
    # 原始计数一起给出来。+1 这种约定在 B=999 上只差 0.001，而 MC 噪声 3σ 就有 0.015 ——
    # 统计上测不出来，只能代数核对 p == (1+n_ge)/(1+n_space)。藏着不报就是让别人无法验我。
    n_ge = as_arr(vapply(res, function(x) x$ge, numeric(1))),
    n_space = as_arr(vapply(res, function(x) x$space, numeric(1))),
    primary = primary, p_primary = as_arr(p_primary),
    significance = as_carr(stars),
    exact_permutation = as_carr(vapply(res, function(x) as.character(x$exact), character(1))),
    n_perm_used = as_arr(vapply(res, function(x) x$n_used, numeric(1))),
    diagnostics = as_carr(diagnostics),
    interpretation = sprintf(paste0("%d 个两两比较里有 %d 个在「%s」口径下 p<0.05。",
      "随机置换的 p 有分辨率下限 1/(置换数+1)，所以「p 报到底」只说明至少这么小；",
      "穷举精确的那几个对子分辨率由组合数决定，与随机置换的 p 不完全可比。"),
      npairs, sum(p_primary < 0.05),
      if (primary == "bonferroni") "Bonferroni" else if (primary == "none") "未校正" else "BH (FDR)")
  )
}

tryCatch({
  res <- run()
  writeLines(jsonlite::toJSON(res, auto_unbox = TRUE, digits = NA, pretty = TRUE), output_file)
}, error = function(e) {
  writeLines(sprintf("[事后检验] %s", conditionMessage(e)), error_file)
  quit(status = 1)
})
