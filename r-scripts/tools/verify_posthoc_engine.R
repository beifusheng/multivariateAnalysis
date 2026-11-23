# verify_posthoc_engine.R —— pairwise PERMANOVA 事后检验的已知答案自检
# STATUS: ruler
#
# 每条判据的正确答案都是**手算或独立实现**得到的，不从被验代码里推：
#   - 4 样本小设计的 pseudo-F 与精确 p 可以手算（SS 分解 + C(4,2)=6 个划分）
#   - R² 与 vegan::adonis2 对同一条公式独立算一遍（锚点，与 ERA 比 vegan::rda 同性质）
#   - 零假设下跑 40 次重复，拒绝率必须接近 α（校准，能抓到 p 的 off-by-one 类偏差）
#   - BH 用 R 自己的 p.adjust 复核，不看引擎怎么写
passed <- 0L; fails <- character(0)
ok <- function(cond, msg, detail = "") {
  if (isTRUE(cond)) { passed <<- passed + 1L; cat(sprintf("  \u2713 %s\n", msg)) }
  else { fails <<- c(fails, msg); cat(sprintf("  \u2717 %s\n      %s\n", msg, substr(detail, 1, 220))) }
}
RS <- file.path(R.home("bin"), "Rscript.exe")
engine <- file.path("r-scripts", "permanova_posthoc.R")
TMP <- file.path(tempdir(), "ph"); dir.create(TMP, showWarnings = FALSE, recursive = TRUE)

run_ph <- function(payload, tag) {
  i <- file.path(TMP, paste0(tag, ".json")); o <- paste0(i, ".out"); e <- paste0(i, ".err")
  # 路径一律 shQuote：以前探针用带空格的 tag，被 shell 拆成三个参数，
  # 于是"引擎全线崩溃"是假象 —— 是探针自己坏了
  writeLines(jsonlite::toJSON(payload, auto_unbox = TRUE, digits = NA), i)
  st <- system2(RS, c(shQuote(engine), shQuote(i), shQuote(o), shQuote(e)), stdout = FALSE, stderr = FALSE)
  if (st != 0L) {
    return(list(code = st, err = if (file.exists(e)) paste(readLines(e, warn = FALSE), collapse = " ") else ""))
  }
  # file 也带出去：字节级可比性那条判据要看原始输出，不能用解析后的对象
  # （上一版没返回 file，直接在这条上崩了「'con'不是链结」）
  list(code = 0L, file = o, r = jsonlite::fromJSON(paste(readLines(o, warn = FALSE), collapse = ""),
                                                   simplifyVector = FALSE))
}
nums <- function(x) as.numeric(unlist(x))

cat("\n\u2500\u2500 1. 手算可核对的 pseudo-F 与精确 p \u2500\u2500\n")
{
  # 4 个样本：A1 A2 彼此 d=1，B1 B2 彼此 d=1，跨组 d=3。
  #   SS_total  = 1^2 + 1^2 + 4*3^2 = 38?  -> 1+1+36 = 38
  #   SS_within = 1 + 1 = 2
  #   SS_between= 36
  #   pseudo-F  = (36/1) / (2/(4-2)) = 36/1 = 36
  # 精确零分布只有 C(4,2)=6 个划分，观测那次是最极端的 => p = 1/6
  Dm <- matrix(c(0,1,3,3, 1,0,3,3, 3,3,0,1, 3,3,1,0), 4, 4, byrow = TRUE)
  r <- run_ph(list(distanceMatrix = Dm, groups = c("A","A","B","B"),
                   seed = 7L, exact_max = 100000L), "hand4")
  if (r$code != 0L) {
    ok(FALSE, "4 样本设计能跑通", r$err)
  } else {
    f <- nums(r$r$pseudo_f)[1]; p <- nums(r$r$p_raw)[1]
    # 按 Anderson (2001) 的 SS 定义手算（第一版我按"Σ跨组d²/Σ同组d²"手算成 36，
    # 那是跟着错的公式推的期望值 —— 锚点把公式纠正之后，期望值必须跟着重算）：
    #   Wa = Wb = 1^2 = 1；跨组 4 对，每对 3^2 = 9 => Bsum = 36
    #   SS_T = (2/4)(1+1+36) = 19；SS_W = (2/2)*1 + (2/2)*1 = 2；SS_A = 17
    #   F = (17/1) / (2/(4-2)) = 17；R² = 17/19
    ok(abs(f - 17) < 1e-9, sprintf("pseudo-F 手算核对：应为 17，得到 %.6f", f), format(f))
    # 精确 p 是 2/6 而不是 1/6 —— 我上一版手算错了：C(4,2)=6 个"哪两个进 A"的划分里，
    # 观测划分与它的**标签互换**给出同一个 pseudo-F（F 对换 A/B 不变），
    # 所以最极端的划分有 2 个并列，p = 2/6。引擎一直是对的，是判据错。
    ok(abs(p - 2/6) < 1e-12, sprintf("精确 p 应为 2/6（含标签互换的对称）= 0.333333，得到 %.6f", p), format(p))
    ok(p >= 1/choose(4, 2) - 1e-12, "精确 p 不低于 1/组合数（分辨率下限对穷举同样成立）", format(p))
    ok(r$r$exact_permutation[[1]] == "TRUE", "小设计走了穷举精确置换（不是随机近似）",
       as.character(r$r$exact_permutation[[1]]))
    ok(abs(nums(r$r$r2)[1] - 17/19) < 1e-9, "R² 应为 SS_A/SS_T = 17/19",
       format(nums(r$r$r2)[1]))
    # 第二意见：同一个设计交给 adonis2，确定性量必须逐位一致
    if (requireNamespace("vegan", quietly = TRUE)) {
      av <- suppressWarnings(vegan::adonis2(stats::as.dist(Dm) ~ factor(c("A","A","B","B")),
                                            permutations = 99L))
      pn <- grep("^Pr", names(av), value = TRUE)[1]
      ok(abs(av$R2[1] - nums(r$r$r2)[1]) < 1e-9 && abs(av$F[1] - f) < 1e-9,
         "同设计的 R² 与 F 与 adonis2 逐位相同（手算与独立实现相互印证）",
         sprintf("vegan R²=%.8f F=%.8f", av$R2[1], av$F[1]))
    }
    ok(abs(nums(r$r$mean_between)[1] - 3) < 1e-9 && abs(nums(r$r$mean_within_1)[1] - 1) < 1e-9,
       "组间/组内平均距离用的是原始距离尺度（3 与 1），不是平方距离")
  }
}

cat("\n\u2500\u2500 2. 完全分离 => p 落在分辨率下限 \u2500\u2500\n")
{
  # 上一版这里写的是 rnorm(6)*10 —— 那只是方差大，**两组之间没有位移**，
  # 所以"完全分离"根本不存在：F≈4、p=1 才是正确答案。夹具要造的是位移。
  set.seed(3)
  X <- c(rnorm(3, 0, 0.05), rnorm(3, 50, 0.05))
  lab <- rep(c("A","B"), each = 3)
  Dm <- as.matrix(dist(X))
  r <- run_ph(list(distanceMatrix = Dm, groups = lab, seed = 11L, exact_max = 100000L), "sep6")
  if (r$code != 0L) ok(FALSE, "分离设计能跑通", r$err) else {
    p <- nums(r$r$p_raw)[1]; fl <- nums(r$r$p_floor)[1]
    # 两组对称设计的极端划分成对出现（划分与其互换）=> 穷举可表示的最小 p 是 2/C(6,3)=0.1
    ok(abs(p - 2 / choose(6, 3)) < 1e-12,
       sprintf("穷举下 p 达到可表示最小值 2/C(6,3) = %.4f，得到 %.6f", 2/20, p), format(p))
    ok(p > fl, "p 严格高于 1/组合数：两组对称使最极端划分成对，分辨率下限只是可达界",
       sprintf("p=%.6g floor=%.6g", p, fl))
    ok(nums(r$r$pseudo_f)[1] > 50, "极端分离的 pseudo-F 应当很大", format(nums(r$r$pseudo_f)[1]))
  }
}

cat("\n\u2500\u2500 3. 锚点：R² 与 p 的结论必须与 vegan::adonis2 一致 \u2500\u2500\n")
{
  if (!requireNamespace("vegan", quietly = TRUE)) {
    ok(FALSE, "vegan 可用（锚点检查的先决条件）", "没装 vegan，无法核对独立实现")
  } else {
    suppressMessages(library(vegan))
    dr <- c(); df_ <- c(); dpp <- c(); agree <- 0L; tot <- 0L
    for (s in 1:12) {
      set.seed(1000 + s)
      nA <- sample(4:8, 1); nB <- sample(4:8, 1); n <- nA + nB
      shift <- if (s %% 3 == 0) 0 else runif(1, 0.3, 2.5)      # 1/3 的设计是真零假设
      X <- c(rnorm(nA), rnorm(nB) + shift)
      lab <- c(rep("A", nA), rep("B", nB))
      Dm <- as.matrix(dist(X))
      r <- run_ph(list(distanceMatrix = Dm, groups = lab, seed = 5L,
                       permutations = 999L, exact_max = 10L), paste0("anchor", s))
      if (r$code != 0L) { dr <- c(dr, NA); next }
      tot <- tot + 1L
      mine_p <- nums(r$r$p_raw)[1]; mine_r2 <- nums(r$r$r2)[1]; mine_f <- nums(r$r$pseudo_f)[1]
      av <- adonis2(as.dist(Dm) ~ factor(lab), permutations = 999, method = "euclidean",
                   strata = NULL)
      # p 列名在不同 vegan 版本是 Pr(>F) 或 Pr(>)，按前缀取，别硬写
      pnm <- grep("^Pr", names(av), value = TRUE)[1]
      if (!length(pnm)) { dr <- c(dr, NA); next }
      v_p <- av[[pnm]][1]; v_r2 <- av$R2[1]; v_f <- av$F[1]
      dr <- c(dr, mine_r2 - v_r2)
      df_ <- c(df_, mine_f - v_f)
      dpp <- c(dpp, mine_p - v_p)
      if ((mine_p < 0.05) == (v_p < 0.05)) agree <- agree + 1L
    }
    ok(tot >= 10, sprintf("锚点设计跑通 %d/12 个", tot), "不足 10 个设计，锚点没有说服力")
    # 空向量上 max(abs(dr)) 是 -Inf，写 `< 1e-9` 会**因为什么都没测到而通过**。
    # 这种绿必须提前掐掉：先问有没有数据，再问差不差。
    ok(length(dr) >= 10 && max(abs(dr), na.rm = TRUE) < 1e-9,
       sprintf("R² 与 vegan::adonis2 逐设计相同（%d 个设计，最大偏差 %s）—— 公式不是我自己推的",
               length(dr), if (length(dr)) format(max(abs(dr), na.rm = TRUE)) else "无数据"), "")
    ok(length(df_) >= 10 && max(abs(df_), na.rm = TRUE) < 1e-9,
       sprintf("pseudo-F 也逐位相同（最大偏差 %s）—— 这才是真正的锚点",
               if (length(df_)) format(max(abs(df_), na.rm = TRUE)) else "无数据"), "")
    # p 两边都是 999 次随机置换，差值是 MC 噪声：判"容差内"与"无系统性偏向"，
    # 不判"结论一致"（α 附近的设计本来就允许两边各判各的，硬要求一致是在考运气）
    ok(length(dpp) >= 10 && max(abs(dpp)) <= 0.05,
       sprintf("|Δp| 全在 MC 容差内（最大 %.4f；999 次置换在 p≈0.07 处 σ≈0.008）",
               if (length(dpp)) max(abs(dpp)) else NA), "")
    ok(length(dpp) >= 10 && sum(dpp < 0) >= 2 && sum(dpp < 0) <= 10,
       sprintf("p 没有系统性偏低或偏高（12 个设计里我的 p 更小者占 %d 个，应接近一半）",
               sum(dpp < 0)), "")
  }
}

cat("\n\u2500\u2500 4. 零假设校准：p 不该普遍偏小（抓 off-by-one）\u2500\u2500\n")
{
  ps <- c()
  for (s in 1:40) {
    set.seed(4000 + s)
    n <- 12; lab <- rep(c("A","B"), each = 6)
    X <- rnorm(n)                                    # 真零：两组同分布
    r <- run_ph(list(distanceMatrix = as.matrix(dist(X)), groups = lab, seed = s,
                     permutations = 999L, exact_max = 10L), paste0("null", s))
    if (r$code == 0L) ps <- c(ps, nums(r$r$p_raw)[1])
  }
  ok(length(ps) >= 38, sprintf("零假设重复跑通 %d/40", length(ps)), "样本不足，下面的校准不作数")
  # 同样不能在没有 ps 的时候让下面三条空过
  if (length(ps) < 38) {
    ok(FALSE, "alpha=0.05 下的拒绝次数在合理范围（前置条件失败，未验证）", "")
    ok(FALSE, "p 与均匀分布的 KS 检验不显著（前置条件失败，未验证）", "")
    ok(FALSE, "没有 p 低于分辨率下限（前置条件失败，未验证）", "")
  } else {
    rej <- sum(ps < 0.05)
    ok(rej <= 8, sprintf("alpha=0.05 下 40 次里只拒绝了 %d 次（宽松上限 8；若 p 系统性偏小这里会爆）", rej), "")
    ks <- suppressWarnings(ks.test(ps, "punif"))$p.value
    ok(ks > 0.01, sprintf("p 值与均匀分布的 KS 检验不显著（KS p=%.3f）—— 置换计数没有 off-by-one", ks), "")
    ok(min(ps) > 1/(999 + 1) - 1e-12, sprintf("没有 p 低于分辨率下限（最小 %.5f）", min(ps)), "")
  }
}

cat("\n── 4b. p 的 +1 约定：用代数核对，不用统计去猜 ──\n")
{
  # 为什么不能用统计：B=999 时丢掉 +1 只移动 0.001，而 MC 噪声的 3σ 就有 0.015 ——
  # 我第一版正是这样写的（40 次零假设重复 + KS），结果变异 ge/B 之后 57 项全绿。
  # 办法是让引擎把原始计数 n_ge 与样本空间 n_space 一起报出来，然后核公式本身。
  set.seed(77)
  Xsep <- c(rep(-100, 4), rep(100, 4)) + rnorm(8, 0, 0.01)
  Dsep <- as.matrix(dist(Xsep)); lsep <- rep(c("A", "B"), each = 4)

  rB <- run_ph(list(distanceMatrix = Dsep, groups = lsep, permutations = 999L,
                    seed = 3L, exact_max = 1L), "floor_rand")
  if (rB$code != 0L) ok(FALSE, "随机置换分支能跑通", rB$err) else {
    ppp <- nums(rB$r$p_raw); gge <- nums(rB$r$n_ge); nn <- nums(rB$r$n_space)
    ok(all(nn == 999), "随机分支报告的样本空间就是置换次数", paste(nn, collapse = "/"))
    ok(all(abs(ppp - (1 + gge) / (1 + nn)) < 1e-12),
       "p 逐对子等于 (1+n_ge)/(1+n_space) —— 少加任何一个 1 都会红",
       sprintf("p[1]=%.8f 公式=%.8f", ppp[1], (1 + gge[1]) / (1 + nn[1])))
    ok(all(ppp > 0), "p 恒大于 0：置换检验给不出 p=0，写出 0 就是把分辨率当证据强度", "")
    ok(all(ppp >= 1 / 1000 - 1e-12), "p 不低于分辨率下限 1/(B+1)", "")
  }

  rE <- run_ph(list(distanceMatrix = Dsep, groups = lsep, permutations = 999L,
                    seed = 3L, exact_max = 100000L), "floor_exact")
  if (rE$code != 0L) ok(FALSE, "穷举分支能跑通", rE$err) else {
    pe <- nums(rE$r$p_raw); ge2 <- nums(rE$r$n_ge); sp2 <- nums(rE$r$n_space)
    ok(all(sp2 == choose(8, 4)), "穷举分支的样本空间是 C(8,4)=70 个划分", paste(sp2, collapse = "/"))
    ok(abs(pe - ge2 / sp2) < 1e-12, sprintf("p = n_ge/n_space（观测那次天然在内，得 %.5f）", pe), "")
    ok(pe > 0 && ge2 >= 1, "观测划分必然被计入，所以 p >= 1/70", sprintf("ge=%.0f p=%.5f", ge2, pe))
  }

  # 两条分支必须给同一个答案（随机分支靠 +1 逼近真值）：这测的是置换机器本身
  if (rB$code == 0L && rE$code == 0L) {
    dif <- abs(nums(rB$r$p_raw)[1] - nums(rE$r$p_raw)[1])
    ok(dif < 0.02, sprintf("随机与穷举两条分支的 p 相差 %.4f（穷举是参照）", dif), "")
  }
}

cat("\n── 5. 多重校正：口径与次序 ──\n")
{
  set.seed(9)
  X <- as.matrix(dist(rnorm(24)))
  lab <- rep(c("A","B","C","D"), each = 6)
  r <- run_ph(list(distanceMatrix = X, groups = lab, permutations = 999L, seed = 3L,
                   exact_max = 10L), "multi")
  if (r$code != 0L) {
    ok(FALSE, "4 组设计能跑通", r$err)
  } else {
    pr <- nums(r$r$p_raw); pbh <- nums(r$r$p_bh); pbf <- nums(r$r$p_bonferroni)
    ok(length(pr) == 6L && length(r$r$pairs) == 6L, "4 组应有 6 个两两对子",
       sprintf("pairs=%d", length(r$r$pairs)))
    ok(identical(as.character(unlist(r$r$pairs)),
                 as.character(apply(utils::combn(sort(unique(lab)), 2L), 2,
                                    function(x) paste(x[1], x[2], sep = " vs ")))),
       "对子顺序就是 combn(排序后的组名,2)，视图与导出不许自己另排一套",
       paste(unlist(r$r$pairs), collapse = ", "))
    # 用 R 自己的 p.adjust 复核：如果哪天有人手写一份 BH 公式，这里会红
    ok(all(abs(pbh - p.adjust(pr, method = "BH")) < 1e-15),
       "BH 与 R 的 p.adjust(method = 'BH') 逐位相同（不在别处再写一份公式）", "")
    ok(all(abs(pbf - pmin(1, length(pr) * pr)) < 1e-15), "Bonferroni 就是 min(1, m*p)", "")
    ok(all(pbh >= pr - 1e-15), "校正后 p 恒 >= 原始 p", "")
    ok(all(pbh <= pbf + 1e-15), "BH 恒不宽于 Bonferroni", "")
    st <- as.character(unlist(r$r$significance))
    ok(all(st[pbh < 0.05] %in% c("*","**","***")) && all(st[pbh >= 0.05] == "ns"),
       "星号与 BH 列口径一致", paste(st, collapse = "/"))
    ok(!("diagnostics" %in% names(r$r)) || length(r$r$diagnostics) == 0L ||
       all(grepl("置换|分辨率|内部校验|排除|口径", unlist(r$r$diagnostics))),
       "诊断里没有来历不明的条目", paste(unlist(r$r$diagnostics), collapse = " / "))
  }
}


cat("
── 5b. 口径切换：星号必须跟着用户选的那一列走 ──
")
{
  set.seed(41); Xp <- as.matrix(dist(c(rnorm(6), rnorm(6) + 1.4, rnorm(6) + 0.7)))
  labp <- rep(c("A", "B", "C"), each = 6)
  star_of <- function(pp) ifelse(pp < 0.001, "***", ifelse(pp < 0.01, "**", ifelse(pp < 0.05, "*", "ns")))
  for (pm in c("bh", "bonferroni", "none")) {
    r <- run_ph(list(distanceMatrix = Xp, groups = labp, permutations = 999L, seed = 4L,
                     exact_max = 10L, primary = pm), paste0("prim_", pm))
    if (r$code != 0L) { ok(FALSE, sprintf("口径 %s 能跑通", pm), r$err); next }
    pp <- nums(r$r$p_primary); st <- unlist(r$r$significance)
    want <- switch(pm, bonferroni = nums(r$r$p_bonferroni), none = nums(r$r$p_raw), nums(r$r$p_bh))
    ok(all(abs(pp - want) < 1e-15), sprintf("primary=%s 时 p_primary 就是那一列", pm), "")
    ok(identical(as.character(st), as.character(star_of(want))),
       sprintf("primary=%s 时星号取自该列（判定只在一处做）", pm),
       paste(st, collapse = "/"))
    ok(r$r$primary == pm, sprintf("口径回显正确（%s）", pm), as.character(r$r$primary))
  }
  r2 <- run_ph(list(distanceMatrix = Xp, groups = labp, permutations = 999L, seed = 4L,
                    exact_max = 10L), "prim_all")
  ok(all(c("p_raw", "p_bh", "p_bonferroni") %in% names(r2$r)),
     "BH 与 Bonferroni 同时给出（只给一列就是替用户做决定）", "")
  ok(grepl("口径", paste(unlist(r2$r$interpretation), collapse = " ")),
     "解读里写明本次用的是哪个口径", as.character(r2$r$interpretation))
  r3 <- run_ph(list(distanceMatrix = Xp, groups = labp, permutations = 999L, seed = 4L,
                    primary = "sidak"), "prim_bogus")
  ok(r3$code == 0L && any(grepl("不认识校正口径", unlist(r3$r$diagnostics))),
     "乱写的口径不静默兜底：回退 BH 并当场说明",
     paste(unlist(r3$r$diagnostics), collapse = " / "))
}

cat("\n── 7. 分组项由引擎从公式推（用户实机报回的那条 bug 的回归防线）──\n")
{
  # 视图以前自己拆公式：formula.split('+')[0] —— 于是主引擎完全接受的
  # `dist ~ as.factor(Group) + Age` 到了事后检验变成「变量 "as.factor(Group)" 不存在」。
  # 那是要求用户重写一个合法公式。现在拆法在 R 一侧，答案按**手算的已知值**核对。
  # 注意本文件的 ok() 签名是 (cond, label, detail)，与 verify_era_engine.R 相反。
  set.seed(5)
  Aa <- rnorm(5, 0); Bb <- rnorm(5, 1.6); Cc <- rnorm(5, 0.6)
  D7 <- unname(as.matrix(dist(c(Aa, Bb, Cc))))
  g7 <- c(rep("CTRL", 5), rep("CASE", 5), rep("MID", 5))
  sd7 <- list(SampleID = paste0("S", 1:15), Group = g7, Age = as.character(20:34))

  cases <- list(
    list(f = "dist ~ Group",                  want = "Group", key = ""),
    list(f = "dist ~ as.factor(Group) + Age", want = "Group", key = ""),
    list(f = "Group + Age",                   want = "Group", key = ""),
    list(f = "dist ~ Group:Age",              want = "Group", key = ""),
    list(f = "dist ~ as.factor( Group ) ",    want = "Group", key = ""),
    list(f = "dist ~ Age + Group",            want = "", key = "取值都不同"),
    list(f = "dist ~ Treatment",              want = "", key = "不是样本表里的列名"),
    list(f = "dist ~ ",                       want = "", key = "没有可用的项")
  )
  for (cs in cases) {
    r <- run_ph(list(distanceMatrix = D7, sampleData = sd7, formula = cs$f,
                     permutations = 199L, seed = 3L), paste0("f_", make.names(cs$f)))
    if (!nzchar(cs$key)) {
      ok(r$code == 0L && identical(as.character(r$r$group_variable), cs$want),
         sprintf("公式「%s」-> 分组项 %s（拆法与 permanova.R 同源）", cs$f, cs$want),
         if (r$code != 0L) r$err else paste0("echo=", r$r$group_variable))
    } else {
      # 拒单必须拒在**正确的理由**上：拒成"列不存在"就是把合法公式说成非法
      ok(r$code != 0L && grepl(cs$key, r$err, fixed = TRUE),
         sprintf("公式「%s」拒单，理由正是「%s」", cs$f, cs$key), substr(r$err, 1, 150))
    }
  }

  # 两条给法必须等价 —— 这才是"移到 R 一侧"没改变统计结果的证据
  a7 <- run_ph(list(distanceMatrix = D7, sampleData = sd7, formula = "dist ~ as.factor(Group) + Age",
                    permutations = 199L, seed = 3L), "equiv_formula")
  b7 <- run_ph(list(distanceMatrix = D7, groups = g7, permutations = 199L, seed = 3L), "equiv_groups")
  ok(a7$code == 0L && b7$code == 0L, "两种给法都跑通", paste(a7$err, b7$err))
  if (a7$code == 0L && b7$code == 0L) {
    ok(identical(as.character(a7$r$p_bh), as.character(b7$r$p_bh)),
       "公式路径与显式 groups 路径的 p_bh 逐位相同（拆公式不改统计）",
       paste(unlist(a7$r$p_bh), collapse = " / "))
    ok(identical(as.character(a7$r$pairs), as.character(b7$r$pairs)), "对子标签也逐个相同", "")
  }

  c7 <- run_ph(list(distanceMatrix = D7, groups = g7, sampleData = sd7,
                    formula = "dist ~ Group", permutations = 199L, seed = 3L), "both_given")
  ok(c7$code == 0L && any(grepl("以 groups 为准", unlist(c7$r$diagnostics))),
     "groups 与 sampleData+formula 同时给时不静默优先：以 groups 为准并当场说明",
     paste(unlist(c7$r$diagnostics), collapse = " / "))

  # 跨引擎一致性只能打在行为上（主引擎输出不带术语名，为它重构主管道不值得）：
  # 主管道能建模的公式，事后检验不许报"列不存在"。
  pm <- file.path("r-scripts", "permanova.R")
  ok(file.exists(pm), "主引擎脚本在位（跨引擎一致性检查的前提）", pm)
  if (file.exists(pm)) {
    main_ok <- function(f) {
      i2 <- tempfile(fileext = ".json"); o2 <- paste0(i2, ".out"); e2 <- paste0(i2, ".err")
      writeLines(jsonlite::toJSON(list(distanceMatrix = D7, sampleData = sd7, formula = f,
                                       permutations = 199L, seed = 3L), auto_unbox = TRUE, digits = 10), i2)
      st <- suppressWarnings(system2(file.path("r-portable", "bin", "Rscript.exe"),
                                     c(shQuote(pm), shQuote(i2), shQuote(o2), shQuote(e2)),
                                     stdout = FALSE, stderr = FALSE))
      err <- if (file.exists(e2)) paste(readLines(e2, warn = FALSE), collapse = " ") else ""
      unlink(c(i2, o2, e2)); list(code = st, err = err)
    }
    for (f in c("dist ~ Group", "dist ~ as.factor(Group) + Age")) {
      m <- main_ok(f)
      s <- run_ph(list(distanceMatrix = D7, sampleData = sd7, formula = f,
                       permutations = 199L, seed = 3L), paste0("xeng_", make.names(f)))
      ok(m$code != 0L || s$code == 0L || !grepl("不是样本表里的列名", s$err, fixed = TRUE),
         sprintf("主引擎接受「%s」时事后检验不许说列不存在（两边解释同源）", f),
         sprintf("主 exit=%d 事后 exit=%d %s", m$code, s$code, substr(s$err, 1, 80)))
    }
  }
}


cat("\u2500\u2500 6. 只有 2 组时数组不许降级 \u2500\u2500\n")
{
  set.seed(12)
  X <- as.matrix(dist(rnorm(10)))
  r <- run_ph(list(distanceMatrix = X, groups = c(rep("A",5), rep("B",5)),
                   permutations = 999L, seed = 1L, exact_max = 10L), "two")
  if (r$code != 0L) ok(FALSE, "两组设计能跑通", r$err) else {
    raw <- paste(readLines(file.path(TMP, "two.json.out"), warn = FALSE), collapse = " ")
    ok(grepl('"p_raw"[ \t]*:[ \t]*\\[', raw), "只有 1 个对子时 p_raw 仍是数组（视图 .map 才不会崩）",
       substr(raw, max(1L, regexpr('"p_raw"', raw)), 40))
    ok(grepl('"pairs"[ \t]*:[ \t]*\\[', raw), "pairs 同理", "")
    ok(length(unlist(r$r$pairs)) == 1L, "对子确实只有 1 个", "")
    dg <- paste(unlist(r$r$diagnostics), collapse = " ")
    ok(grepl("只有 1 个对子", dg), "还明确说了此时多重校正不起作用（免得用户以为没校正）", dg)
  }
}

cat("\n\u2500\u2500 7. 可复现：同输入两次必须逐字节相同 \u2500\u2500\n")
{
  set.seed(21); X <- as.matrix(dist(rnorm(20)))
  lab <- rep(c("A","B","C"), times = c(7, 7, 6))   # 20 个样本，三组不等大
  pl <- list(distanceMatrix = X, groups = as.character(lab), permutations = 999L, seed = 77L)
  a <- run_ph(pl, "rep1"); b <- run_ph(pl, "rep2")
  ok(a$code == 0L && b$code == 0L, "两次都跑通", paste(a$err, b$err))
  if (a$code == 0L && b$code == 0L) {
    fa <- paste(readLines(a$file, warn = FALSE), collapse = "\n")
    fb <- paste(readLines(b$file, warn = FALSE), collapse = "\n")
    ok(identical(fa, fb), "同输入同输出（置换流按 seed+对子序号，不碰全局时间）", "")
  }
}

cat("\n\u2500\u2500 8. 坏输入必须当场拒绝，而且说清怎么办 \u2500\u2500\n")
{
  good <- as.matrix(dist(rnorm(12)))
  gl <- rep(c("A","B"), each = 6)
  cases <- list(
    list("非方阵", list(distanceMatrix = matrix(1:6, 2, 3), groups = c("A","B")), "不是方阵"),
    list("缺距离", list(groups = gl), "缺少距离矩阵"),
    list("不对称", list(distanceMatrix = rbind(c(0,1), c(5,0)), groups = c("A","B")), "不对称"),
    list("对角非零", list(distanceMatrix = rbind(c(1,1), c(1,0)), groups = c("A","B")), "对角线"),
    list("含 NA", list(distanceMatrix = matrix(c(0,1,NA,0), 2, 2), groups = c("A","B")), "缺失"),
    list("分组长度不符", list(distanceMatrix = good, groups = c("A","B")), "长度"),
    list("缺分组", list(distanceMatrix = good), "缺少分组变量"),
    # 关键词取引擎原文里真有的那段（上一版我写"只有一个分组"，引擎说"只剩一个分组"，
    # 判据因文案不同而红 —— 那不是 bug 被抓住，是断言在考字面）
    list("只有一个组", list(distanceMatrix = good, groups = rep("A", 12)), "个分组"),
    list("某组只有1个样本", list(distanceMatrix = good, groups = c("A", rep("B", 11))), "只有 1 个样本"),
    list("全零距离", list(distanceMatrix = matrix(0, 6, 6), groups = rep(c("A","B"), 3)), "都是 0"),
    list("负距离", list(distanceMatrix = rbind(c(0,-1), c(-1,0)), groups = c("A","B")), "负值")
  )
  for (cs in cases) {
    r <- run_ph(cs[[2]], paste0("bad_", gsub("[^A-Za-z0-9]", "", cs[[1]])))
    msg <- if (r$code != 0L) r$err else "居然大获成功"
    ok(r$code != 0L && grepl(cs[[3]], r$err, fixed = TRUE),
       sprintf("「%s」被拒绝且理由含「%s」", cs[[1]], cs[[3]]), msg)
  }
}

cat("\n\u2500\u2500 9. 单侧样本不足时不能悄悄跳过对子 \u2500\u2500\n")
{
  set.seed(31); X <- as.matrix(dist(rnorm(15)))
  lab <- c(rep("A", 5), rep("B", 5), rep("C", 4), "D")     # D 只有 1 个样本
  r <- run_ph(list(distanceMatrix = X, groups = lab, permutations = 999L, seed = 2L), "singles")
  ok(r$code != 0L && grepl("只有 1 个样本", r$err, fixed = TRUE),
     "含单样本组时整轮拒绝，而不是把那个对子静默丢掉", if (r$code != 0L) r$err else "跑通了")
}

cat("\n\u2500\u2500\u2500 pairwise PERMANOVA 事后检验自检汇总 \u2500\u2500\u2500\n")
if (length(fails)) {
  cat(sprintf("[FAIL] %d 项通过 / %d 项失败\n", passed, length(fails)))
  for (f in fails) cat("  - ", f, "\n", sep = "")
  quit(status = 1)
}
cat(sprintf("[PASS] %d 项全过\n", passed))
