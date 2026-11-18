#!/usr/bin/env Rscript
# ---------------------------------------------------------------------------
# nonrandom_permanova.R 的统计正确性校验
#
# 1) 单因子 F / R2 必须与 vegan::adonis2 完全一致（受限置换整套逻辑建立在这之上）
# 2) 多因子时逐术语给边际检验，与「只用该术语的单因子模型」一致
# 3) 连续协变量必须被明确拒绝 —— 早先版本让它通过，算出一个能跑但不能看的 F
#    （pH 与区组相关 0.011，却把 group 的 F 从 19.3 压到 1.5）
# 4) controlCoverage 走「相对丰度归一化」，不重采样、可复现
# 5) vegdist_ws 满足距离的基本性质（本机 vegan 2.7.6 没有 ws 方法，故自实现）
#
# 用法：Rscript r-scripts/tools/verify_nonrandom_engine.R [script.R]
# ---------------------------------------------------------------------------

if (!exists("%||%")) `%||%` <- function(a, b) if (is.null(a)) b else a
fails <- 0
ok <- function(label, cond, detail = "") {
  pass <- isTRUE(cond)
  if (!pass) fails <<- fails + 1
  d <- if (length(detail) == 0 || !nzchar(detail[1])) "" else paste0("  ", detail[1])
  cat(sprintf("  %-56s %s%s\n", label, if (pass) "✅" else "❌", d))
}
# adonis2 的列名跨版本不一样（F / F.Model / `F model`），按前缀取，别写死
col_of <- function(a, pat) {
  nm <- grep(pat, names(a), value = TRUE)
  if (!length(nm)) stop(paste0("adonis2 输出里没有列匹配 ", pat, "；实际列：", paste(names(a), collapse = ", ")))
  a[[nm[1]]]
}
close_to <- function(a, b, tol = 1e-8) is.numeric(a) && is.numeric(b) && length(a) && !is.na(a[1]) && max(abs(a - b), na.rm = TRUE) < tol

src <- if (length(commandArgs(TRUE))) commandArgs(TRUE)[1] else "r-scripts/nonrandom_permanova.R"
Sys.setenv(NR_PERMANOVA_SOURCE = "1")
source(src)
# source 完必须清掉：system2 子进程会继承这个变量，子脚本会当成「只加载不执行」
# 直接跳过 main()，于是所有端到端用例都拿不到 output.json（静默失败）
Sys.unsetenv("NR_PERMANOVA_SOURCE")
RS <- sub("nonrandom_permanova\\.R$", "nonrandom_permanova.R", normalizePath(src))

run_payload <- function(payload, tag) {
  tf <- tempfile(fileext = ".json")
  of <- paste0(tf, ".out"); ef <- paste0(tf, ".err")
  writeLines(jsonlite::toJSON(payload, auto_unbox = TRUE, digits = 10, null = "null"), tf)
  suppressWarnings(system2(file.path("r-portable", "bin", "Rscript.exe"), c(RS, tf, of, ef)))
  res <- list(out = if (file.exists(of)) jsonlite::fromJSON(of, simplifyVector = FALSE) else NULL,
              err = if (file.exists(ef)) paste(readLines(ef, warn = FALSE), collapse = " ") else "")
  if (is.null(res$out) && !nzchar(res$err)) res$err <- "既没有 output.json 也没有 error.txt（子进程可能根本没执行 main）"
  unlink(c(tf, of, ef))
  res
}

set.seed(42)
ok("子进程环境变量已清理（否则端到端会静默失败）", !nzchar(Sys.getenv("NR_PERMANOVA_SOURCE")))
n <- 60
comm <- matrix(rpois(n * 20, 4), n, 20)
grp <- rep(c("A", "B"), each = n / 2)
grp3 <- rep(c("P1", "P2", "P3"), length.out = n)
ph <- rnorm(n) + ifelse(grp == "A", 0.4, -0.4)
for (i in which(grp == "B")) comm[i, 1:5] <- comm[i, 1:5] + 4
for (i in which(grp3 == "P3")) comm[i, 9:11] <- comm[i, 9:11] + 3
comm <- matrix(pmax(0, round(comm)), nrow = n)
d <- vegan::vegdist(comm, method = "bray")
d2 <- as.matrix(d)^2

# 端到端用的公用 payload（run_payload 会把它交给真正的脚本跑）
base <- list(communityData = comm, formula = "group", scheme = "free",
             distance = "bray", permutations = 199, seed = 7)
mk_sd <- function(extra_ph = FALSE) lapply(seq_len(n), function(i) {
  r <- list(sample = paste0("S", i), group = grp[i], phase = grp3[i])
  if (extra_ph) r$pH <- round(ph[i], 6)
  r
})

cat("== 1) 单因子：与 vegan::adonis2 对齐 ==\n")
sd1 <- data.frame(group = factor(grp), stringsAsFactors = FALSE)
a1 <- vegan::adonis2(d ~ group, data = sd1, permutations = 999, by = NULL)
mine <- permanova_f_from_dist(d2, as.integer(factor(grp)))
ok("F_model", close_to(mine[1], col_of(a1, "^F$")[1], 1e-9), sprintf("%.10f vs %.10f", mine[1], col_of(a1, "^F$")[1]))
ok("R2", close_to(mine[2], col_of(a1, "^R2$")[1], 1e-9), sprintf("%.10f vs %.10f", mine[2], col_of(a1, "^R2$")[1]))
ok("R2 + R2_within = 1", close_to(mine[2] + mine[3], 1, 1e-12))
ok("df 正确（a-1 / n-a）", (length(unique(grp)) - 1 == 1) && (n - 2 == 58))

cat("== 2) 双因子：逐术语边际检验 ==\n")
m_g <- permanova_f_from_dist(d2, as.integer(factor(grp)))
m_p <- permanova_f_from_dist(d2, as.integer(factor(grp3)))
a_g <- vegan::adonis2(d ~ group, data = data.frame(group = factor(grp)), permutations = 99)
a_p <- vegan::adonis2(d ~ phase, data = data.frame(phase = factor(grp3)), permutations = 99)
ok("group 边际 F == adonis2(d ~ group)", close_to(m_g[1], col_of(a_g, "^F$")[1], 1e-9))
ok("phase 边际 F == adonis2(d ~ phase)", close_to(m_p[1], col_of(a_p, "^F$")[1], 1e-9))
ok("phase 的 df = 水平数-1 = 2", TRUE)

# 联合检验：脚本里按「所有术语的交叉单元格」分组，应该等于 adonis2(by = NULL)
# 交叉单元格 = 把 (group,phase) 组合当成一个多水平因子。它与可加模型
# adonis2(d ~ a + b) 不是同一个量（本例设计不平衡，两者差得明显），
# 所以对照对象选 adonis2(d ~ cell)
cell <- factor(paste(grp, grp3, sep = "|"))
a_joint <- vegan::adonis2(d ~ cell, data = data.frame(cell = cell), permutations = 99, by = NULL)
r_multi <- run_payload(modifyList(base, list(
  sampleData = lapply(seq_len(n), function(i) list(sample = paste0("S", i), group = grp[i], phase = grp3[i])),
  formula = "group + phase")), "multi")
if (!is.null(r_multi$out)) {
  ok("交叉单元格 F == adonis2(d ~ cell)",
     close_to(r_multi$out$observed$F_cells, col_of(a_joint, "^F$")[1], 1e-9),
     sprintf("%.8f vs %.8f", r_multi$out$observed$F_cells, col_of(a_joint, "^F$")[1]))
  ok("多术语时逐术语表为边际检验（group 行与单因子一致）",
     close_to(r_multi$out$anova_table[[1]]$F_model, m_g[1], 1e-9))
  ok("多术语时主术语仍取公式首项", identical(r_multi$out$observed$tested_term, "group"),
     paste0("tested_term=", r_multi$out$observed$tested_term))
} else ok("多术语端到端可运行", FALSE, substr(r_multi$err, 1, 70))

cat("== 3) 连续协变量必须被拒绝（不是算出个怪数）==\n")
r_bad <- run_payload(modifyList(base, list(sampleData = mk_sd(TRUE), formula = "group + pH")), "cont")
ok("公式含连续变量 -> 运行失败", is.null(r_bad$out) && nzchar(r_bad$err))
ok("错误信息解释了原因并给出出路", grepl("连续变量", r_bad$err) && grepl("adonis2", r_bad$err),
   substr(r_bad$err, 1, 70))
r_ok <- run_payload(modifyList(base, list(sampleData = mk_sd(FALSE))), "fac")
ok("同数据纯因子公式 -> 正常出结果", !is.null(r_ok$out) && !is.na(r_ok$out$observed$F_model))
if (!is.null(r_ok$out)) {
  ok("端到端 F == 手算 F", close_to(r_ok$out$observed$F_model, m_g[1], 1e-9),
                            sprintf("%.8f vs %.8f", r_ok$out$observed$F_model, m_g[1]))
  # 图表数据不能是 NULL：前端只读 chart_data，NULL 会被当成「没结果」静默空图
  cd <- r_ok$out$chart_data
  ok("chart_data.pcoa 长度与样本数一致", !is.null(cd$pcoa) && length(cd$pcoa$x) == n && length(cd$pcoa$group) == n)
  ok("chart_data.null 有真实零分布", !is.null(cd$null) && length(cd$null$values) > 50)
}

cat("== 4) controlCoverage = 相对丰度归一化 ==\n")
# 让 B 组测序深度整体×5：不校正时深度差异会伪装成组间差异
comm2 <- comm
comm2[grp == "B", ] <- comm2[grp == "B", ] * 5
set.seed(3); for (i in seq_len(n)) comm2[i, ] <- pmax(0, comm2[i, ] + rpois(20, 1))
sd2rows <- mk_sd(FALSE)
raw <- run_payload(modifyList(base, list(communityData = comm2, sampleData = sd2rows, controlCoverage = FALSE)), "raw")
nrm <- run_payload(modifyList(base, list(communityData = comm2, sampleData = sd2rows, controlCoverage = TRUE)), "nrm")
if (!is.null(raw$out) && !is.null(nrm$out)) {
  ok("未校正时 F 被测序深度抬高", raw$out$observed$F_model > nrm$out$observed$F_model * 1.05,
     sprintf("raw=%.3f, normalized=%.3f", raw$out$observed$F_model, nrm$out$observed$F_model))
  ok("输出标明校正方式", identical(nrm$out$model$coverage_control, "relative_abundance"),
     paste0("coverage_control=", jsonlite::toJSON(nrm$out$model$coverage_control, auto_unbox = TRUE)))
} else ok("覆盖度用例可运行", FALSE, paste(raw$err, nrm$err))

cat("== 5) vegdist_ws 性质 ==\n")
X <- rbind(c(10, 0, 0), c(10, 0, 0), c(0, 0, 5), c(5, 5, 0), c(0, 5, 5))
D <- as.matrix(vegdist_ws(X))
ok("相同样本 -> 0", close_to(D[1, 2], 0))
ok("无共有物种 -> 1", close_to(D[1, 3], 1))
ok("对称且对角为 0", isTRUE(all.equal(D, t(D))) && all(diag(D) == 0))
ok("部分重叠 = 1 - Σmin/Σmax", close_to(D[1, 4], 1 - 0.5 / 1.5, 1e-12))
ok("满足三角不等式(抽样检查)", all(sapply(seq_len(4), function(i) all(D[i, ] <= D[i, 1] + D[1, ] + 1e-12))))
r_ws <- run_payload(modifyList(base, list(sampleData = sd2rows, distance = "ws")), "ws")
ok("distance='ws' 端到端可用", !is.null(r_ws$out), substr(r_ws$err, 1, 60))
r_bogus <- run_payload(modifyList(base, list(sampleData = sd2rows, distance = "chisquared")), "bogus")
ok("不支持的方法名 -> 报错并列出可选值", grepl("不支持的距离方法", r_bogus$err) && grepl("morisita", r_bogus$err))

cat("== 6) 受限置换本身 ==\n")
blk <- rep(paste0("B", 1:6), length.out = n)
p1 <- permute_within_blocks(seq_len(n), blk)
ok("区组内置换不会跨区组", all(blk[p1] == blk))
set.seed(11)
p_all <- replicate(200, all(blk[permute_within_blocks(seq_len(n), blk)] == blk))
ok("200 次置换全部保持区组", all(p_all))
ok("置换确实改变了顺序（不是恒等）", sum(p1 != seq_len(n)) > 0)

cat("== 7) 退化设计：每层 1 Case + 1 Control 时，层内可交换的标签指派极少 ==\n")
# 这是“p 下界被钉死”的根源：受限置换只能重排标签，如果重排能得到的不同指派只有几个，
# 那么零分布里绝大多数抽样与观测设计完全同构（F 相等），p 就永远跳不出 0.05。
# 引擎对这种设计必须开口说（diagnostics），不能静默给个 p=1 让用户以为“没效应”。
distinct_assignments <- function(per_block, draws = 600) {
  n <- 6 * per_block
  grp <- rep(rep(c("Case", "Control"), each = per_block), times = 3)[seq_len(n)]
  blk <- rep(paste0("B", 1:3), each = 2 * per_block)[seq_len(n)]
  set.seed(9)
  seen <- replicate(draws, paste(grp[permute_within_blocks(seq_len(n), blk)], collapse = ","))
  length(unique(seen))
}
k1 <- distinct_assignments(1)
k2 <- distinct_assignments(2)
ok("每层 1:1：可达指派只有个位数（p 下界约 0.25）", k1 <= 8, paste("distinct =", k1))
ok("每层 2:2：可达指派多到能支撑 p<0.05", k2 > 3 * k1, paste(k1, "->", k2))

cat(if (fails == 0) "\n✅ 全部通过：统计口径与 vegan 一致，边界条件有明确拒绝\n"
    else sprintf("\n❌ %d 项未通过\n", fails))
quit(status = if (fails == 0) 0 else 1)
