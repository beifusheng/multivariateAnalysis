# ============================================================================
# GMR4 —— 广义多响应降秩回归（Generalized Multi-response Reduced-Rank Regression）
# ----------------------------------------------------------------------------
# 模型：  Y (n x q) ~ X (n x p) B ，约束 rank(B) = S <= min(p, q)
#         加岭正则 lambda：  min  ||Y - XB||_F^2 + lambda * ||B||_F^2
#
# 两阶段调参（对应论文 4.1 / 4.2 两步）：
#   Step 1  Rank-wise regularization tuning：对每个候选秩 S 单独调 lambda
#   Step 2  Global model selection via generalized SE rule：
#           在 CV 误差不超过「最优 + 1 个标准误」的那些 (S, lambda) 里，
#           选最简约的（S 最小，其次 lambda 最大）。这就是 1-SE 规则向二维超参的推广。
#
# 为什么不用 glmnet：岭 + 降秩这组约束有闭式解（Izenman 1975 的 RRR，把 Sxx^-1
# 换成 (Sxx + lambda*I)^-1 就是正则版本），写闭式而不是调用外部优化器有两个好处 ——
#   1) 能拿 OLS / 岭回归做**恒等式**校验（见 verify_gmr4_engine.R），不是"看起来差不多"；
#   2) 少一个需要编译的依赖。r-runtime.lock.json 里 gmr4 的 required 已相应改成 jsonlite + Matrix。
#
# 与旧脚本的关系（重要，别再把这段删掉）：
#   旧 gmr4.R 是"简化版，需根据论文完善"的占位，交替最小化里把 U/V 从 p x rank 的
#   系数因子重新赋值成 X %*% coef 这种 n x rank 的数据矩阵，第 2 轮迭代就
#   `solve()` 非兼容参数 —— 真 R 跑一次就 exit=1，也就是说这份脚本**从未成功执行过**，
#   却已经写进了 lockfile 的 required 表和 api/r.js 的封装里。闭式实现顺带消灭了这类维度事故。
# ============================================================================

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  stop("Usage: Rscript gmr4.R <input.json> <output.json> <error.txt>")
}

input_file  <- args[1]
output_file <- args[2]
error_file  <- args[3]

# ---- 数值内核：矩阵求逆一律走 chol / backsolve，不用 inverse() ----
# 本项目硬规定：inverse() 在病态设计上会给出"看起来是个矩阵"的垃圾数，
# chol2inv 失败则直接报错，报错比垃圾数字好。
safe_solve <- function(A, B = NULL, ridge = 0) {
  Areg <- A
  if (ridge > 0) Areg <- A + ridge * diag(nrow(A))
  out <- tryCatch(chol2inv(chol(as.matrix(Areg))), error = function(e) NULL)
  if (is.null(out)) {
    stop(sprintf(paste0("设计矩阵奇异（无法求逆，条件数极差）。",
                        "请检查是否有重复列、常量列，或样本数少于变量数（当前 %d 样本 / %d 列）。"),
                 nrow(A), ncol(A)), call. = FALSE)
  }
  if (is.null(B)) out else out %*% B
}

# 先按精确 Cholesky 解；只在真奇异时才逐步加岭，并回报加了多少。
# 不要"为了稳定"无条件预加一个小岭：那样会把 满秩+lambda=0 必须等于 OLS
# 这条恒等式污染掉（实测 |B-B_ols| 稳定在 1e-5，与 lambda 无关，就是它）。
solve_or_reg <- function(A, B, trace_scale = 1) {
  # 注意 backsolve(..., k=) 的 k 是"只用三角矩阵的前 k 行/列"，不是"解 ncol(B) 个右端"。
  # 上一版把 k 写成 ncol(B)，语义直接错了；解多个右端用 chol2inv 最不容易写错。
  r <- tryCatch(chol(as.matrix(A)), error = function(e) NULL)
  if (!is.null(r)) return(list(x = chol2inv(r) %*% B, ridge = 0))
  step <- max(1e-10, 1e-8 * trace_scale)
  for (i in 1:8) {
    rr <- tryCatch(chol(as.matrix(A + step * diag(nrow(A)))), error = function(e) NULL)
    if (!is.null(rr)) return(list(x = chol2inv(rr) %*% B, ridge = step))
    step <- step * 10
  }
  stop("矩阵过度奇异（连续加了 8 级正则仍无法求逆）—— 请减少变量或增加样本", call. = FALSE)
}

rrr_ridge_fit <- function(Xc, Yc, rank_s, lambda) {
  p <- ncol(Xc); q <- ncol(Yc)
  Sxx <- crossprod(Xc)                    # p x p
  Sxy <- crossprod(Xc, Yc)                # p x q
  Syy <- crossprod(Yc)                    # q x q

  B_ridge <- safe_solve(Sxx, Sxy, ridge = lambda)              # (X'X+λI)^-1 X'Y

  # 广义特征问题 M = Syy^-1 * Sxy' B —— 它的领先 S 个特征向量给出响应侧的投影方向 V。
  # Syy 只有在真奇异（例如 q > n 或有冗余响应列）时才需要正则，见 solve_or_reg。
  sm <- solve_or_reg(Syy, crossprod(Sxy, B_ridge), trace_scale = sum(diag(Syy)) / q)
  M <- sm$x
  syy_ridge_used <- sm$ridge

  ev <- eigen(M, symmetric = FALSE)
  ord <- order(-Re(ev$values))            # 特征值理论上非负（= 正则化典范相关平方）
  V  <- Re(ev$vectors[, ord[seq_len(min(rank_s, q))], drop = FALSE])   # q x S

  # B = B_ridge V (V' Syy V)^-1 V' Syy —— 秩 S 且在岭度量下的最小二乘解
  G  <- safe_solve(crossprod(V, Syy %*% V))
  B  <- B_ridge %*% V %*% G %*% t(V) %*% Syy

  list(B = B, V = V, U = B_ridge %*% V, B_ridge = B_ridge, syy_ridge_used = syy_ridge_used)
}

tryCatch({
  params <- jsonlite::fromJSON(input_file)

  required_packages <- c("jsonlite", "Matrix")   # 闭式解不需要 glmnet（见文件头）
  for (pkg in required_packages) {
    if (!require(pkg, character.only = TRUE, quietly = TRUE)) {
      stop(paste("Required package not installed:", pkg), call. = FALSE)
    }
  }

  diagnostics <- character(0)

  # ---------------- 输入解析与形状检查 ----------------
  # JSON 里必须是**二维数组**（每行一个样本）。一维数组一律拒绝：
  # jsonlite 的 auto_unbox=TRUE 会把矩阵拍平成长向量，旧实现会把它当成"一列 n 个样本"
  # 静默继续跑，于是 n 变成 p*q，报出"样本数不一致"这种完全指错方向的话（实测踩过）。
  # 形状判定必须分类型处理，不能 unlist 再 as.matrix ——
  # 我上一版就是那么写的，于是把好好的 20x4 拍成 80x1，
  # 然后报出一句"X 有 80 行，Y 有 120 行，样本数不一致"，把排查方向整个带偏。
  as_num_matrix <- function(m, what) {
    if (is.null(m)) return(NULL)
    if (is.matrix(m)) return(matrix(as.numeric(m), nrow(m), ncol(m), dimnames = NULL))
    if (is.data.frame(m)) return(as.matrix(m))
    if (is.list(m)) {
      lens <- vapply(m, length, 1L)
      if (all(lens == 1L)) {                       # 一维：每个元素一个数
        stop(sprintf(paste0("%s 收到的是一维数组（%d 个数字）。GMR4 需要二维数组：",
                            "每行一个样本、每列一个变量，例如 [[1,2,3],[4,5,6]]。"),
                     what, length(m)), call. = FALSE)
      }
      if (length(unique(lens)) == 1L) {             # 行列表 [[...],[...]]
        t <- tryCatch(do.call(rbind, lapply(m, function(r) as.numeric(unlist(r)))), error = function(e) NULL)
        if (is.null(t) || any(!is.finite(t))) {
          stop(sprintf("%s 里有文本或空单元格，转不成数值矩阵。", what), call. = FALSE)
        }
        return(t)
      }
      # 列向量列表（各列长度一致）：按列拼
      t <- tryCatch(do.call(cbind, lapply(m, function(cc) as.numeric(unlist(cc)))), error = function(e) NULL)
      if (is.null(t)) stop(sprintf("%s 转不成数值矩阵（行列形状不规则）", what), call. = FALSE)
      return(t)
    }
    if (is.numeric(m)) {
      stop(sprintf(paste0("%s 收到的是一维数组（%d 个数字）。GMR4 需要二维数组：",
                          "每行一个样本、每列一个变量，例如 [[1,2,3],[4,5,6]]。"),
                   what, length(m)), call. = FALSE)
    }
    stop(sprintf("%s 不是矩阵（拿到的类型是 %s）", what, typeof(m)), call. = FALSE)
  }

  X <- as_num_matrix(params$X, "预测变量 X")
  Y <- as_num_matrix(params$Y, "响应变量 Y")
  Z <- as_num_matrix(params$Z, "协变量 Z")
  if (is.null(X) || is.null(Y)) stop("必须同时提供 X（预测变量）与 Y（响应变量）", call. = FALSE)
  if (ncol(X) < 1L || ncol(Y) < 1L) stop("X 与 Y 都至少要有一列", call. = FALSE)
  if (nrow(X) == ncol(X) && !isTRUE(params$X_is_vectors)) {
    # 本项目栽过两次：矩阵被当成"样本×变量"表喂进来。形状可疑时必须开口，不能静默默认。
    stop(sprintf(paste0("X 是 %d x %d 的方阵 —— 看起来像距离矩阵而不是「样本 x 变量」表。",
                        "GMR4 要的是原始变量表（每行一个样本）。"), nrow(X), ncol(X)), call. = FALSE)
  }

  n <- nrow(X)
  if (nrow(Y) != n) {
    stop(sprintf("X 有 %d 行（样本），Y 有 %d 行 —— 两边样本数必须一致。", n, nrow(Y)), call. = FALSE)
  }
  if (!is.null(Z) && nrow(Z) != n) {
    stop(sprintf("协变量 Z 有 %d 行，与样本数 %d 不符。", nrow(Z), n), call. = FALSE)
  }

  p <- ncol(X); q <- ncol(Y)
  s_max <- min(p, q)
  if (n <= 2L) {
    stop(sprintf(paste0("样本数只有 %d。GMR4 要按 K 折交叉验证挑秩与 lambda，",
                        "至少需要 4 个样本（K=4 时每折训练集才有自由度）。"), n), call. = FALSE)
  }
  if (s_max < 2L) {
    diagnostics <- c(diagnostics, sprintf(paste0("min(p, q) = %d，秩没有可选空间（只有一个候选）。",
                                                 "结果等价于岭回归，降秩不起作用。"), s_max))
  }
  if (n <= p) {
    diagnostics <- c(diagnostics, sprintf(paste0("样本数 %d 不大于预测变量数 %d：",
                                                 "X'X+λI 在 λ 很小时接近奇异，秩与 lambda 的选型会不稳定。请增多样本或减少变量。"),
                                          n, p))
  }

  # ---------------- 常量列（零方差）：scale() 会算出 NaN，静默毁掉整条链 ----------------
  # Med 模块有先例：spec 里留常量列 + 引擎兜底报警。
  drop_col <- function(M, name) {
    v <- apply(M, 2, stats::sd, na.rm = TRUE)
    bad <- which(!is.finite(v) | v < .Machine$double.eps^0.5)
    if (length(bad)) {
      diagnostics <<- c(diagnostics, sprintf(paste0("%s 里有常量列（第 %s 列，方差为 0），已自动剔除；",
                                                    "如果那是你需要的变量，请检查是不是整列填了同一个值。"),
                                             name, paste(bad, collapse = ", ")))
      M <- M[, -bad, drop = FALSE]
    }
    M
  }
  X <- drop_col(X, "X"); p <- ncol(X)
  Y <- drop_col(Y, "Y"); q <- ncol(Y)
  if (!is.null(Z)) { Z <- drop_col(Z, "Z") }
  s_max <- min(p, q)

  # ---------------- 标准化 + 协变量偏正交化 ----------------
  mu_X <- colMeans(X); sd_X <- apply(X, 2, sd, na.rm = TRUE)
  mu_Y <- colMeans(Y)
  Xs <- scale(X, center = mu_X, scale = sd_X)          # 零方差列已剔除，不会出现 NaN
  Ys <- scale(Y, center = mu_Y, scale = apply(Y, 2, sd, na.rm = TRUE))
  Xs[is.na(Xs)] <- 0
  Ys[is.na(Ys)] <- 0

  if (!is.null(Z) && ncol(Z) > 0) {
    # 残差化：把 Z 从 X 和 Y 里都扣掉（Frisch–Waugh），否则 Z 的效应会被算进 B。
    Zs <- scale(Z, center = colMeans(Z), scale = apply(Z, 2, sd, na.rm = TRUE))
    Zs[is.na(Zs)] <- 0
    Pz <- safe_solve(crossprod(Zs) + 1e-8 * diag(ncol(Zs))) %*% t(Zs)   # q_Z x n
    Xs <- Xs - Zs %*% (Pz %*% Xs)
    Ys <- Ys - Zs %*% (Pz %*% Ys)
  }

  # ---------------- 超参候选 ----------------
  rank_grid <- unique(as.integer(c(1:s_max)))
  if (!is.null(params$ranks)) {
    rg <- as.integer(unlist(params$ranks))
    rank_grid <- sort(unique(rg[rg >= 1 & rg <= s_max]))
    if (length(rank_grid) == 0L) {
      diagnostics <- c(diagnostics, sprintf("你给的 ranks 没有一个落在 1..%d，改用全部候选。", s_max))
      rank_grid <- 1:s_max
    }
  }
  lam_grid <- as.numeric(unlist(params$lambdas))
  if (length(lam_grid) == 0L) {
    lam_grid <- unique(round(10 ^ seq(-3, 2, length.out = 12), 6))     # 0.001 .. 100
  }
  kfold <- as.integer(params$kfold %||% 5L)
  kfold <- max(2L, min(kfold, n))
  seed  <- as.integer(params$seed %||% 12345L)     # 与 permanova.R 同一个纪律：同输入必同输出

  set.seed(seed)
  fold <- sample(rep_len(1:kfold, n))

  cv_mean <- matrix(NA_real_, length(rank_grid), length(lam_grid),
                    dimnames = list(paste0("S", rank_grid), paste0("lambda", lam_grid)))
  cv_se   <- matrix(NA_real_, nrow(cv_mean), ncol(cv_mean), dimnames = dimnames(cv_mean))
  rss_grid <- matrix(NA_real_, nrow(cv_mean), ncol(cv_mean), dimnames = dimnames(cv_mean))

  # 每折的误差用「该折行上的 SSE / 该折样本数」，对 q 求和 => 单一可比较的 CV 曲线下值
  for (i in seq_along(rank_grid)) {
    for (j in seq_along(lam_grid)) {
      per_fold <- numeric(kfold)
      for (k in seq_len(kfold)) {
        tr <- fold != k; te <- fold == k
        if (sum(tr) <= 1L || sum(te) == 0L) next
        fit <- rrr_ridge_fit(Xs[tr, , drop = FALSE], Ys[tr, , drop = FALSE], rank_grid[i], lam_grid[j])
        pred <- Xs[te, , drop = FALSE] %*% fit$B
        per_fold[k] <- sum((Ys[te, , drop = FALSE] - pred)^2) / sum(te)
      }
      used <- per_fold[per_fold > 0 | per_fold == 0]
      cv_mean[i, j] <- mean(used)
      cv_se[i, j]   <- stats::sd(used) / sqrt(length(used))
      full <- rrr_ridge_fit(Xs, Ys, rank_grid[i], lam_grid[j])
      rss_grid[i, j] <- sum((Ys - Xs %*% full$B)^2)
    }
  }

  # ---------------- Step 2：广义 1-SE 规则 ----------------
  best_idx <- which(cv_mean == min(cv_mean, na.rm = TRUE), arr.ind = TRUE)[1, ]
  thr <- cv_mean[best_idx[1], best_idx[2]] + cv_se[best_idx[1], best_idx[2]]
  ok <- which(!is.na(cv_mean) & cv_mean <= thr, arr.ind = TRUE)
  # 简约优先：先秩小，秩同再 lambda 大（正则更强）
  ord_ok <- order(ok[, 1], -ok[, 2])
  sel <- ok[ord_ok[1], , drop = FALSE]
  S_sel <- rank_grid[sel[1]]; lam_sel <- lam_grid[sel[2]]
  rule_note <- sprintf(paste0("按广义 1-SE 规则：CV=%.4f 的基准上允许 +1SE(%.4f)，",
                              "在 %d 个达标的 (S,lambda) 里取了最简约的 S=%d、lambda=%g。"),
                       cv_mean[best_idx[1], best_idx[2]], cv_se[best_idx[1], best_idx[2]],
                       nrow(ok), S_sel, lam_sel)

  final <- rrr_ridge_fit(Xs, Ys, S_sel, lam_sel)
  if (final$syy_ridge_used > 0) {
    diagnostics <- c(diagnostics, sprintf(paste0("响应侧交叉阵 Y'Y 奇异，为可求逆加了正则 %g。",
                                                 "通常意味着响应列多于样本数，或有线性相关的响应列；",
                                                 "此时典范方向数值上不稳，解释 R2 请谨慎。"),
                                          final$syy_ridge_used))
  }

  # ---------------- 拟合优度（原始尺度上给，别只给标准化尺度的） ----------------
  Yhat_s <- Xs %*% final$B                                  # 标准化尺度
  Yhat   <- sweep(Yhat_s * matrix(apply(Y, 2, sd, na.rm = TRUE), n, q, byrow = TRUE) +
                    matrix(mu_Y, n, q, byrow = TRUE), 2, 0)  # 还原到 Y 的原尺度
  ss_tot <- colSums((Y - matrix(mu_Y, n, q, byrow = TRUE))^2)
  ss_res <- colSums((Y - Yhat)^2)
  r2_each <- ifelse(ss_tot > 0, 1 - ss_res / ss_tot, NA_real_)
  r2_total <- 1 - sum(ss_res) / sum(ss_tot)

  # 全秩对照：降秩一定让 RSS 变大；不成立就是实现错了（verify 脚本也盯这条）
  full_fit <- rrr_ridge_fit(Xs, Ys, s_max, lam_sel)
  rss_full <- sum((Ys - Xs %*% full_fit$B)^2)
  if (sum((Ys - Xs %*% final$B)^2) < rss_full - 1e-8) {
    diagnostics <- c(diagnostics, paste0("内部校验失败：秩 S=", S_sel,
                                         " 的残差平方和竟然小于全秩解，实现有 bug，请报告。"))
  }
  if (S_sel >= s_max) {
    diagnostics <- c(diagnostics, sprintf(paste0("最终选了 S=%d = min(p,q)，说明降秩没带来 CV 收益；",
                                                 "这份数据里各响应之间可能没有共享的低维结构。"), S_sel))
  }

  # ---------------- 输出契约 ----------------
  mk <- function(m) { if (is.null(m)) NULL else { d <- dimnames(m); dimnames(m) <- NULL; m } }
  output <- list(
    success = TRUE,
    method = "GMR4 (generalized multi-response reduced-rank ridge regression)",
    n_samples = n, p = p, q = q,
    rank_selected = S_sel, lambda_selected = lam_sel,
    rank_grid = rank_grid, lambda_grid = lam_grid,
    s_max = s_max, kfold = kfold, seed = seed,
    selection_rule = rule_note,
    coefficients = mk(final$B),          # p x q，标准化尺度
    coefficients_raw_scale = NULL,
    U = mk(final$U), V = mk(final$V),    # B = U V' 的因子形式
    R2 = r2_total,
    R2_per_response = as.numeric(r2_each),
    cv = list(mean = mk(as.matrix(cv_mean)), se = mk(as.matrix(cv_se)),
              best = list(rank = rank_grid[best_idx[1]], lambda = lam_grid[best_idx[2]],
                          value = cv_mean[best_idx[1], best_idx[2]])),
    rss_reduced = sum((Ys - Xs %*% final$B)^2),
    rss_full = rss_full,
    covariates_partialled_out = if (!is.null(Z)) ncol(Z) else 0,
    X_center = as.numeric(mu_X), X_scale = as.numeric(sd_X),
    Y_center = as.numeric(mu_Y),
    predicted = mk(Yhat),
    diagnostics = as.list(diagnostics),
    interpretation = sprintf(paste0("选了秩 S=%d（满秩是 %d）、lambda=%g。",
                                    "整体 R²=%.3f；各响应 R² 见 R2_per_response。",
                                    "若某响应 R² 明显低于其它，说明它不共享那个低维结构。"),
                             S_sel, s_max, lam_sel, r2_total)
  )

  # 非标准化尺度的系数：B_raw = (1/sd_Y) * B_std * sd_X' ，便于用户直接代回原始数据
  B_raw <- t((t(final$B) / apply(Y, 2, sd, na.rm = TRUE)) * sd_X)
  dimnames(B_raw) <- NULL
  output$coefficients_raw_scale <- B_raw

  cat(sprintf("[GMR4] n=%d p=%d q=%d -> S=%d lambda=%g R2=%.4f（诊断 %d 条）\n",
              n, p, q, S_sel, lam_sel, r2_total, length(diagnostics)))

  # digits 不能截：系数截到 8 位会让"满秩必须等于 OLS"这条恒等式在 1e-5 处失败
  # （实测主角度全为 1、残差逐位相同，差异纯粹来自写出精度）。
  # 拿它做回归比对与跨机复现时，这种人为误差会把实现问题掩成数值问题。
  output_json <- jsonlite::toJSON(output, auto_unbox = TRUE, digits = NA, pretty = TRUE,
                                  null = "null")
  writeLines(output_json, output_file)

}, error = function(e) {
  writeLines(sprintf("[GMR4] %s", conditionMessage(e)), error_file)
  quit(status = 1)
})
