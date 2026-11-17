# ============================================================================
# 导出 R 运行时锁定文件 r-runtime.lock.json
# ----------------------------------------------------------------------------
# 目的：把「这台机器上跑通过 25 模板回归的那套 R + 包版本」变成可复制的声明，
#       替代「把 603MB 运行时二进制往 git 里塞」的做法。
#
# 用法（项目根目录）：
#   r-portable/bin/Rscript.exe r-scripts/tools/export_r_lockfile.R [输出路径]
#
# 输出内容：
#   r_version / library_path / 包清单（版本、是否需要编译、直接依赖、来源仓库）
#   required   : 每个功能模块必需哪些包（装配脚本与 checkR 据此报错）
#   optional   : 只在特定分析里才需要
#   verify     : 装完后必须通过的冒烟测试脚本
#   release    : GitHub Release 附件槽位（上传后把 url/sha256 填回来）
# ============================================================================

out_path <- if (length(commandArgs(trailingOnly = TRUE)) >= 1) commandArgs(trailingOnly = TRUE)[1] else "r-runtime.lock.json"

ip <- installed.packages()

# ---- 来源探测 ------------------------------------------------------------
# Bioconductor 包通常带 biocViews 字段；CRAN 的 base/recommended 有 Priority。
is_bioconductor <- function(pkg) {
  d <- tryCatch(packageDescription(pkg), error = function(e) NULL)
  if (is.null(d)) return(FALSE)
  bv <- d[["biocViews"]]
  !is.null(bv) && nzchar(bv)
}

base_pkgs <- "base"

# ---- 功能模块 -> 必需包 --------------------------------------------------
# 与 r-scripts/*.R 里的 required_packages 检查保持一致（改脚本要同步改这里）
required <- list(
  permanova = list(
    script = "permanova.R",
    packages = c("jsonlite", "vegan"),
    note = "距离矩阵置换多元方差分析；自算 F 与 vegan::adonis2 已对齐验证"
  ),
  permanova_med = list(
    script = "permanova_med.R",
    packages = c("jsonlite", "LDM", "vegan"),
    note = "中介分析依赖 LDM::permanovaFL；置换次数必须是 100 的整数倍（LDM 内部 n.perm.block=100）"
  ),
  nonrandom_permanova = list(
    script = "nonrandom_permanova.R",
    packages = c("jsonlite", "vegan"),
    note = "受限/分层/空间置换，F 由本脚本自算，不需要 LDM"
  ),
  gmr4 = list(
    script = "gmr4.R",
    packages = c("jsonlite", "Matrix", "glmnet"),
    note = "glmnet 缺失时脚本会退化为内置坐标下降求解器，但精度与收敛性以 glmnet 为准"
  ),
  bayesian_era = list(
    script = "bayesian_era_mediation.R",
    packages = c("jsonlite", "MASS"),
    note = "自写 Gibbs 采样，不依赖 rstan（rstan 需要 C++ 工具链，便携版装不了）"
  )
)

all_required <- unique(unlist(lapply(required, function(x) x$packages)))

# ---- 包清单 --------------------------------------------------------------
pkgs <- sort(rownames(ip))
entries <- lapply(pkgs, function(p) {
  pr <- ip[p, "Priority"]
  src <- if (!is.na(pr) && pr == "base") "R-base" else if (is_bioconductor(p)) "Bioconductor" else "CRAN"
  dep <- tryCatch({
    d <- packageDescription(p)
    v <- paste(d$Imports, d$Depends)
    v <- unlist(strsplit(gsub("[[:space:]]", "", v), ","))
    pos <- regexpr("(", v, fixed = TRUE)                 # 去掉 "pkg (>= 1.0)" 的版本限定
    v <- ifelse(pos > 0, substring(v, 1, pos - 1), v)
    unique(setdiff(v, c("", "R")))
  }, error = function(e) character(0))
  list(
    name = p,
    version = ip[p, "Version"],
    priority = if (is.na(pr)) NA else pr,
    source = src,
    needs_compile = identical(ip[p, "NeedsCompilation"], "TRUE"),
    required_by = if (p %in% all_required) paste(sub("_permanent", "", names(all_required)[all_required == p]), collapse = ",") else NA,
    depends = dep
  )
})

# required_by 的名字匹配：all_required 是包名向量，索引名可能重复，重新算一遍更稳
pkg_to_features <- list()
for (nm in names(required)) for (p in required[[nm]]$packages) pkg_to_features[[p]] <- c(pkg_to_features[[p]], nm)
entries <- lapply(entries, function(e) {
  f <- pkg_to_features[[e$name]]
  e$required_by <- if (is.null(f)) NA else paste(f, collapse = ",")
  e
})

missing_required <- character(0)
for (nm in names(required)) {
  miss <- setdiff(required[[nm]]$packages, pkgs)
  if (length(miss)) missing_required <- c(missing_required, paste0(nm, ":", paste(miss, collapse = "|")))
}

# LDM 声明了 modeestR 但代码里没引用；直接查命名空间里的函数体，比 grep 安装文件可靠
#（安装后的 R 代码是 RdBD 二进制，grep 不出来）
declared_but_unused <- list()
if ("LDM" %in% pkgs) {
  d <- packageDescription("LDM")
  imp <- unlist(strsplit(gsub("[[:space:]]", "", d$Imports), ","))
  pos <- regexpr("(", imp, fixed = TRUE)
  imp <- ifelse(pos > 0, substring(imp, 1, pos - 1), imp)
  imp <- setdiff(imp, c("", "R"))
  absent <- setdiff(imp, pkgs)
  if (length(absent)) {
    ns <- asNamespace("LDM")
    body_text <- paste(unlist(lapply(ls(ns, all.names = TRUE), function(nm) {
      o <- get(nm, envir = ns)
      if (is.function(o)) paste(deparse(o), collapse = "") else ""
    })), collapse = "")
    used <- any(sapply(absent, function(p) grepl(p, body_text, fixed = TRUE)))
    declared_but_unused[["LDM"]] <- list(missing = absent, referenced_in_code = used)
  }
}

lock <- list(
  schema_version = 1,
  generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
  generated_by = "r-scripts/tools/export_r_lockfile.R",
  r = list(
    version = as.character(getRversion()),
    min_required = "4.3.0",
    note = "4.3.3 与 4.6.1 已做过 A/B：25 个中介模板统计量逐条一致；脚本一律自带 %||% 兜底，不依赖 R>=4.4",
    library_path = normalizePath(.libPaths()[1], winslash = "/", mustWork = FALSE)
  ),
  package_count = length(pkgs),
  packages = entries,
  required = required,
  missing_required = if (length(missing_required)) missing_required else NA,
  declared_but_unused = declared_but_unused,
  verify = list(
    script = "r-scripts/tools/verify_r_runtime.R",
    smoke = list(
      "node r-scripts/tools/verify_med_templates.mjs",
      "node r-scripts/tools/test_med_charts.mjs",
      "node r-scripts/tools/ab_r_version.mjs"
    )
  ),
  release = list(
    kind = "github-release-asset",
    repo = "beifusheng/multivariateAnalysis",
    tag = NA,
    asset = "r-portable-4.6.1-win-x64.zip",
    url = NA,
    sha256 = NA,
    size_bytes = NA,
    note = "运行时装 Release 附件而不是 LFS：不占 LFS 流量额度，且支持断点续传。上传后把 tag/url/sha256/size_bytes 填回本文件。"
  )
)

json <- jsonlite::toJSON(lock, auto_unbox = TRUE, pretty = TRUE, null = "null", na = "null")
writeLines(json, out_path)

cat("已写出", out_path, "\n")
cat("  R 版本:", lock$r$version, "| 包数:", lock$package_count, "\n")
cat("  CRAN:", sum(sapply(entries, function(e) e$source == "CRAN")),
    "| Bioconductor:", sum(sapply(entries, function(e) e$source == "Bioconductor")),
    "| R 自带:", sum(sapply(entries, function(e) e$source == "R-base")), "\n")
if (length(missing_required)) cat("  !! 功能缺包:", paste(missing_required, collapse = "; "), "\n") else cat("  必需包: 全部就位\n")
if (length(declared_but_unused)) {
  for (nm in names(declared_but_unused)) {
    cat("  提示:", nm, "声明但未安装:", paste(declared_but_unused[[nm]]$missing, collapse = ","),
        "| 代码中被引用:", declared_but_unused[[nm]]$referenced_in_code, "\n")
  }
}
