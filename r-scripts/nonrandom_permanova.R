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
#   distance       : communityData 时用；"ws" 由本脚本实现，其余见 VEGAN_METHODS
#   presenceAbsence: true 时先把物种表二值化（存在/缺失）
#   controlCoverage: true 时先把每个样本按总丰度归一化（相对丰度）再算距离，
#                  以此抵消测序深度差异；不重采样、不丢数据、可复现
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

# WS（weighted Simpson / proportional overlap）：把每个样本标准化到相对丰度后，
# 计算 1 - Σmin/Σmax。CANOVO 等流程会用到它，但本机 vegan 2.7.6 的 vegdist 没有
# ws/wu 方法，因此按定义实现，避免把不支持的方法名透传下去报 "invalid distance method"。
# 性质（tools/verify_nonrandom_templates.mjs 会验证）：相同样本 -> 0；无共有物种 -> 1；对称。
vegdist_ws <- function(x) {
  rs <- rowSums(x, na.rm = TRUE)
  if (any(rs <= 0)) stop("存在总丰度为 0 的样本，无法计算 WS 距离（请先剔除空样本）")
  p <- x / rs
  n <- nrow(p)
  d <- matrix(0, n, n)
  for (i in seq_len(n - 1)) {
    for (j in (i + 1):n) {
      mn <- sum(pmin(p[i, ], p[j, ]))
      mx <- sum(pmax(p[i, ], p[j, ]))
      d[i, j] <- d[j, i] <- if (mx <= 0) 0 else 1 - mn / mx
    }
  }
  as.dist(d)
}

# 核心：直接用距离阵算 PERMANOVA 的 F（Anderson 2001 的距离基分解）
#   SST = Σ_{i<j} d²_ij / n
#   SSW = Σ_g ( Σ_{i<j∈g} d²_ij / n_g )
#   SSA = SST - SSW
#   F   = (SSA / (a-1)) / (SSW / (n-a))
# 自己实现而不是反复调用 vegan::adonis2，是为了能在受限方案下跑上千次置换。
# ---------------------------------------------------------------------------
# 距离阵 -> Gower 双中心化 -> 特征分解，取正特征值轴当响应矩阵。
# 这就是 vegan::capscale 的内部做法：在这组坐标上做普通线性投影，得到的 SS/F
# 与距离基 PERMANOVA 完全一致，且天然支持连续协变量（旧实现不支持，见 main 里注释）。
make_pcoa_basis <- function(d2, tol_ratio = 1e-9) {
  n <- nrow(d2)
  J <- diag(n) - 1 / n
  G <- -0.5 * J %*% d2 %*% J
  G <- (G + t(G)) / 2                                    # 消除浮点不对称
  ev <- eigen(G, symmetric = TRUE)
  keep <- ev$values > max(1e-12, max(ev$values) * tol_ratio)
  lam <- ev$values[keep]
  list(Y = ev$vectors[, keep, drop = FALSE] %*% diag(sqrt(lam), nrow = length(lam)),
       lambda = lam, n_neg = as.integer(sum(ev$values < -1e-12)))
}

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

  # 必须在算距离之前决定：它改变的是喂给 vegdist 的矩阵本身
  control_coverage <- isTRUE(params$controlCoverage)

  sample_data <- normalize_sample_data(params$sampleData)
  if (is.null(sample_data)) stop("必须提供 sampleData（含分组/分层变量）")

  # 距离来源
  if (!is.null(dist_matrix)) {
    if (nrow(dist_matrix) != ncol(dist_matrix)) stop("distanceMatrix 不是方阵")
    dmat <- as.dist(dist_matrix)
    dist_label <- "用户提供的距离矩阵"
  } else if (!is.null(comm)) {
    # 测序深度校正：先按行归一化到相同总和（相对丰度），再算距离。
    # 不选 rarefaction：随机抽平会丢数据、且同一份数据两次抽结果不同（不可复现）；
    # 不选「把 log(深度) 当协变量进模型」：本模块的 F 只支持因子项（见下方注释）。
    if (control_coverage) {
      rs <- rowSums(comm, na.rm = TRUE)
      if (any(rs <= 0)) stop("controlCoverage 要求每个样本总丰度 > 0（存在空样本，无法归一化）")
      comm <- comm / rs
    }
    if (isTRUE(params$presenceAbsence)) comm <- ifelse(comm > 0, 1, 0)
    method <- tolower(params$distance %||% "bray")
    # VEGAN_METHODS 是在本机 r-portable（vegan 2.7.6）上逐个 tryCatch 验过的，
    # 新增方法请先确认能算出来，别让脚本在用户点「运行分析」时才报错。
    VEGAN_METHODS <- c("bray", "jaccard", "euclidean", "gower", "chisq", "aitchison",
                       "morisita", "horn", "cao", "chao", "raup", "manhattan",
                       "kulczynski", "hellinger")
    if (method == "ws") {
      dmat <- vegdist_ws(comm)
    } else if (method %in% VEGAN_METHODS) {
      dmat <- vegan::vegdist(comm, method = method,
                             binary = (method == "jaccard" && isTRUE(params$presenceAbsence)))
    } else {
      stop(sprintf("不支持的距离方法：%s；可选 ws（本脚本实现）或 %s",
                   method, paste(VEGAN_METHODS, collapse = "/")))
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

  # ---------------- 观测值：按术语分组的距离基一元 ANOVA ----------------
  # 统计量与 vegan::adonis2 同口径（tools/verify_nonrandom_engine.R 逐项对齐）。
  # 只支持因子项：F 的定义是「样本按该术语的水平分成若干组，比较组间/组内离散度」，
  # 连续变量没有水平可分。早先版本试过把连续协变量塞进模型（pH、以及
  # controlCoverage 注入的 .coverage），实测会让 group 的 F 从 19.3 塌到 1.5 ——
  # 因为按「设计列唯一组合」分组时组合数≈n，残差自由度被吃光。那是不出错的错，
  # 所以这里直接拒绝，而不是给一个能跑但不能看的数。
  model_df <- sample_data[, terms, drop = FALSE]
  term_groups <- list()
  obs_table <- list()
  for (ti in seq_along(terms)) {
    v <- terms[ti]
    x <- model_df[[v]]
    if (is.numeric(x)) {
      stop(sprintf("术语 \"%s\" 是连续变量：%s", v, paste0(
        "本模块按距离分组检验组间离散度差异，只支持因子（分类）变量。",
        "请把连续变量分箱成区间后作为因子/区组，或用 vegan::adonis2 做协变量调整。")))
    }
    grp <- factor(as.character(x))
    if (nlevels(grp) < 2) stop(sprintf("术语 \"%s\" 只有 1 个水平，无法检验", v))
    if (nlevels(grp) >= n - 1) {
      stop(sprintf("术语 \"%s\" 有 %d 个水平而样本只有 %d 个：水平数接近样本量会让残差自由度归零，请合并水平", v, nlevels(grp), n))
    }
    term_groups[[ti]] <- as.integer(grp)
    res <- permanova_f_from_dist(d2, term_groups[[ti]])
    obs_table[[length(obs_table) + 1]] <- list(
      term = v, df = nlevels(grp) - 1L,
      F_model = res[1], R2 = res[2], R2_within = res[3],
      n_levels = nlevels(grp)
    )
  }

  # 主术语（公式首项）是受限置换的对象；其余术语给出各自的边际检验，供对照阅读
  primary <- 1
  tested_term <- terms[primary]
  primary_group <- term_groups[[primary]]
  obs_global <- permanova_f_from_dist(d2, primary_group)

  balance_note <- NULL
  # 交叉单元格联合检验：把所有术语的组合当成一个多水平因子（等价 adonis2(d ~ cell)，
  # cell=interaction(...)).注意它**含交互作用**，与非平衡设计的可加模型 adonis2(d ~ a + b)
  # 不是同一个量，所以字段名叫 F_cells 而不是 F_model。
  joint_grp <- if (length(terms) > 1) {
    as.integer(factor(interaction(model_df, drop = TRUE, sep = "|")))
  } else primary_group
  obs_joint <- permanova_f_from_dist(d2, joint_grp)
  if (is.na(obs_joint[1]) && length(terms) > 1) {
    balance_note <- paste0(balance_note %||% "",
      "术语交叉后单元格数接近样本量，联合检验自由度不足，只报告逐术语边际检验。")
  }
  if (length(terms) > 1) {
    xb <- table(factor(primary_group), factor(as.character(model_df[[terms[2]]])))
    bal <- apply(xb, 1, function(r) r / sum(r))
    balance_note <- sprintf(
      "公式含 %d 个术语，表中为各自的边际检验（R2 不可相加）：首项各水平在第二术语上的占比范围 %.2f-%.2f%s",
      length(terms), min(bal), max(bal),
      if (any(xb == 0)) "，且存在空格子（设计不平衡，建议改用分层置换）" else "")
  }

  # ---------------- 受限置换零分布 ----------------
  # 置换的是「主术语标签与响应矩阵行的配对」，区组/空间限制体现在 idx 怎么生成
  run_perm <- function(block_vec) {
    fs <- rep(NA_real_, permutations)
    for (i in seq_len(permutations)) {
      idx <- if (is.null(block_vec)) sample.int(n) else permute_within_blocks(seq_len(n), block_vec)
      fs[i] <- permanova_f_from_dist(d2, primary_group[idx])[1]
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

  # ---------------- 退化设计诊断 ----------------
  # 真正的退化不是“p 算大了”，而是大量置换与观测设计完全同构（F 一模一样）：
  # 这部分置换无论抽多少都会计入 #{null >= obs}，于是 p 被钉在“并列频率”上跳不出去。
  # 典型场景：每个区组只有 1 Case + 1 Control，层内对调标签回到同一个分割。
  #
  # 这里踩过两个坑，别再改回去：
  #   1) 拿 mean(f_null >= f_obs) 当下界——那个量就是 p 本身（没效应的设计自然 ≈0.5），
  #      结果把 9/26 个教学模板全误报了。
  #   2) 拿 mean(f_null == f_obs) 当下界——方向对了，但它是 Monte-Carlo：
  #      999 次报 27%、9999 次报 25%，而这个设计的精确答案就是 2/8 = 25%。所以下面直接算组合数。
  #
  # 层内置换总数 = ∏ n_b!；保持分组向量不变的是 ∏ k_b!(n_b-k_b)!；
  # 把所有层的标签同时翻转（Case<->Control）得到的分割只换了列名，F 完全相等，故乘 2。
  # 并列比例 = 2·∏ k_b!(n_b-k_b)! / ∏ n_b!  （用 lfactorial，避免阶乘溢出）
  diagnostics <- character(0)
  if (!is.null(use_blocks)) {
    fv <- f_null_constrained[!is.na(f_null_constrained)]
    distinct_f <- if (length(fv)) length(unique(round(fv, 10))) else 0L
    bt <- table(use_blocks, joint_grp)
    log_tie <- log(2) + sum(apply(bt, 1, function(cnt)
      lfactorial(cnt[1]) + lfactorial(cnt[2]) - lfactorial(sum(cnt))))
    tie_exact <- exp(min(log_tie, 0))
    if (tie_exact > 0.05) {
      diagnostics <- c(diagnostics, sprintf(paste0(
        "受限置换的零分布退化：%.0f%% 的置换与观测设计算出完全相同的 F（不同取值只有 %d 个），",
        "因此 p 的下界就是 %.3f——即使组间差异无穷大也跳不过 0.05。",
        "原因是分层变量的层内水平太少（每层每类样本数：%s，即一个区组里只有一例待比较水平）。",
        "出路：① 每层至少放 2 个待比较水平（如 2 Case + 2 Control）；",
        "② 或者这个变量本来就不是分层变量，应该放进公式当待检验项；",
        "③ 或者换一个真正与批次共线的变量做 strata。"),
        100 * tie_exact, distinct_f, tie_exact,
        paste(head(sort(unique(as.vector(bt))), 4), collapse = '/')))
    }
  }

  # ---------------- 图表数据（全部来自本次真实计算）----------------
  pcoa <- tryCatch({
    # 仅用于绘图：取 Gower 双中心化后的正特征值轴（非欧氏距离会有负特征值，
    # 这里按惯例只画正轴，与 vegan::wcmdscale 的展示口径一致）
    basis <- make_pcoa_basis(d2)
    tot <- sum(basis$lambda)
    k <- min(2, length(basis$lambda))
    sc <- basis$Y[, seq_len(k), drop = FALSE]
    ev <- basis$lambda[seq_len(k)]
    list(
      x = as.numeric(sc[, 1]), y = if (k >= 2) as.numeric(sc[, 2]) else as.numeric(rep(0, n)),
      var_explained = as.numeric(ev / tot),
      labels = rownames(sample_data) %||% paste0("S", seq_len(n)),
      group = if (length(terms)) as.character(model_df[[1]]) else rep("NA", n),
      strata = if (is.null(use_blocks)) rep("NA", n) else as.character(use_blocks)
    )
  }, error = function(e) NULL)

  hist_values <- f_null_constrained[!is.na(f_null_constrained)]
  # 零分布只用于画直方图，超过 500 点就等间隔抽样（保留 n_used 记录真实置换次数，
  # 前端拿到的永远是「抽样后的点 + 真实总数」，不会把抽样当成置换次数）
  thin <- function(v, cap = 500L) {
    if (length(v) <= cap) return(as.numeric(v))
    as.numeric(v[seq(1, length(v), by = ceiling(length(v) / cap))])
  }
  if (length(hist_values) > 500) hist_values <- thin(hist_values)

  chart_data <- list(
    pcoa = pcoa,
    distance = dist_label,
    null = list(
      observed = obs_global[1],
      values = as.numeric(hist_values),
      p = p_constrained,
      n_used = as.integer(sum(!is.na(f_null_constrained))),
      scheme = plan$scheme
    ),
    # 自由置换的零分布单独给一份：两条分布叠在一起才能看出
    # 「同一个 F，在两种零分布下落在完全不同的位置」，这正是本模块的全部卖点
    null_free = if (is.null(f_null_free)) NULL else list(
      observed = obs_global[1],
      values = thin(f_null_free[!is.na(f_null_free)]),
      p = p_free,
      n_used = as.integer(sum(!is.na(f_null_free))),
      scheme = "free"
    ),
    variance = lapply(obs_table, function(r) list(
      term = r$term, R2 = r$R2, F = r$F_model, df = r$df
    )),
    # 结论对比：只跑了一种方案时也给一行，否则前端「结论对比」图会整块空白
    comparison = if (is.null(f_null_free)) list(
      list(scheme = "free", p = p_free, F = obs_global[1])
    ) else list(
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
      tested_term = tested_term,
      F_cells = obs_joint[1],
      R2_cells = obs_joint[2],
      R2 = obs_global[2],
      R2_within = obs_global[3],
      p_free = p_free,
      p_constrained = p_constrained
    ),
    anova_table = obs_table,
    permutation = list(
      scheme = plan$scheme,
      tested_term = tested_term,
      note_scheme = paste0("置换对象：公式首项 ", tested_term, " 的标签（其余术语与样本配对保持不变）"),
      requested = permutations,
      performed = as.integer(sum(!is.na(f_null_constrained))),
      strata_variable = strata_var %||% NA_character_,
      feasible_blocks = feasible_blocks,
      dropped_blocks = dropped_blocks,
      distinct_null_values = length(unique(round(f_null_constrained[!is.na(f_null_constrained)], 10))),
      seed = seed,
      elapsed_seconds = round(elapsed, 3),
      note = plan$note
    ),
    model = list(
      formula = formula_str,
      terms = terms,
      distance = dist_label,
      presence_absence = isTRUE(params$presenceAbsence),
      coverage_control = if (control_coverage) "relative_abundance" else FALSE,
      cell_levels = length(unique(joint_grp)),
      balance_note = balance_note,
      n_samples = n
    ),
    chart_data = chart_data,
    interpretation = interpretation,
    diagnostics = if (length(diagnostics)) as.list(diagnostics) else list(),
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
