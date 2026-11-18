# PERMANOVA-med 中介分析脚本（修正版）
# 基于 LDM::permanovaFL，test.mediation = TRUE
#
# ============ 两个关键坑（务必注意） ============
# 坑 1：置换次数必须是 100 的整数倍！
#   LDM 内部 n.perm.block = 100 为硬编码，而 permanova.perm 数组最后一维
#   只分配了 n.perm.max。当 n.perm.max 不是 100 的整数倍时
#   (如 99、999)，nblock = ceiling(n.perm.max/100) 会让 i.perm 超出
#   数组边界，报 "subscript out of bounds / 下标出界"。
#
# 坑 2：LDM 的中介语义与直觉相反 —— 左侧矩阵才是"中介变量"！
#   官方文档：testing of the mediation effect of the microbiome in the
#   pathway between the exposure(s) and the outcome(s), where the
#   exposure(s) and outcome(s) are specified as the FIRST and SECOND
#   (sets of) covariates.
#   即公式为：  mediator_matrix ~ exposure(X) + outcome(Y)
#
# 组的语法：每个 '+' 分隔的项是一「组」；一组内多个变量需加括号
#   例：MEDMAT ~ (X1 + X2) + (Y1 + Y2)

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  stop("Usage: Rscript permanova_med.R <input.json> <output.json> <error.txt>")
}

input_file  <- args[1]
output_file <- args[2]
error_file  <- args[3]

`%|||%` <- function(x, y) if (is.null(x) || length(x) == 0 || all(is.na(x))) y else x

tryCatch({

  # ---------- 依赖 ----------
  if (!require("jsonlite", character.only = TRUE, quietly = TRUE))
    stop("jsonlite package not installed")
  if (!require("LDM", character.only = TRUE, quietly = TRUE))
    stop("LDM package not installed. Install from: https://github.com/yijuanhu/LDM")

  cat("[PERMANOVA-med] LDM version:", as.character(packageVersion("LDM")), "\n")

  params <- jsonlite::fromJSON(input_file)

  # ---------- 输入格式归一化 ----------
  # 历史上前端存在三种互不兼容的写法，此处全部接受（避免用户白准备数据）：
  #   1) 二维数组 [[...],[...]]           -> 本就是 样本 × 变量
  #   2) 行字典 {"Sample1":[...], ...}     -> 键=样本（Excel 导入 convertImportData 即此式）
  #   3) 列字典 {"Age":[...], "BMI":[...]} -> 键=变量（协变量常用此式）
  # 2/3 的消歧依据：元素个数 == 参照样本数 n_ref 视为行字典；否则看每条长度是否 == n_ref。
  # mediator 本身无参照，按行字典解释（与前端示例、导入行为一致）。
  # 注意：之前用 as.matrix(list) 会得到 storage.mode="list" 的 n×1 矩阵，
  #       下游报 "'list' object cannot be coerced to type 'double'"，完全不可读。
  to_numeric_matrix <- function(m, label) {
    if (is.numeric(m)) return(m)
    out <- tryCatch({ storage.mode(m) <- "double"; m }, error = function(e) NULL)
    if (is.null(out) || !is.numeric(out))
      stop(sprintf("%s: 含无法转为数字的内容（分类变量请先编码为 0/1 或数值）", label))
    if (anyNA(out)) {
      bad <- which(is.na(out)); first <- out[bad[1L]]
      stop(sprintf("%s: 共 %d 个值无法转为数值（例如第 %d 个为空或含文字），请清理后重试",
                   label, length(bad), bad[1L]))
    }
    out
  }

  to_num_matrix <- function(x, label, n_ref = NULL) {
    if (is.matrix(x)) {
      m <- to_numeric_matrix(x, label)
      if (!is.null(n_ref) && nrow(m) != n_ref)
        stop(sprintf("%s: 样本数不一致（本矩阵 %d 行，参照 %d 个样本）",
                     label, nrow(m), n_ref))
      return(m)
    }
    if (is.atomic(x) && is.null(dim(x))) {
      m <- to_numeric_matrix(matrix(x, ncol = 1), label)   # 单变量裸向量
      if (!is.null(n_ref) && nrow(m) != n_ref)
        stop(sprintf("%s: 样本数不一致（给了 %d 个值，参照 %d 个样本）", label, nrow(m), n_ref))
      return(m)
    }
    if (is.data.frame(x)) return(to_numeric_matrix(as.matrix(x), label))
    if (!is.list(x) || length(x) == 0)
      stop(sprintf(paste0("%s: 数据为空或 JSON 结构无法识别。可用格式：",
                          "[[...],[...]] 二维数组 / {\"Sample1\":[...]} 行字典 / ",
                          "{\"Age\":[...]} 列字典"), label))
    if (!all(vapply(x, function(v) is.atomic(v) && !is.null(v), logical(1))))
      stop(sprintf("%s: 含嵌套结构，请改用二维数组 [[...],[...]]", label))
    lens <- vapply(x, length, integer(1))
    if (any(lens != lens[1L]))
      stop(sprintf("%s: 各记录长度不一致(%s)，请检查是否有缺失列或漏填值",
                   label, paste(unique(lens), collapse = "/")))
    k <- length(x); L <- lens[1L]
    as_rowdict <- if (is.null(n_ref)) TRUE else (k == n_ref)
    if (!as_rowdict) {
      if (L != n_ref)
        stop(sprintf(paste0("%s: 样本数无法对齐（记录数=%d, 每条长度=%d, 期望样本数=%d）。",
                            "行字典请让记录数等于样本数；列字典请让每条数组长度等于样本数"),
                     label, k, L, n_ref))
      # 列字典：键=变量 -> 每个向量成为一列，天然 n × p
      return(to_numeric_matrix(
        as.matrix(as.data.frame(x, check.names = FALSE, stringsAsFactors = FALSE)), label))
    }
    # 行字典：键=样本 -> 先拼成 p × k 再转置为 k × p
    m <- as.matrix(as.data.frame(x, check.names = FALSE, stringsAsFactors = FALSE))
    return(to_numeric_matrix(t(m), label))
  }

  # 中介矩阵用对象格式时，“记录数”与“每条长度”谁是样本数存在二义，
  # 靠 X/Y/Z 的已知维度反推；都推不出时逐个候选尝试，取能全部对齐的那个。
  med_candidates <- function(x) {
    if (is.matrix(x)) return(nrow(x))
    if (is.atomic(x) && is.null(dim(x))) return(length(x))
    if (is.list(x) && length(x) > 0) {
      lens <- vapply(x, function(v) if (is.atomic(v)) length(v) else -1L, integer(1))
      if (any(lens < 0L) || any(lens != lens[1L])) return(length(x))
      return(unique(c(length(x), lens[1L])))   # 优先行字典（与前端示例/导入一致）
    }
    NULL
  }

  resolve_mats <- function(params) {
    fixed_n <- NULL
    for (v in list(params$predictorData, params$outcomeData, params$covariates)) {
      if (is.matrix(v)) { fixed_n <- nrow(v); break }
      if (is.atomic(v) && is.null(dim(v))) { fixed_n <- length(v); break }
    }
    cands <- if (!is.null(fixed_n)) fixed_n else med_candidates(params$mediatorData)
    if (is.null(cands) || length(cands) == 0)
      stop("mediatorData 为空或结构无法识别")
    last_err <- NULL
    for (n_try in cands) {
      r <- tryCatch(list(
        med  = to_num_matrix(params$mediatorData,  "mediatorData (中介 M)", n_try),
        pred = to_num_matrix(params$predictorData, "predictorData (暴露 X)", n_try),
        out  = to_num_matrix(params$outcomeData,   "outcomeData (结局 Y)",   n_try),
        z    = if (is.null(params$covariates)) NULL
               else to_num_matrix(params$covariates, "covariates (协变量 Z)", n_try)),
        error = function(e) e)
      if (!inherits(r, "error")) {
        if (length(cands) > 1)
          cat("[PERMANOVA-med] 对象格式中介矩阵按 样本数=", n_try, "解析（", ncol(r$med), " 个变量）\n")
        return(r)
      }
      last_err <- r
    }
    stop(paste0("输入数据无法解析为「样本 × 变量」矩阵",
               "（尝试过的样本数候选：", paste(cands, collapse = " / "), "）。",
               "最后一次错误：", conditionMessage(last_err),
               "。可用格式：[[...],[...]] 二维数组 / {\"Sample1\":[...]} 行字典 / {\"Age\":[...]} 列字典"))
  }

  # ---------- 读取数据 ----------
  # 语义映射（符合 LDM 的中介定义）：
  #   mediatorData  -> 公式左侧矩阵 = 中介（如微生物组 OTU 表 / 距离矩阵）
  #   predictorData -> 第 1 组协变量 = 暴露 X
  #   outcomeData   -> 第 2 组协变量 = 结局 Y
  parsed    <- resolve_mats(params)
  med_mat   <- parsed$med
  pred_mat  <- parsed$pred
  out_mat   <- parsed$out
  z_mat     <- parsed$z
  n_samples <- nrow(med_mat)

  # 实测下限（扫过 n=4..20 × perm=100/1000 × 有/无协变量）：
  #   n=4        必崩（无 Z：BiocParallel errors；有 Z：下标出界）
  #   n=5        看运气（无 Z 且 perm=1000 时 NA 相关崩溃）
  #   n>=6       都能跑完
  # 旧版本写“至少 4 个样本”，于是 n=4/5 会被放行到一个跟用户输入毫无关系的内部错。
  if (n_samples < 6)
    stop(sprintf(paste0(
      "样本数过少（%d）。LDM 的多元置换在 n<=4 直接崩、n=5 会随机崩（本次实测），至少需要 6 个样本；",
      "而 n<15 的中介检验功效极低（即使真有效应也很可能报不显著），建议 n>=20"),
      n_samples))

  # ---------- 坑 1：规整置换次数到 100 的整数倍 ----------
  n_perm_req <- suppressWarnings(as.numeric(params$permutations %|||% 999))
  if (is.na(n_perm_req) || n_perm_req < 100) n_perm_req <- 100
  n_perm <- ceiling(n_perm_req / 100) * 100
  if (n_perm != n_perm_req)
    cat("[PERMANOVA-med] 注意：置换次数由", n_perm_req, "调整为", n_perm,
        "(LDM 要求 100 的整数倍)\n")

  cat("[PERMANOVA-med] mediator 矩阵:", nrow(med_mat), "x", ncol(med_mat), "\n")
  cat("[PERMANOVA-med] exposure   (X):", ncol(pred_mat), "个变量\n")
  cat("[PERMANOVA-med] outcome    (Y):", ncol(out_mat), "个变量\n")
  cat("[PERMANOVA-med] 置换次数:", n_perm, "\n")

  # ---------- 距离矩阵 vs 计数矩阵 ----------
  # 若传入的是对称方阵，LDM 会直接当距离矩阵用
  is_dist <- (nrow(med_mat) == ncol(med_mat)) && isSymmetric(unname(med_mat))

  # scale.otu.table：含负值时必须为 FALSE
  scale_otu <- TRUE
  if (!is_dist && any(med_mat < 0, na.rm = TRUE)) {
    scale_otu <- FALSE
    cat("[PERMANOVA-med] 中介矩阵含负值 -> scale.otu.table = FALSE\n")
  }
  if (is_dist) scale_otu <- FALSE

  # ---------- 构造 data.frame（协变量） ----------
  df <- data.frame(row.names = paste0("S", seq_len(n_samples)))

  encode_var <- function(v) {
    if (is.logical(v)) v <- as.numeric(v)
    if (is.character(v)) {
      u <- unique(v[!is.na(v)])
      return(if (length(u) == 2) as.numeric(factor(v)) else factor(v))
    }
    if (!is.numeric(v)) return(factor(v))
    u <- unique(v[!is.na(v)])
    if (length(u) <= 10 && all(v == floor(v), na.rm = TRUE)) {
      return(if (length(u) == 2) as.numeric(factor(v)) else factor(v))
    }
    as.numeric(v)
  }

  fmt_block <- function(mat, prefix) {
    nms <- character(0)
    for (i in seq_len(ncol(mat))) {
      nm <- paste0(prefix, i)
      df[[nm]] <<- encode_var(mat[, i])
      nms <- c(nms, nm)
    }
    nms
  }

  x_names <- fmt_block(pred_mat, "X")
  y_names <- fmt_block(out_mat,  "Y")

  # 协变量 Z（可选，作为混杂项放在 | 之后）
  conf_names <- character(0)
  if (!is.null(z_mat)) {
    # 协变量不再静默丢弃：格式错误直接报错，避免用户以为做了混杂校正
    for (i in seq_len(ncol(z_mat))) {
      nm <- paste0("Z", i)
      df[[nm]] <- encode_var(z_mat[, i])
      conf_names <- c(conf_names, nm)
    }
    cat("[PERMANOVA-med] 协变量 Z:", length(conf_names), "个\n")
  }

  # ---------- 坑 2：组语法，一组内多变量需加括号 ----------
  grp <- function(nms) if (length(nms) == 1) nms else paste0("(", paste(nms, collapse = " + "), ")")

  lhs <- "MEDMAT"
  # 混杂项写在左侧矩阵之后： MEDMAT | Z1 + Z2 ~ X + Y
  if (length(conf_names) > 0)
    lhs <- paste0(lhs, "|", paste(conf_names, collapse = "+"))

  formula_str <- paste(lhs, "~", grp(x_names), "+", grp(y_names))
  # 打印时还原空格方便阅读
  cat("[PERMANOVA-med] 公式:", gsub("\\s*", "", formula_str), "\n")

  # MEDMAT 必须能在 LDM 的查找路径中找到
  MEDMAT <- med_mat
  assign("MEDMAT", med_mat, envir = .GlobalEnv)

  # ---------- 运行 ----------
  # 常量列先进去报错：否则 LDM 只给“对比只适用于有两个或多于两个水平的因子”，
  # 看不出是哪个变量、为什么不能是常量（用户手填数据最常踩的一个坑）
  const_cols <- names(df)[sapply(df, function(v) length(unique(v[!is.na(v)])) < 2)]
  if (length(const_cols))
    stop(sprintf(paste0(
      "这些变量只有一个取值（常量），没法检验：%s。X 需要至少两个水平/取值；",
      "Y、M 的变量列全相同时请删掉该列或补真实变异"),
      paste(const_cols, collapse = ', ')))

  # 饱和设计也拦住：encode_var 会把“<=10 个不同整数值”的列当因子，于是
  # 整岁记录的年龄（10 个样本 10 个不同岁）会变成 10 水平因子，模型吃掉全部自由度，
  # LDM 只回一句“需要TRUE/FALSE值的地方不可以用缺少值”——跟真实原因完全看不出关系。
  rank_needed <- 1L + sum(vapply(df, function(v)
    if (is.factor(v)) nlevels(v) - 1L else 1L, integer(1)))
  if (rank_needed >= n_samples) {
    big <- head(order(-sapply(df, function(v) if (is.factor(v)) nlevels(v) else 1)), 3)
    stop(sprintf(paste0(
      "设计数矩阵自由度不够：%d 个样本只能支撑 %d 列（公式实际需要 %d），水平最多的变量是 %s。",
      "常见原因：协变量用了整数值记录连续量（如年龄逐行写 28/29/30…）被当成了多水平因子——",
      "请把它保留小数（如 28.4）或先分成少数几档；要么增加样本数"),
      n_samples, n_samples - 1L, rank_needed,
      paste(sprintf("%s(%d 水平)", names(df)[big], sapply(df[big], function(v) if (is.factor(v)) nlevels(v) else 1)),
            collapse = ', ')))
  }

  cat("[PERMANOVA-med] 运行 permanovaFL (test.mediation = TRUE) ...\n")
  ldm_err <- NULL
  res <- tryCatch(
    LDM::permanovaFL(
      formula          = as.formula(formula_str),
      data             = df,
      scale.otu.table  = scale_otu,
      n.perm.max       = n_perm,
      test.mediation   = TRUE,
      seed             = if (is.null(params$seed)) 12345L else as.integer(params$seed),
      verbose          = FALSE
    ),
    error = function(e) {
      ldm_err <<- conditionMessage(e)
      cat("[PERMANOVA-med] permanovaFL 错误:", ldm_err, "\n"); NULL
    }
  )

  if (is.null(res))
    stop(paste0(
      "permanovaFL 分析失败。LDM 原话：", if (is.null(ldm_err)) "（未拿到错误信息）" else ldm_err,
      "。常见原因：置换次数不是 100 的整数倍、mediatorData 不是非负计数矩阵或对称距离矩阵、",
      "样本数太少（本版本要求 n>=6）"
    ))

  # ---------- 提取结果 ----------
  cat("[PERMANOVA-med] 提取结果...\n")
  fs  <- suppressWarnings(as.numeric(res$F.statistics))
  rs  <- suppressWarnings(as.numeric(res$R.squared))
  pv  <- suppressWarnings(as.numeric(res$p.permanova))
  nmn <- names(res$F.statistics)
  if (is.null(nmn)) nmn <- paste0("cov", seq_along(fs))

  cov_terms <- lapply(seq_along(fs), function(i) {
    list(
      term        = if (i == 1) "exposure (X)" else if (i == 2) "outcome (Y)" else nmn[i],
      label       = nmn[i],
      F_statistic = fs[i] %|||% NA,
      R2          = rs[i] %|||% NA,
      p_value     = pv[i] %|||% NA
    )
  })

  med_p   <- suppressWarnings(as.numeric(res$med.p.permanova))[1] %|||% NA
  med_pom <- suppressWarnings(as.numeric(res$med.p.permanova.omni))[1]

  # ---------- 图表数据（全部现算，不编造） ----------
  # LDM 的 permanovaFL 只返回 p 值，不返回置换零分布，所以不做“置换分布直方图”；
  # 改用可在本数据上真实计算的：Bray-Curtis PCoA 排序、标准化路径系数与其
  # 普通理论 CI、bootstrap 间接效应 CI、相关矩阵。路径系数用群落第一轴（PCoA axis1）
  # 作为中介变量的标量代表，这是组成型数据常用的降维做法。
  build_chart_data <- function(med_mat, pred_mat, out_mat, n_perm) {
    cd <- list()
    x1 <- as.numeric(pred_mat[, 1])
    y1 <- as.numeric(out_mat[, 1])

    # -- Bray-Curtis PCoA (cmdscale) --
    pcoa_pts <- NULL; ax_pct <- NULL
    dist_mat <- NULL
    if (requireNamespace("vegan", quietly = TRUE)) {
      dist_mat <- tryCatch(vegan::vegdist(med_mat, method = "bray"), error = function(e) NULL)
    }
    if (is.null(dist_mat)) dist_mat <- tryCatch(dist(med_mat), error = function(e) NULL)
    if (!is.null(dist_mat)) {
      fit <- tryCatch(stats::cmdscale(dist_mat, k = 2, eig = TRUE), error = function(e) NULL)
      if (!is.null(fit)) {
        ev <- pmax(fit$eig, 0)
        ax_pct <- as.numeric(round(100 * ev / sum(ev), 2))[1:2]
        pcoa_pts <- as.matrix(fit$points)
      }
    }

    # -- 中介标量轴：优先用 PCoA axis1，失败则用第一个主成分 --
    m_axis <- if (!is.null(pcoa_pts)) pcoa_pts[, 1] else {
      pc <- stats::prcomp(scale(med_mat, center = TRUE, scale. = FALSE), retx = TRUE)$x[, 1]
      pc
    }
    # 方指向与 X 一致，保证 a 路径符号可读
    # 注意：cor(向量, 向量) 在本 R 版本里是无 dim 的标量，不能用 [1,1] 索引
    cv <- suppressWarnings(as.numeric(stats::cor(m_axis, x1))[1L])
    if (is.finite(cv) && cv < 0) m_axis <- -m_axis
    if (!is.null(pcoa_pts)) pcoa_pts[, 1] <- m_axis

    # 标准化（R 里多条语句必须分行或加花括号，写成一行会被当成函数调用）
    z <- function(v) {
      s <- stats::sd(v)
      if (!is.finite(s) || s == 0) return(v * 0)
      (v - mean(v)) / s
    }
    xs <- z(x1); ys <- z(y1); ms <- z(m_axis)

    fit_a  <- tryCatch(stats::lm(ms ~ xs), error = function(e) NULL)
    fit_bc <- tryCatch(stats::lm(ys ~ ms + xs), error = function(e) NULL)
    fit_c  <- tryCatch(stats::lm(ys ~ xs), error = function(e) NULL)
    cf <- function(f, nm) {
      if (is.null(f)) return(c(est = NA, se = NA, p = NA))
      s <- summary(f)$coefficients
      if (!nm %in% rownames(s)) return(c(est = NA, se = NA, p = NA))
      c(est = unname(s[nm, "Estimate"]), se = unname(s[nm, "Std. Error"]), p = unname(s[nm, 4]))
    }
    a  <- cf(fit_a,  "xs")
    b  <- cf(fit_bc, "ms")
    cp <- cf(fit_bc, "xs")
    ct <- cf(fit_c,  "xs")
    ci <- function(c_) c(lo = c_["est"] - 1.96 * c_["se"], hi = c_["est"] + 1.96 * c_["se"])

    # -- 间接效应 a*b 的 bootstrap CI（固定种子，保证可复现） --
    indirect <- a["est"] * b["est"]
    set.seed(if (is.null(params$seed)) 12345L else as.integer(params$seed))
    boot <- replicate(500L, {
      i <- sample.int(length(xs), length(xs), replace = TRUE)
      ba <- tryCatch(as.numeric(stats::coef(stats::lm(ms[i] ~ xs[i]))[2]), error = function(e) NA)
      bb <- tryCatch(as.numeric(stats::coef(stats::lm(ys[i] ~ ms[i] + xs[i]))[2]), error = function(e) NA)
      ba * bb
    })
    boot <- boot[is.finite(boot)]
    boot_ci <- if (length(boot) >= 100)
      as.numeric(quantile(boot, c(0.025, 0.975))) else c(NA, NA)

    cd$path <- list(
      a = unname(a["est"]), a_p = unname(a["p"]), a_ci = ci(a),
      b = unname(b["est"]), b_p = unname(b["p"]), b_ci = ci(b),
      c_prime = unname(cp["est"]), c_prime_p = unname(cp["p"]), c_prime_ci = ci(cp),
      total = unname(ct["est"]), total_p = unname(ct["p"]),
      indirect = unname(indirect), indirect_ci = boot_ci,
      proportion_mediated = if (is.finite(ct["est"]) && abs(ct["est"]) > 1e-8)
        as.numeric(indirect / ct["est"]) else NA
    )

    cors <- stats::cor(data.frame(X1 = x1, M_axis = m_axis, Y1 = y1), use = "pairwise.complete.obs")
    cd$correlation <- list(labels = colnames(cors), matrix = unname(round(cors, 4)))
    cd$samples <- list(
      x  = round(as.numeric(x1), 6),
      y  = round(as.numeric(y1), 6),
      m  = round(as.numeric(m_axis), 6),
      pcoa = if (is.null(pcoa_pts)) NULL else lapply(seq_len(nrow(pcoa_pts)), function(i) round(pcoa_pts[i, ], 4))
    )
    cd$pcoa_axes <- if (is.null(ax_pct)) NULL else round(ax_pct, 2)
    cd$x_var_name <- names(x_names)[1] %|||% "X1"
    cd$y_var_name <- names(y_names)[1] %|||% "Y1"
    cd$note <- "路径系数为标准化回归系数，中介变量用 Bray-Curtis PCoA 第一轴代表；LDM 不提供置换零分布，故未画置换分布图。"
    cd
  }

  chart_data <- tryCatch(build_chart_data(med_mat, pred_mat, out_mat, n_perm),
                         error = function(e) {
                           cat("[PERMANOVA-med] 图表数据生成失败（不影响主结果）:", conditionMessage(e), "\n")
                           NULL
                         })

  output <- list(
    success      = TRUE,
    method       = "PERMANOVA-med (LDM permanovaFL)",
    ldm_version  = as.character(packageVersion("LDM")),
    sample_size  = n_samples,
    n_perm_requested = n_perm_req,
    n_perm_used  = n_perm,
    n_perm_completed = as.numeric(res$n.perm.completed %|||% NA),
    mediation_p  = med_p,
    mediation_p_omni = if (length(med_pom) && !is.na(med_pom)) med_pom else NULL,
    significant_mediation = if (!is.na(med_p)) med_p < 0.05 else NA,
    covariate_tests = cov_terms,
    chart_data   = chart_data,
    model_info = list(
      formula              = gsub("\\s*", "", formula_str),
      role_left            = "mediator (matrix / distance)",
      role_cov1            = "exposure X",
      role_cov2            = "outcome Y",
      mediator_is_distance = is_dist,
      scale_otu_table      = scale_otu,
      mediator_dim         = paste(nrow(med_mat), "x", ncol(med_mat)),
      exposure_vars        = length(x_names),
      outcome_vars         = length(y_names),
      confounder_vars      = length(conf_names)
    ),
    interpretation = if (!is.na(med_p) && med_p < 0.05) {
      "检测到显著的中介效应：中介变量（左侧矩阵所代表的组群/多变量）在 X -> Y 通路中起显著中介作用。"
    } else if (!is.na(med_p)) {
      "中介效应不显著 (p >= 0.05)。"
    } else {
      "无法判定中介效应。"
    },
    timestamp = format(Sys.time(), "%Y-%m-%d %H:%M:%S")
  )

  # jsonlite 默认 digits=4（4 位有效数字）会让 c'+a*b 与 total 差出 1e-4，
  # 前端做分解自洽校验与绘制时精度不够，故取 10 位有效数字。
  writeLines(jsonlite::toJSON(output, auto_unbox = TRUE, pretty = TRUE, null = "null", digits = 10),
             output_file)

  cat("[PERMANOVA-med] 完成 -> ", output_file, "\n")
  cat("[PERMANOVA-med] 中介效应 p =", med_p, "\n")

}, error = function(e) {
  msg <- paste("[PERMANOVA-med] Error:", conditionMessage(e))
  cat(msg, "\n")
  writeLines(msg, error_file)
  quit(status = 1)
})
