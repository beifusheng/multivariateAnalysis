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
