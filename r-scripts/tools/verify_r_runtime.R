# ============================================================================
# 校验 R 运行时是否满足 r-runtime.lock.json 的声明
# ----------------------------------------------------------------------------
# 用途：装配脚本跑完后、或部署到现场机器后，一条命令判断「能不能用」。
#       以前要等用户点「运行分析」才知道 LDM 没装，这个脚本把问题提前暴露。
#
# 用法：
#   r-portable/bin/Rscript.exe r-scripts/tools/verify_r_runtime.R [--lock r-runtime.lock.json] [--json 输出路径]
#
# 退出码：0 = 全部通过；1 = 缺包/版本不符/API 不符；2 = 冒烟分析失败
# ============================================================================

args <- commandArgs(trailingOnly = TRUE)

# 用自身位置定位项目根（<ROOT>/r-scripts/tools/xxx.R），这样从任何目录调用都能跑
fa <- commandArgs(trailingOnly = FALSE)
self <- sub("^--file=", "", grep("^--file=", fa, value = TRUE))
self <- if (length(self)) self[1] else NA_character_
ROOT <- if (!is.na(self) && nzchar(self)) normalizePath(file.path(dirname(dirname(dirname(self)))), winslash = "/") else normalizePath(".", winslash = "/")
setwd(ROOT)

json_args <- grep("^--json=", args, value = TRUE)
json_out <- if (length(json_args)) sub("^--json=", "", json_args[1]) else NULL
pos <- args[!grepl("^--", args)]
lock_path <- if (length(pos)) pos[1] else file.path(ROOT, "r-runtime.lock.json")

`%NULL%` <- function(a, b) if (is.null(a)) b else a

fails <- character(0)
warns <- character(0)
notes <- character(0)
say <- function(tag, msg) cat(sprintf("[%s] %s\n", tag, msg))

if (!file.exists(lock_path)) {
  say("FAIL", paste("找不到锁定文件:", lock_path, "（先跑 r-scripts/tools/export_r_lockfile.R）"))
  quit(status = 1)
}
lock <- jsonlite::fromJSON(lock_path, simplifyVector = FALSE)

# ---- 1. R 本身 ----
rv <- getRversion()
min_r <- tryCatch(package_version(lock$r$min_required %NULL% "4.3.0"), error = function(e) NULL)
say("OK", sprintf("R 版本 %s（锁定文件记录 %s）", rv, lock$r$version))
if (!is.null(min_r) && rv < min_r) {
  fails <- c(fails, sprintf("R 版本 %s 低于要求的 %s", rv, min_r))
}
if (as.character(rv) != lock$r$version) {
  warns <- c(warns, sprintf("当前 R %s 与锁定文件记录的 %s 不同；已做过 A/B 的版本才可信", rv, lock$r$version))
}

# ---- 2. 必需包（按功能模块）----
ip <- installed.packages()
have <- rownames(ip)
req_map <- lock$required
if (is.null(req_map)) {
  fails <- c(fails, "锁定文件里没有 required 段（版本太旧？重新导出）")
} else {
  for (feat in names(req_map)) {
    pk <- unlist(req_map[[feat]]$packages)
    miss <- setdiff(pk, have)
    if (length(miss)) {
      fails <- c(fails, sprintf("%s(%s) 缺包: %s", feat, req_map[[feat]]$script, paste(miss, collapse = ", ")))
    } else {
      say("OK", sprintf("%-20s 依赖齐全: %s", feat, paste(pk, collapse = ", ")))
    }
  }
}

# ---- 3. 锁定版本一致性（只比对 required 里点名的包，避免为无关包报错）----
locked <- data.frame(
  name = vapply(lock$packages, function(p) p$name, character(1)),
  version = vapply(lock$packages, function(p) as.character(p$version), character(1)),
  required_by = vapply(lock$packages, function(p) as.character(p$required_by %NULL% NA), character(1)),
  stringsAsFactors = FALSE
)
watch <- locked[!is.na(locked$required_by), ]
for (i in seq_len(nrow(watch))) {
  p <- watch$name[i]
  if (!p %in% have) next                             # 已在上面报过
  cur <- ip[p, "Version"]
  if (cur != watch$version[i]) {
    warns <- c(warns, sprintf("%s 版本 %s != 锁定 %s（回归验证是在锁定版本上做的）", p, cur, watch$version[i]))
  }
}

# ---- 4. 关键 API 形状（历史上 LDM 换过签名，这里钉住）----
if ("LDM" %in% have) {
  if (!exists("permanovaFL", envir = asNamespace("LDM"))) {
    fails <- c(fails, "LDM 里没有 permanovaFL 函数")
  } else {
    fml <- names(formals(get("permanovaFL", envir = asNamespace("LDM"))))
    say("OK", paste("permanovaFL 形参:", paste(fml, collapse = ", ")))
    txt <- paste(deparse(get("permanovaFL", envir = asNamespace("LDM"))), collapse = " ")
    if (grepl("n.perm.block", txt, fixed = TRUE)) {
      m <- regmatches(txt, regexpr("n.perm.block[[:space:]]*(<-|=)[[:space:]]*[0-9]+", txt))
      b <- if (nzchar(m)) as.integer(sub(".*[<-|=][[:space:]]*([0-9]+).*", "\\1", m)) else NA_integer_
      notes <- c(notes, sprintf("LDM 内部 n.perm.block=%s -> 置换次数必须是它的整数倍（分析脚本已自动上调）",
                                if (is.na(b)) "?" else b))
    } else {
      warns <- c(warns, "LDM 的 permanovaFL 里没找到 n.perm.block：该版本可能不再要求置换次数为 100 的倍数，请重跑 25 模板回归确认")
    }
  }
}
if (!("adonis2" %in% getNamespaceExports("vegan"))) fails <- c(fails, "vegan 里没有 adonis2")

# ---- 5. 冒烟：真的跑一次 mediation 与一次受限置换 PERMANOVA ----
smoke_dir <- file.path(tempdir(), "nr_smoke")
dir.create(smoke_dir, showWarnings = FALSE, recursive = TRUE)
set.seed(4242L)
n <- 24L; sp <- 12L
otu <- matrix(rpois(n * sp, 5), n)
# 分层变量必须与分组**交叉**，不能重合。
# 旧写法是 grp = rep(c("A","B"), each=12)、strata = rep(c("B1","B2"), each=12)，
# 两者完全对齐 ⇒ 每个层内只有一种 group 水平 ⇒ 受限置换什幺也交换不了，
# p_受限 永远等于 1——跟效应有没有完全无关。那条冒烟始终在测一条死路（之前打印的
# “p_受限=1”就被当成“无效应”看了）。现在：4 个层，每层 3 A + 3 B。
grp <- rep(rep(c("A", "A", "A", "B", "B", "B"), each = 1), 4)
strata <- rep(paste0("B", 1:4), each = 6)
# mediator 用非负值：负值会让 vegdist(bray) 报警告（“results may be meaningless”），
# 冲烟测试要干净，不然真正的问题会被警告洗掉
med <- matrix(rpois(n * 4, 3), n)
# 中介冒烟的结局矩阵必须是**连续量**：整数列会被当多水平因子，
# 12 列 × 每列 10 水平 = 100 列设计，24 个样本根本撑不起——
# permanova_med.R 现在会直接拒绝（旧版不拒，而是在 100 列欠定设计上“跑成功”给出无意义的 p，
# 那正是守卫要防的事）。这里加小数是为了让夹具本身站得住。
outcome <- otu + matrix(runif(n * sp, 0.01, 0.99), n)
mk <- function(x) { m <- as.matrix(x); dimnames(m) <- NULL; m }

tryCatch({
  inp <- list(
    predictorData = mk(data.frame(x = as.numeric(grp == "A"))),
    mediatorData = mk(med),
    outcomeData = mk(outcome),
    formula = "grp",
    n.perm.max = 100L                        # 必须 100 的倍数
  )
  writeLines(jsonlite::toJSON(inp, auto_unbox = TRUE), file.path(smoke_dir, "med.json"))
  st <- system2(file.path(R.home("bin"), "Rscript.exe"),
                c("r-scripts/permanova_med.R",
                  shQuote(file.path(smoke_dir, "med.json")),
                  shQuote(file.path(smoke_dir, "med.out.json")),
                  shQuote(file.path(smoke_dir, "med.err.txt"))))
  if (st != 0) {
    err <- tryCatch(readLines(file.path(smoke_dir, "med.err.txt"), warn = FALSE), error = function(e) "")
    fails <- c(fails, paste0("PERMANOVA-med 冒烟失败(exit ", st, "): ", paste(err, collapse = " | ")))
  } else {
    o <- jsonlite::fromJSON(file.path(smoke_dir, "med.out.json"), simplifyVector = FALSE)
    if (!isTRUE(o$success)) {
      fails <- c(fails, "PERMANOVA-med 冒烟返回 success!=true")
    } else {
      # 字段位置曾经写错过（读 o$result$mediation_p，而引擎把它放在顶层），
      # 而 sprintf("%s", character(0)) 不报错——它返 character(0)，cat 就一个字也不打。
      # 结果这条“✓”一直silently 缺席，冒烟实际上什么都没验。现在：字段取对 + 取不到就 FAIL。
      p_med <- suppressWarnings(as.numeric(unlist(o$mediation_p)))
      done_perm <- suppressWarnings(as.numeric(unlist(o$n_perm_completed)))
      if (length(p_med) != 1L || is.na(p_med) || p_med < 0 || p_med > 1) {
        fails <- c(fails, paste0("PERMANOVA-med 冒烟的 mediation_p 不是一个 [0,1] 数：",
                                 paste(o$mediation_p, collapse = ","),
                                 "（顶层字段名或类型变了？输出键：", paste(names(o), collapse = ","), "）"))
      } else if (length(done_perm) != 1L || is.na(done_perm) || done_perm < 1) {
        fails <- c(fails, paste0("PERMANOVA-med 冒烟没报告完成了多少置换（n_perm_completed=",
                                 paste(o$n_perm_completed, collapse = ","), "）"))
      } else {
        msg <- sprintf("PERMANOVA-med 冒烟通过（mediation_p=%.4f，完成 %d 次置换，样本 %d）",
                       p_med, as.integer(done_perm), length(grp))
        stopifnot(nzchar(msg))   # 不让“空消息的绿”重现
        say("OK", msg)
      }
    }
  }
}, error = function(e) fails <<- c(fails, paste("PERMANOVA-med 冒烟异常:", conditionMessage(e))))

tryCatch({
  inp2 <- list(
    communityData = mk(otu),
    sampleData = list(group = as.character(grp), strata = as.character(strata)),
    formula = "group", strata = "strata", scheme = "stratified",
    distance = "bray", permutations = 99L, seed = 1L
  )
  writeLines(jsonlite::toJSON(inp2, auto_unbox = TRUE), file.path(smoke_dir, "nr.json"))
  st <- system2(file.path(R.home("bin"), "Rscript.exe"),
                c("r-scripts/nonrandom_permanova.R",
                  shQuote(file.path(smoke_dir, "nr.json")),
                  shQuote(file.path(smoke_dir, "nr.out.json")),
                  shQuote(file.path(smoke_dir, "nr.err.txt"))))
  if (st != 0) {
    err <- tryCatch(readLines(file.path(smoke_dir, "nr.err.txt"), warn = FALSE), error = function(e) "")
    fails <- c(fails, paste0("Non-random PERMANOVA 冒烟失败(exit ", st, "): ", paste(err, collapse = " | ")))
  } else {
    o2 <- jsonlite::fromJSON(file.path(smoke_dir, "nr.out.json"), simplifyVector = FALSE)
    if (!isTRUE(o2$success)) {
      fails <- c(fails, "Non-random 冒烟返回 success!=true")
    } else {
      # 同一个坑：sprintf("%s", character(0)) 不报错、只返空串，字段搬家家就会把“✓”静默吞掉。
      f_obs <- suppressWarnings(as.numeric(unlist(o2$observed$F_model)))
      p_con <- suppressWarnings(as.numeric(unlist(o2$observed$p_constrained)))
      fb <- suppressWarnings(as.numeric(unlist(o2$permutation$feasible_blocks)))
      dg <- unlist(o2$diagnostics)
      if (length(f_obs) != 1L || is.na(f_obs) || f_obs <= 0) {
        fails <- c(fails, paste0("Non-random 冒烟的 F_model 不是止数（顶层字段或类型变了；键：",
                                 paste(names(o2), collapse = ","), "）"))
      } else if (length(p_con) != 1L || is.na(p_con) || p_con < 0 || p_con > 1) {
        fails <- c(fails, "Non-random 冒烟的 p_constrained 不在 [0,1]")
      } else if (length(fb) != 1L || is.na(fb) || fb < 1) {
        fails <- c(fails, "Non-random 冒烟没有可用区组（夹具的 strata 列没生效？）")
      } else if (length(dg)) {
        # 夹具备自己跌进退化设计（每层 1:1）：那它测的就不是正常路径了
        fails <- c(fails, paste0("Non-random 冒烟夹具本身是退化设计：", paste(dg, collapse = " / ")))
      } else {
        msg <- sprintf("Non-random PERMANOVA 冒烟通过（F=%.3f, p_受限=%.4f, 可用区组=%d）",
                       f_obs, p_con, as.integer(fb))
        stopifnot(nzchar(msg))
        say("OK", msg)
      }
    }
  }
}, error = function(e) fails <<- c(fails, paste("Non-random 冒烟异常:", conditionMessage(e))))

# ---- 汇总 ----
cat("\n──────── 运行时校验汇总 ────────\n")
for (w in warns) say("WARN", w)
for (nt in notes) say("INFO", nt)
if (!length(fails)) {
  say("PASS", sprintf("R 运行时满足 lockfile 声明（%d 个包，%d 个功能模块依赖齐全）", length(have), length(req_map)))
} else {
  for (f in fails) say("FAIL", f)
  cat("\n修复办法：\n  powershell -ExecutionPolicy Bypass -File scripts/setup-r-runtime.ps1 -FromRepos\n")
}

if (!is.null(json_out)) {
  writeLines(jsonlite::toJSON(list(
    r_version = as.character(rv),
    package_count = length(have),
    fails = if (length(fails)) fails else list(),
    warns = if (length(warns)) warns else list(),
    notes = if (length(notes)) notes else list(),
    ok = !length(fails)
  ), auto_unbox = TRUE, pretty = TRUE), json_out)
}
quit(status = if (length(fails)) if (any(grepl("冒烟", fails))) 2 else 1 else 0)
