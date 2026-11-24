#!/usr/bin/env Rscript
# ---------------------------------------------------------------------------
# permanova.R（主引擎）的统计正确性校验
#
# 为什么现在才补：三个老引擎里只有 nonrandom 有尺子，gmr4/era 是后来带上的。
# PERMANOVA 的卡片一直标"可用"，但它对公式合法性的判断（尤其"首列是不是样本 ID"）
# 从来没被机器验过 —— 于是这次出现误判时，只有用户手测能发现。
#
# 每条判据的答案都来自独立计算或 vegan::adonis2，不从 permanova.R 的写法推。
#
# 用法：Rscript r-scripts/tools/verify_permanova_engine.R [script.R]
# ---------------------------------------------------------------------------
passed <- 0L; fails <- 0L
# 计数只在这里做，别两处各加一次（第一版我写了两个 ok()，后一个覆盖前一个：
# 行为看起来对，但读代码的人会以为前者还在生效）
ok <- function(label, cond, detail = "") {
  if (isTRUE(cond)) {
    passed <<- passed + 1L
    cat(sprintf("  %-58s \u2713\n", label))
  } else {
    fails <<- fails + 1L
    cat(sprintf("  %-58s \u2717 %s\n", label, substr(detail, 1, 200)))
  }
}
`%||%` <- function(a, b) if (is.null(a)) b else a

# 两份尺子的 ok() 参数序**是相反的**：本文件 ok(label, cond, detail)，
# verify_posthoc_engine.R 是 ok(cond, label, detail)。我用后者的习惯写新节时，
# 结果判据全部"红成 TRUE"（label 被当成条件）。别名把这层差异显式命名，
# 新写判据一律用 okc(cond, label, detail)，读代码时不必再猜顺序。
okc <- function(cond, label, detail = "") ok(label, cond, detail)
RS <- file.path("r-portable", "bin", "Rscript.exe")
ENG <- if (length(commandArgs(TRUE))) commandArgs(TRUE)[1] else "r-scripts/permanova.R"
TMP <- file.path(tempdir(), "pmverify"); dir.create(TMP, showWarnings = FALSE, recursive = TRUE)

run <- function(payload, tag) {
  i <- file.path(TMP, paste0(tag, ".json")); o <- paste0(i, ".out"); e <- paste0(i, ".err")
  # 路径一律 shQuote：探针 tag 带空格时被 shell 拆过，"引擎全线崩溃"是假象不是引擎
  writeLines(jsonlite::toJSON(payload, auto_unbox = TRUE, digits = 10), i)
  st <- suppressWarnings(system2(RS, c(shQuote(ENG), shQuote(i), shQuote(o), shQuote(e)),
                                stdout = FALSE, stderr = FALSE))
  list(code = st,
       out = if (st == 0L && file.exists(o)) jsonlite::fromJSON(o, simplifyVector = FALSE) else NULL,
       err = if (file.exists(e)) paste(readLines(e, warn = FALSE), collapse = " ") else "",
       file = o)
}
col_of <- function(a, pat) {
  nm <- grep(pat, names(a), value = TRUE)
  if (!length(nm)) stop(paste0("adonis2 输出里没有列匹配 ", pat, "；实际：", paste(names(a), collapse = ", ")))
  a[[nm[1]]]
}

set.seed(7)
n <- 12
hab <- rep(c("Forest", "Grass", "Wet"), each = 4)
v <- rnorm(n) + ifelse(hab == "Forest", 1.2, ifelse(hab == "Grass", -0.6, 0))
D <- unname(as.matrix(dist(v)))
sd_group_first <- list(Habitat = hab, Age = as.character(20 + seq_len(n)))

cat("\n── 1. 首列是不是样本 ID，看取值不看位置（实机误判的回归防线）──\n")
r1 <- run(list(distanceMatrix = D, sampleData = sd_group_first, formula = "dist ~ Habitat",
              permutations = 199L, seed = 11L), "group_first")
ok("第一列是真分组变量（3 水平）时不得拒单", r1$code == 0L, r1$err)
if (r1$code == 0L) {
  pr <- r1$out$permanova_result[[1]]
  ok("Df = 水平数-1 = 2，残差 Df = n-3 = 9",
     as.numeric(pr$Df[1]) == 2 && as.numeric(r1$out$permanova_result[[2]]$Df[1]) == 9,
     sprintf("Df=%s / %s", pr$Df[1], r1$out$permanova_result[[2]]$Df[1]))
  av <- vegan::adonis2(stats::as.dist(as.matrix(D)) ~ factor(hab), permutations = 199)
  ok("R² 与 adonis2 一致（该列没被当 ID 丢掉）",
     abs(as.numeric(r1$out$R2) - av$R2[1]) < 1e-9,
     sprintf("引擎 %.8f / adonis2 %.8f", as.numeric(r1$out$R2), av$R2[1]))
  # col_of 返回的是**整列**（Model/Residual/Total 三行，后两行 NA）：
  # 上一版没取 [1]，于是 sprintf 把长度 3 的 detail 循环成三行、还打出 "adonis2 NA" ——
  # 判据看起来在比数值，其实在比一个向量。
  f_ref <- col_of(av, "^F")[1]
  ok("F 与 adonis2 一致", abs(as.numeric(r1$out$F_model) - f_ref) < 1e-9,
     sprintf("引擎 %.8f / adonis2 %.8f", as.numeric(r1$out$F_model), f_ref))
  ok("p 有定义（不是 N/A）",
     !is.null(r1$out$p_value) && !is.na(as.numeric(r1$out$p_value[1])), as.character(r1$out$p_value))
}

cat("\n── 7. 分项（边际）检验：多因子公式必须说清是哪个变量 ──\n")
{
  d <- jsonlite::fromJSON("frontend/src/data/permanova-templates.json", simplifyVector = FALSE)
  t7 <- Filter(function(x) identical(x$id, "factorFormula"), d$categories[[1]]$templates)[[1]]
  r7 <- run(list(distanceMatrix = t7$distanceMatrix, sampleData = t7$sampleData,
                    formula = t7$formula, permutations = 499L, seed = 7L), "perterm")
  okc(r7$code == 0L, "带 as.factor 的多因子模板能跑通", r7$err)
  if (r7$code == 0L) {
    pt <- r7$out$per_term
    okc(length(pt) == 2L, sprintf("公式两项 => per_term 两行（实际 %d）", length(pt)), "")
    okc(identical(vapply(pt, function(x) as.character(x$term), character(1)),
                 c("as.factor(Group)", "Age")),
       "项名按拟合原样回显（as.factor(Group) 不改写成 Group，用户看到的就该是被拟合的东西）",
       paste(vapply(pt, function(x) as.character(x$term), character(1)), collapse = ", "))
    Df <- vapply(pt, function(x) as.numeric(x$Df), numeric(1))
    R2 <- vapply(pt, function(x) as.numeric(x$R2), numeric(1))
    Fv <- vapply(pt, function(x) as.numeric(x$F), numeric(1))
    okc(all(Df == c(2, 1)), sprintf("Df 逐项 = 2, 1（Group 三水平 / Age 连续）；实得 %s",
       paste(Df, collapse = ",")), "")
    # 独立锚点：直接问 vegan 要 by = "terms"
    M <- as.matrix(do.call(rbind, lapply(t7$distanceMatrix, as.numeric)))
    av2 <- vegan::adonis2(stats::as.dist(M) ~ factor(unlist(t7$sampleData$Group)) +
      as.numeric(unlist(t7$sampleData$Age)), permutations = 99L, by = "terms")
    okc(abs(R2[1] - av2$R2[1]) < 1e-4, sprintf("Group 的 R² 与 vegan by=terms 一致（引擎 %.5f / vegan %.5f）",
                                              R2[1], av2$R2[1]), "")
    okc(abs(Fv[1] - av2$F[1]) < 1e-3, sprintf("Group 的 F 与 vegan 一致（引擎 %.4f / vegan %.4f）",
                                             Fv[1], av2$F[1]), "")
    # 恒等式：逐项 R² 相加 = 整模型 R²（SS 分解是精确的，与置换无关 => 可硬核对）
    total <- sum(R2)
    okc(abs(total - as.numeric(r7$out$R2)) < 1e-9,
       sprintf("分项 R² 之和 %.6f 必须等于整模型 R² %.6f", total, as.numeric(r7$out$R2)), "")
    okc(all(vapply(pt, function(x) !is.null(x$p_value) && as.numeric(x$p_value) > 0, logical(1))),
       "每项都有定义良好的 p（> 0）", paste(vapply(pt, function(x) as.character(x$p_value), character(1)), collapse = " "))
    okc(!any(vapply(pt, function(x) is.character(x$p_value) && identical(x$p_value, "NA"), logical(1))),
       "p 不许是字符串 \"NA\"（前端拿它做数值比较会静默出错）", "")
  }
  # 单因子：Model 行就等于那一项，不该再跑一遍浪费置换
  r8 <- run(list(distanceMatrix = t7$distanceMatrix, sampleData = t7$sampleData,
                    formula = "Group", permutations = 99L, seed = 5L), "single_term")
  okc(r8$code == 0L && length(r8$out$per_term) == 0L,
     "单因子公式不产出 per_term（避免与 Model 行重复、也不白跑一次置换）",
     if (r8$code == 0L) paste("per_term 长度", length(r8$out$per_term)) else r8$err)
}

cat("\n── 8. per_term 的零假设校准：分项检验不许反保守 ──\n")
{
  # 恒等式与 vegan 锚点都只证明"算得对"，不证明"口径不偏"。
  # 分项检验是另跑一次 by="terms"，置换空间/自由度与整模型不同 —— 必须单独校准一次，
  # 否则可能整模型是好的、分项却系统性偏小（用户第一个看的恰恰是分项表）。
  NREP <- 40
  n8 <- 15
  grp8 <- rep(c("A", "B", "C"), each = 5)          # 标签固定；效应由坐标的随机性给
  ps_g <- numeric(0); ps_a <- numeric(0); ps_m <- numeric(0); ran <- 0L
  for (i in seq_len(NREP)) {
    # 每一轮都要重新生成数据。上一版把坐标放在循环外、只换 seed ——
    # 那测的是"同一份固定数据的置换噪声"（p 全挤在 0.15 附近），根本不是零假设分布。
    set.seed(7000L + i)
    coords <- matrix(rnorm(n8 * 3), n8, 3)
    D8 <- unname(round(as.matrix(dist(coords)), 6))
    age8 <- as.character(round(20 + rnorm(n8, 10, 4), 1))
    r <- run(list(distanceMatrix = D8, sampleData = list(Group = grp8, Age = age8),
                  formula = "Group + Age", permutations = 499L, seed = 1000L + i),
             paste0("null8_", i))
    if (r$code != 0L || length(r$out$per_term) < 2L) next
    ran <- ran + 1L
    pt <- r$out$per_term
    ps_g <- c(ps_g, as.numeric(pt[[1]]$p_value))
    ps_a <- c(ps_a, as.numeric(pt[[2]]$p_value))
    ps_m <- c(ps_m, as.numeric(r$out$p_value))
    # 每一项都必须是定义良好的正数，且不低于置换分辨率
    if (any(!is.finite(c(as.numeric(pt[[1]]$p_value), as.numeric(pt[[2]]$p_value))))) {
      okc(FALSE, "分项 p 全为有限数", paste("第", i, "次出现 NA/Inf")); break
    }
    if (any(c(as.numeric(pt[[1]]$p_value), as.numeric(pt[[2]]$p_value)) <= 0)) {
      okc(FALSE, "分项 p 恒大于 0（置换检验给不出 p=0）", paste("第", i, "次")); break
    }
    # 精确恒等式：逐项 R² 之和 = 整模型 R²，每一次都必须成立（与置换无关）
    id8 <- abs(sum(vapply(pt, function(x) as.numeric(x$R2), numeric(1))) - as.numeric(r$out$R2))
    if (id8 > 1e-6) { okc(FALSE, sprintf("第 %d 次分项 R² 之和与整模型差 %.2e", i, id8), ""); break }
  }
  okc(ran == NREP, sprintf("40 次零假设重复全部跑成（实得 %d；跑不成这些判据就是空表通过）", ran), "")
  if (ran >= 30L) {
    for (nm in c("Group", "Age")) {
      v <- if (nm == "Group") ps_g else ps_a
      rej <- mean(v < 0.05)
      okc(rej <= 0.225, sprintf("H0 下 %s 分项的拒绝率 %.2f（40 次里 <=9 次；理论 0.05）",
                               nm, rej), paste(round(v, 3), collapse = " "))
      ks <- suppressWarnings(stats::ks.test(v, "punif"))
      okc(ks$p.value > 0.001, sprintf("%s 分项 p 与均匀分布不矛盾（KS p=%.3f）—— 抓 off-by-one",
                                     nm, ks$p.value), "")
      okc(all(v >= 1 / 500 - 1e-9), sprintf("%s 分项 p 不低于 1/(499+1)", nm), format(min(v)))
    }
    okc(!all(abs(ps_g - ps_m) < 1e-12),
       "分项 p 不等于整模型 p（否则说明分项根本没独立检验，是把 Model 行抄了一遍）", "")
    okc(min(ps_g) > 0 && min(ps_a) > 0, "所有分项 p 的最小值仍为正", sprintf("%.4f / %.4f", min(ps_g), min(ps_a)))
  } else {
    okc(FALSE, "重复次数不足，校准判据未验证（前置条件失败，未验证）", paste("ran =", ran))
  }
}


cat("\n── 2. 逐样本唯一的首列仍然是 ID，写进公式必须拒 ──\n")
r2 <- run(list(distanceMatrix = D,
              sampleData = list(SampleID = paste0("S", seq_len(n)), Habitat = hab),
              formula = "dist ~ SampleID", permutations = 199L, seed = 11L), "id_first")
ok("首列逐样本唯一且被当解释变量时拒单", r2$code != 0L, "居然大获成功")
if (r2$code != 0L) {
  # 关键：理由里的数字必须来自这份数据，不是背下来的模板句
  ok("拒单理由带上实际数字（12 样本 / 12 取值）",
     grepl("12 个样本有 12 个不同取值", r2$err), substr(r2$err, 1, 180))
  ok("理由给出可操作的下一步（改成分组列）", grepl("请把公式改成分组列", r2$err), substr(r2$err, 1, 200))
}

cat("\n── 3. 提示语不许再声称“第一列是 ID”（当它显然不是时）──\n")
r3 <- run(list(distanceMatrix = D, sampleData = list(Habitat = hab),
              formula = "dist ~ Forest", permutations = 199L, seed = 11L), "value_as_term")
ok("把取值当列名写进公式时仍然拒单", r3$code != 0L, "居然大获成功")
if (r3$code != 0L) {
  ok("提示同时列出列名与该列取值", grepl("Habitat（取值：Forest", r3$err), substr(r3$err, 1, 200))
  ok("首列取值有重复时不再谎称它是样本 ID",
     !grepl("是样本 ID，不参与建模", r3$err), substr(r3$err, 1, 200))
  ok("改为如实说明：取值有重复，本次按普通列建模", grepl("取值有重复", r3$err), substr(r3$err, 1, 220))
}

cat("\n── 4. 演示模式的虚构分组必须出声（实机最容易误引的一个数）──\n")
r4 <- run(list(distanceMatrix = D, permutations = 199L, seed = 11L), "demo")
ok("没有样本数据与公式时仍能出结果（演示模式没坏）", r4$code == 0L, r4$err)
if (r4$code == 0L) {
  # 引擎把 output_note 合并进 diagnostics（第 330 行），没有单独的 note 字段：
  # 上一版我按字段名猜，读到的永远是空串，于是两条判据"因为没数据而红"。
  note_txt <- paste(unlist(c(r4$out$diagnostics, r4$out$note) %||% character(0)), collapse = " / ")
  ok("输出写明分组是按行序虚构的", grepl("虚构", note_txt), substr(note_txt, 1, 180))
  ok("并且明确这个 p 不该被引用", grepl("不要引用|不是任何假设检验", note_txt), substr(note_txt, 1, 180))
}

cat("\n── 5. 行数与矩阵不符必须拒 ──\n")
r5 <- run(list(distanceMatrix = D, sampleData = list(Habitat = hab[1:9]),
              formula = "dist ~ Habitat", permutations = 199L, seed = 11L), "mismatch")
ok("样本数与距离矩阵不一致时拒单并报出两个数",
   r5$code != 0L && grepl("12 个样本", r5$err) && grepl("9 行", r5$err), substr(r5$err, 1, 180))

cat("\n── 6. 可复现：固定种子两次跑必须逐字节相同 ──\n")
pl6 <- list(distanceMatrix = D, sampleData = sd_group_first, formula = "dist ~ Habitat",
            permutations = 199L, seed = 33L)
a6 <- run(pl6, "rep_a"); b6 <- run(pl6, "rep_b")
ok("两次都跑通", a6$code == 0L && b6$code == 0L, paste(a6$err, b6$err))
if (a6$code == 0L && b6$code == 0L) {
  fa <- paste(readLines(a6$file, warn = FALSE), collapse = "")
  fb <- paste(readLines(b6$file, warn = FALSE), collapse = "")
  ok("同输入同输出（置换靠 seed，不靠时间）", identical(fa, fb), "")
}

cat("\n─── PERMANOVA 主引擎校验汇总 ───\n")
if (fails > 0L) {
  cat(sprintf("[FAIL] %d 项通过 / %d 项失败\n", passed, fails)); quit(status = 1)
}
cat(sprintf("[PASS] %d 项全过\n", passed))
