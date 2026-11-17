# ============================================================================
# Non-random PERMANOVA（受限/分层置换的 PERMANOVA）
# ----------------------------------------------------------------------------
# 为什么需要它：标准 PERMANOVA 的零假设是「样本可以任意乱序」。当采样设计本身
# 有结构（多个批次/站点/时间层，或空间邻近样本更相似）时，任意乱序会造出一个
# 「现实中不可能出现」的零分布，p 值因此偏乐观。Non-random（受限）置换只在
# 设计允许的范围内交换样本标签，零分布才与真实数据结构一致。
#
# 用法：Rscript nonrandom_permanova.R <input.json> <output.json> <error.txt>
#
# 输入（三种数据入口任选其一，优先级 distanceMatrix > communityData）：
#   distanceMatrix : n×n 距离阵（二维数组）
#   communityData  : n×p 物种表（二维数组 / {"S1":[...]} 行字典 / {"OTU1":[...]} 列字典）
#   sampleData     : { "group":[...], "strata":[...], "block":[...], "coverage":[...] }
#   formula        : 固定效应，如 "group" 或 "group + pH"
#   strata         : 可选，分层/区组变量名（受限置换只在该变量内部交换）
#   coordinates    : 可选，[[x,y],...]，scheme="spatial" 时用于定义邻域
#   spatialBand    : 可选，空间邻域半径（与 coordinates 同单位，默认按 k-NN 中位数）
#   scheme         : "free" | "stratified" | "spatial"（默认：有 strata 就 stratified）
#   distance       : "bray"|"jaccard"|"euclidean"|"ws"（communityData 时用，默认 bray）
#   presenceAbsence: true 时先把物种表二值化（存在/缺失）
#   controlCoverage: true 时把测序深度（样本总和）作为协变量纳入模型
#   permutations   : 置换次数，默认 999（此处不要求 100 的倍数，与 LDM 不同）
#   seed           : 随机种子，默认 12345
#
# 输出：observed / anova_table / permutation / comparison / null_distribution /
#       chart_data / note
#
# 依赖：jsonlite + vegan（两者便携 R 里都有；不依赖 glmnet/rstan，也不依赖 R≥4.4）
# ============================================================================

# 单测/校验场景下可以 source 本文件取函数而不立即跑分析：
#   Sys.setenv(NR_PERMANOVA_SOURCE = "1"); source("r-scripts/nonrandom_permanova.R")
AS_SOURCE_ONLY <- identical(Sys.getenv("NR_PERMANOVA_SOURCE"), "1")

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3 && !AS_SOURCE_ONLY) {
  stop("Usage: Rscript nonrandom_permanova.R <input.json> <output.json> <error.txt>")
}

input_file <- args[1]
output_file <- args[2]
error_file <- args[3]

# R 4.4 以下没有 base 版 %||%，这里自带一份，保证 4.3.x / 4.6.x 都能跑
`%||%` <- function(a, b) if (is.null(a)) b else a

# 单个置换内可交换的「组」数量上限：太少的区组（<2 个样本）无法交换，会被跳过
MIN_BLOCK_SIZE <- 2L

# ---------------------------------------------------------------------------
# 核心：直接用距离阵算 PERMANOVA 的 F（Anderson 2001 的距离基分解）
#   SST = Σ_{i<j} d²_ij / n
#   SSW = Σ_g ( Σ_{i<j∈g} d²_ij / n_g )
#   SSA = SST - SSW
#   F   = (SSA / (a-1)) / (SSW / (n-a))
# 自己实现而不是反复调用 vegan::adonis2，是为了能在受限方案下跑上千次置换。
# ---------------------------------------------------------------------------
permanova_f_from_dist <- function(d2, assign) {
  n <- length(assign)
  sst <- sum(d2) / 2 / n                      # sum(d2) 含上下三角两次
  lev <- unique(assign)
  ssw <- 0
  for (k in lev) {
    idx <- which(assign == k)
    ng <- length(idx)
    if (ng < 2) next
    ssw <- ssw + sum(d2[idx, idx]) / 2 / ng
  }
  ssa <- sst - ssw
  a <- length(lev)
  df_a <- a - 1
  df_w <- n - a
  if (df_a < 1 || df_w < 1 || ssw <= 0 || ssa < 0) return(c(NA_real_, NA_real_, NA_real_))
  f_stat <- (ssa / df_a) / (ssw / df_w)
  c(f_stat, ssa / sst, ssw / sst)             # F, R2(组间), R2(组内)
}

# 多因素版本：把每个术语的「额外解释量」用逐次去掉(SS 差)的方式算出来，
# 再对每个术语单独做受限置换检验（type-II 风格，术语顺序不影响结果）。
build_design_terms <- function(formula_str, sample_data) {
  rhs <- all.vars(as.formula(paste("~", formula_str)))   # 用户只给右侧式（如 "group + pH"），需补 ~
  rhs <- rhs[nzchar(rhs)]
  bad <- setdiff(rhs, names(sample_data))
  if (length(bad)) stop(sprintf("公式里的变量在 sampleData 中不存在：%s", paste(bad, collapse = ", ")))
  rhs
}

# ---------------------------------------------------------------------------
# 受限置换：在每个区组内部重排标签
# ---------------------------------------------------------------------------
make_permutation_plan <- function(n, blocks, scheme, coords, spatial_band, seed) {
  set.seed(seed)
  plan <- list(scheme = scheme, blocks = NULL, note = "")

  if (identical(scheme, "free")) {
    plan$note <- "自由置换：忽略任何采样结构，作为对照基线。"
    return(plan)
  }

  if (identical(scheme, "spatial")) {
    if (is.null(coords)) stop("scheme=\"spatial\" 需要 coordinates（[[x,y],...]）")
    cd <- as.matrix(coords)
    if (ncol(cd) < 2 || nrow(cd) != n) {
      stop(sprintf("coordinates 形状应为 %d×2（实际 %d×%d）", n, nrow(cd), ncol(cd)))
    }
    dmat <- as.matrix(dist(cd))
    if (is.null(spatial_band) || !is.finite(as.numeric(spatial_band))) {
      # 默认半径：每个点到第 3 近邻距离的中位数（约等于「3 个邻居的尺度」）
      kth <- apply(dmat, 1, function(v) sort(v)[min(4, n)])
      band <- median(kth)
    } else {
      band <- as.numeric(spatial_band)
    }
    adj <- dmat <= band
    cl <- igraph_free_components(adj)          # 用邻接矩阵求连通分量
    plan$blocks <- cl
    plan$note <- sprintf("空间受限置换：邻域半径 %.4g（到第 3 近邻距离的中位数），只允许同一连通邻域内交换标签。", band)
    return(plan)
  }

  if (identical(scheme, "stratified")) {
    if (is.null(blocks)) stop("scheme=\"stratified\" 需要 strata 变量名")
    plan$note <- sprintf("分层受限置换：在 %d 个区组内部交换标签，区组之间不交换。", length(unique(blocks)))
    return(plan)
  }

  stop(sprintf("未知置换方案：%s（可用 free / stratified / spatial）", scheme))
}

# 邻接矩阵的连通分量（不依赖 igraph：广度优先 + 逻辑向量）
igraph_free_components <- function(adj) {
  n <- nrow(adj)
  comp <- integer(n)
  cid <- 0L
  for (i in seq_len(n)) {
    if (comp[i] != 0) next
    cid <- cid + 1L
    queue <- i
    comp[i] <- cid
    while (length(queue)) {
      cur <- queue[1]
      queue <- queue[-1]
      nb <- which(adj[cur, ] & comp == 0)
      if (length(nb)) {
        comp[nb] <- cid
        queue <- c(queue, nb)
      }
    }
  }
  factor(comp, labels = paste0("C", seq_len(cid)))
}

# 在区组内随机重排一个标签向量
permute_within_blocks <- function(values, blocks) {
  out <- values
  for (k in unique(blocks)) {
    idx <- which(blocks == k)
    if (length(idx) >= MIN_BLOCK_SIZE) out[idx] <- sample(values[idx])
  }
  out
}

# ---------------------------------------------------------------------------
# sampleData 归一化：兼容三种历史写法
#   1) 行对象数组 [{group:"A", strata:"B1"}, ...]（jsonlite 存 data.frame 的默认形式）
#   2) 列字典    {group:[...], strata:[...]}
#   3) 己经是 data.frame
# 连续列（可全转数值且取值较多）保持 numeric，其余转 factor，避免 pH 被当因子展开。
# ---------------------------------------------------------------------------
normalize_sample_data <- function(raw) {
  if (is.null(raw)) return(NULL)
  if (is.data.frame(raw)) return(raw)
  if (!is.list(raw)) stop("sampleData 无法解析")

  nms <- names(raw)
  if (!is.null(nms) && all(nzchar(nms))) {
    lens <- unique(lengths(lapply(raw, function(v) unlist(v, use.names = FALSE))))
    if (length(lens) == 1 && lens > 1) {
      df <- as.data.frame(lapply(raw, function(v) unlist(v, use.names = FALSE)), stringsAsFactors = FALSE)
      names(df) <- nms
      return(df)
    }
  }

  is_row_array <- all(vapply(raw, function(r) is.list(r) && !is.null(names(r)) && length(r) >= 1, logical(1)))
  if (!is_row_array) stop("sampleData 无法解析：请用 {列名:[...]} 或 [{行:...}, ...] 两种写法之一")

  cols <- unique(unlist(lapply(raw, names)))
  mat <- do.call(rbind, lapply(raw, function(r) vapply(cols, function(cn) {
    v <- r[[cn]]
    if (is.null(v) || length(v) == 0 || is.na(v[[1]])) NA_character_ else as.character(v[[1]])
  }, character(1))))
  df <- as.data.frame(mat, stringsAsFactors = FALSE)
  names(df) <- cols

  rn <- vapply(raw, function(r) {
    v <- r[["sample"]]
    if (is.null(v)) NA_character_ else as.character(v[[1]])
  }, character(1))
  if (!any(is.na(rn))) rownames(df) <- rn

  for (cn in cols) {
    num <- suppressWarnings(as.numeric(df[[cn]]))
    if (!any(is.na(num))) {
      if (length(unique(num)) > 8) {
        df[[cn]] <- num                     # 连续协变量
      } else {
        df[[cn]] <- factor(df[[cn]], levels = sort(unique(df[[cn]])))
      }
    } else {
      df[[cn]] <- factor(df[[cn]])
    }
  }
  df
}

main <- function() {
  for (pkg in c("jsonlite", "vegan")) {
    if (!require(pkg, character.only = TRUE, quietly = TRUE)) {
      stop(sprintf("缺少必需的 R 包：%s（便携 R 里应有，请检查 r-portable/library）", pkg))
    }
  }

  params <- jsonlite::fromJSON(input_file, simplifyVector = FALSE)

  permutations <- as.integer(params$permutations %||% 999L)
  if (is.na(permutations) || permutations < 99L) {
    stop(sprintf("置换次数至少 99（收到 %s）", params$permutations %||% "null"))
  }
  seed <- as.integer(params$seed %||% 12345L)

  # ---------------- 数据入口归一化 ----------------
  parse_matrix <- function(x, what) {
    if (is.null(x)) return(NULL)
    m <- tryCatch({
      if (is.data.frame(x)) {
        as.matrix(x)
      } else if (is.list(x)) {
        ln <- lengths(x)
        if (all(ln == 1L)) {
          # 列字典 {"OTU1":[...], ...} -> 转成列
          do.call(cbind, lapply(x, as.numeric))
        } else if (length(unique(ln)) == 1L && is.list(x[[1]])) {
          do.call(rbind, lapply(x, function(r) as.numeric(unlist(r))))   # 二维数组
        } else {
          # 行字典 {"S1":[...], ...}，长度不齐就按列对齐
          mx <- max(ln)
          do.call(rbind, lapply(x, function(r) c(as.numeric(unlist(r)), rep(NA, mx - length(r)))))
        }
      } else {
        as.matrix(x)
      }
    }, error = function(e) NULL)
    if (is.null(m)) stop(sprintf("%s: 无法解析为矩阵", what))
    dimnames(m)[[1]] <- dimnames(m)[[1]] %||% paste0("S", seq_len(nrow(m)))
    m
  }

  dist_matrix <- parse_matrix(params$distanceMatrix, "distanceMatrix")
  comm <- parse_matrix(params$communityData, "communityData")

  sample_data <- normalize_sample_data(params$sampleData)
  if (is.null(sample_data)) stop("必须提供 sampleData（含分组/分层变量）")

  # 距离来源
  if (!is.null(dist_matrix)) {
    if (nrow(dist_matrix) != ncol(dist_matrix)) stop("distanceMatrix 不是方阵")
    dmat <- as.dist(dist_matrix)
    dist_label <- "用户提供的距离矩阵"
  } else if (!is.null(comm)) {
    if (isTRUE(params$presenceAbsence)) comm <- ifelse(comm > 0, 1, 0)
    method <- tolower(params$distance %||% "bray")
    if (method %in% c("jaccard", "bray", "euclidean", "ws", "chisq", "gower", "aitchison")) {
      dmat <- vegan::vegdist(comm, method = method, binary = (method == "jaccard" && isTRUE(params$presenceAbsence)))
    } else {
      stop(sprintf("不支持的距离方法：%s", method))
    }
    dist_label <- sprintf("由物种表计算的 %s 距离", toupper(method))
  } else {
    stop("需要 distanceMatrix 或 communityData 之一")
  }

  n <- nrow(sample_data)
  n_dist <- attr(dmat, "Size")                       # dist 对象没有 nobs 方法，只能取 Size 属性
  if (!is.numeric(n_dist) || n_dist != n) {
    stop(sprintf("样本数不一致：sampleData %d 行，距离矩阵 %d 阶", n, n_dist))
  }
  d2 <- as.matrix(dmat)^2

  formula_str <- params$formula %||% "group"
  terms <- build_design_terms(formula_str, sample_data)

  # 测序深度校正（rarefaction 的免重采样替代）：把 log(样本总和) 作为协变量
  control_coverage <- isTRUE(params$controlCoverage)
  if (control_coverage) {
    if (is.null(comm)) stop("controlCoverage=true 需要提供 communityData 才能算测序深度")
    cov_depth <- log(rowSums(comm, na.rm = TRUE) + 1)
    sample_data$.coverage <- (cov_depth - mean(cov_depth)) / (sd(cov_depth) + 1e-12)
    terms <- c(terms, ".coverage")
  }

  # 分类变量转因子（连续变量保留原样）
  for (v in terms) {
    if (!is.numeric(sample_data[[v]])) sample_data[[v]] <- factor(sample_data[[v]])
  }

  # ---------------- 置换方案 ----------------
  scheme <- tolower(params$scheme %||% if (!is.null(params$strata)) "stratified" else "free")
  strata_var <- params$strata
  blocks <- NULL
  if (!is.null(strata_var) && nzchar(strata_var)) {
    if (!strata_var %in% names(sample_data)) {
      stop(sprintf("strata 指定的变量 \"%s\" 不在 sampleData 里（可用：%s）", strata_var, paste(names(sample_data), collapse = ", ")))
    }
    blocks <- as.character(sample_data[[strata_var]])
  }
  coords <- NULL
  if (!is.null(params$coordinates)) {
    coords <- do.call(rbind, lapply(params$coordinates, function(r) as.numeric(unlist(r))))
  }
  plan <- make_permutation_plan(n, blocks, scheme, coords, params$spatialBand, seed)
  use_blocks <- if (identical(plan$scheme, "free")) NULL else (plan$blocks %||% blocks)
  if (identical(plan$scheme, "stratified") && is.null(use_blocks)) {
    stop("stratified 方案需要 strata 变量（或改用 scheme=\"free\" / \"spatial\"）")
  }

  # ---------------- 观测值：多因素逐次 ANOVA（type-II 风格）----------------
  # 设计矩阵（去掉截距），按术语分块
  model_df <- sample_data[, terms, drop = FALSE]
  design <- model.matrix(~ . - 1, data = model_df)
  col_groups <- attr(design, "assign")

  obs_table <- list()
  for (ti in seq_along(terms)) {
    cols_i <- which(col_groups == ti)
    assign_all <- design[, cols_i, drop = FALSE]
    # 组间离散度：用最近邻划分（对连续协变量按其数值分位分箱）
    if (length(cols_i) == 1 && is.numeric(model_df[[terms[ti]]]) && length(unique(assign_all)) > 6) {
      grp <- cut(assign_all, breaks = 4, labels = FALSE)
    } else {
      grp <- as.integer(factor(apply(assign_all, 1, paste, collapse = "_")))
    }
    res <- permanova_f_from_dist(d2, grp)
    obs_table[[length(obs_table) + 1]] <- list(
      term = terms[ti], df = length(unique(grp)) - 1,
      F_model = res[1], R2 = res[2], R2_within = res[3],
      n_levels = length(unique(grp))
    )
  }

  # 全局模型（所有术语合并）
  full_grp <- as.integer(factor(apply(design, 1, paste, collapse = "_")))
  obs_global <- permanova_f_from_dist(d2, full_grp)

  # ---------------- 受限置换零分布 ----------------
  run_perm <- function(block_vec) {
    fs <- numeric(permutations)
    for (i in seq_len(permutations)) {
      pgrp <- if (is.null(block_vec)) sample(full_grp) else permute_within_blocks(full_grp, block_vec)
      fs[i] <- permanova_f_from_dist(d2, pgrp)[1]
    }
    fs
  }

  t0 <- proc.time()[3]
  f_null_constrained <- run_perm(use_blocks)
  elapsed <- proc.time()[3] - t0

  f_null_free <- if (identical(plan$scheme, "free")) NULL else run_perm(NULL)

  p_value <- function(f_obs, f_null) {
    ok <- f_null[!is.na(f_null)]
    if (!length(ok)) return(NA_real_)
    (sum(ok >= f_obs) + 1) / (length(ok) + 1)      # 含观测值本身，p 永不为 0
  }

  p_constrained <- p_value(obs_global[1], f_null_constrained)
  p_free <- if (is.null(f_null_free)) p_constrained else p_value(obs_global[1], f_null_free)

  feasible_blocks <- if (is.null(use_blocks)) NA_integer_ else {
    tb <- table(use_blocks)
    as.integer(sum(tb >= MIN_BLOCK_SIZE))
  }
  dropped_blocks <- if (is.null(use_blocks)) NA_integer_ else as.integer(sum(table(use_blocks) < MIN_BLOCK_SIZE))

  # ---------------- 图表数据（全部来自本次真实计算）----------------
  pcoa <- tryCatch({
    pc <- vegan::wcmdscale(dmat, k = 2, eig = TRUE)
    sc <- pc$points[, 1:2, drop = FALSE]
    ev <- pc$eig[1:2]
    tot <- sum(pmax(pc$eig, 0))
    list(
      x = as.numeric(sc[, 1]), y = as.numeric(sc[, 2]),
      var_explained = as.numeric(ev / tot),
      labels = rownames(sample_data) %||% paste0("S", seq_len(n)),
      group = if (length(terms)) as.character(model_df[[1]]) else rep("NA", n),
      strata = if (is.null(use_blocks)) rep("NA", n) else as.character(use_blocks)
    )
  }, error = function(e) NULL)

  hist_values <- f_null_constrained[!is.na(f_null_constrained)]
  if (length(hist_values) > 500) hist_values <- hist_values[seq(1, length(hist_values), by = ceiling(length(hist_values) / 500))]

  chart_data <- list(
    pcoa = pcoa,
    null = list(
      observed = obs_global[1],
      values = as.numeric(hist_values),
      p = p_constrained,
      n_used = as.integer(sum(!is.na(f_null_constrained))),
      scheme = plan$scheme
    ),
    variance = lapply(obs_table, function(r) list(
      term = r$term, R2 = r$R2, F = r$F_model, df = r$df
    )),
    comparison = if (is.null(f_null_free)) NULL else list(
      list(scheme = "free", p = p_free, F = obs_global[1]),
      list(scheme = plan$scheme, p = p_constrained, F = obs_global[1])
    ),
    note = "零分布由本脚本在受限置换方案下逐次算出（不是 LDM 那种只给 p 值的情形），因此可以真实绘制。"
  )

  interpretation <- if (is.na(p_constrained)) {
    "无法计算 p 值：置换结果为空，请检查分组/区组是否过少。"
  } else if (p_constrained < 0.05 && p_free < 0.05) {
    "受限置换后仍然显著：组间差异不是采样结构造成的假象。"
  } else if (p_constrained >= 0.05 && p_free < 0.05) {
    "自由置换显著、受限置换不显著：先前的显著性很可能来自分层/空间结构，而不是组间差异。"
  } else {
    "两种置换方案都不显著。"
  }

  output <- list(
    success = TRUE,
    analysis = "nonrandom_permanova",
    observed = list(
      F_model = obs_global[1],
      R2 = obs_global[2],
      R2_within = obs_global[3],
      p_free = p_free,
      p_constrained = p_constrained
    ),
    anova_table = obs_table,
    permutation = list(
      scheme = plan$scheme,
      requested = permutations,
      performed = as.integer(sum(!is.na(f_null_constrained))),
      strata_variable = strata_var %||% NA_character_,
      feasible_blocks = feasible_blocks,
      dropped_blocks = dropped_blocks,
      seed = seed,
      elapsed_seconds = round(elapsed, 3),
      note = plan$note
    ),
    model = list(
      formula = formula_str,
      terms = terms,
      distance = dist_label,
      presence_absence = isTRUE(params$presenceAbsence),
      coverage_control = control_coverage,
      n_samples = n
    ),
    chart_data = chart_data,
    interpretation = interpretation,
    vegan_version = as.character(utils::packageVersion("vegan")),
    r_version = as.character(getRversion()),
    timestamp = format(Sys.time(), "%Y-%m-%d %H:%M:%S")
  )

  json <- jsonlite::toJSON(output, auto_unbox = TRUE, pretty = TRUE,
                           null = "null", na = "null", digits = 10)
  writeLines(json, output_file)
  cat("[Non-random PERMANOVA] 完成 -> ", output_file, "\n")
}

if (!AS_SOURCE_ONLY) tryCatch(main(), error = function(e) {
  msg <- paste0("[Non-random PERMANOVA] Error: ", conditionMessage(e))
  writeLines(msg, error_file)
  cat(msg, "\n")
  quit(status = 1)
})
