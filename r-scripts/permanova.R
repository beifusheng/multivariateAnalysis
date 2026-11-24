# PERMANOVA 分析脚本
# 使用 vegan 包的 adonis2 函数
# STATUS: implemented —— 已知答案自检见 r-scripts/tools/verify_permanova_engine.R

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  stop("Usage: Rscript permanova.R <input.json> <output.json> <error.txt>")
}

input_file <- args[1]
output_file <- args[2]
error_file <- args[3]

tryCatch({
  # 读取输入参数
  params <- jsonlite::fromJSON(input_file)
  
  # 检查必需包
  required_packages <- c("jsonlite", "vegan")
  for (pkg in required_packages) {
    if (!require(pkg, character.only = TRUE, quietly = TRUE)) {
      stop(paste("Required package not installed:", pkg))
    }
  }
  
  # 提取参数
  cat("[PERMANOVA.R] Starting analysis...\n")
  
  # 确保距离矩阵是数值型 matrix
  distance_matrix_raw <- params$distanceMatrix
  
  # 如果是 list（来自 JSON），转换为 matrix
  if (is.list(distance_matrix_raw)) {
    cat("[PERMANOVA.R] Converting list to matrix...\n")
    # 先转换为向量，再转换为 matrix
    distance_vector <- unlist(distance_matrix_raw, use.names = FALSE)
    
    n_rows <- length(distance_matrix_raw)
    n_cols <- length(distance_matrix_raw[[1]])
    
    distance_matrix <- matrix(
      as.numeric(distance_vector),
      nrow = n_rows,
      ncol = n_cols,
      byrow = TRUE
    )
  } else {
    distance_matrix <- as.matrix(distance_matrix_raw)
  }
  
  cat("[PERMANOVA.R] Distance matrix:", nrow(distance_matrix), "x", ncol(distance_matrix), "\n")
  
  permutations <- params$permutations
  if (is.null(permutations)) permutations <- 999

  # 置换检验种子：默认 12345，保证「同输入 => 同输出」
  seed_value <- params$seed
  if (is.null(seed_value)) seed_value <- 12345L
  set.seed(as.integer(seed_value))
  
  # 将距离矩阵转换为 dist 对象
  dist_obj <- as.dist(distance_matrix)
  cat("[PERMANOVA.R] dist_obj created, size:", attr(dist_obj, "Size"), "\n")
  
  # 创建虚拟的环境变量数据（用于演示）
  n_samples <- nrow(distance_matrix)
  
  # 创建虚拟的环境变量数据（用于演示）
  n_samples <- nrow(distance_matrix)

  # ---------------- 样本表 -> data.frame：全脚本只允许这一份实现 ----------------
  # 旧版有两份，规则还不一样：
  #   建模那份：除首列外一律 as.numeric()，于是 "0/1" 编码的分组被当**连续变量**拟合
  #     ——adonis2 检验的是斜率而不是组间差异；样本写成 1,2 还是 2,1 会得出不同的 F。
  #   PCoA 那份：拿“第一个字符型列”当分组，数字编码时它退化成“按样本 ID 着色”
  #     ——图上每个点一个颜色，看上去像分组着色，其实没有分组。两边都能“跑成功”。
  # 现在：一份转换 + 一项歧义检测（只报告，不替用户猜），PCoA 分组跟随公式首项。
  ambiguous_terms <- character(0)
  # 数值项逐样本唯一的提醒（不是错误：连续协变量合法，但 ID 喂进来也长这样）
  output_note <- character(0)

  # 公式里被 as.factor(...) 包住的列：用户已经明确说了它是因子，不能再报“当连续量拟合”
  factored_terms <- character(0)
  if (!is.null(params$formula)) {
    # 用零宽断言取 as.factor(...) 里的列名。
    # 旧写法拿 gregexpr 的 attr(m,"captures") —— 那是 regmatches 才有的东西，
    # 真实跑下去就是「子字符串参数无效」（只有带 as.factor 的公式会炸，默认公式根本碰不到）。
    factored_terms <- trimws(unlist(
      regmatches(params$formula,
                 gregexpr("(?<=as\\.factor\\()[^)]+(?=\\))", params$formula, perl = TRUE))))
  }

  # 公式里的项名（只看右侧；拆 + * : 与 as.factor(x) 里的 x）
  formula_terms_of <- function(f) {
    if (!length(f) || !nzchar(f)) return(character(0))
    rhs <- if (grepl("~", f)) trimws(strsplit(f, "~")[[1]][2]) else trimws(f)
    parts <- trimws(unlist(strsplit(rhs, "[+*:{}]", perl = TRUE)))
    parts <- trimws(gsub("^as\\.factor\\((.*)\\)$", "\\1", parts))
    parts <- parts[nzchar(parts)]
    unique(parts)
  }

  # 公式首项（PCoA 按它着色）
  first_term_of <- function(f) {
    t <- formula_terms_of(f)
    if (length(t)) t[1] else ""
  }

  # 公式首项（PCoA 按它着色）之前先定下来：ambiguity 提醒只报公式真用到的列
  formula_terms <- formula_terms_of(params$formula)

  to_sample_frame <- function(sample_data_raw) {
    col_names <- names(sample_data_raw)
    out <- list()
    for (i in seq_along(col_names)) {
      col_name <- col_names[i]
      col_data <- as.list(sample_data_raw[[col_name]])
      chr <- as.character(unlist(col_data, use.names = FALSE))
      if (i == 1L) {
        # 首列是不是"样本 ID"，看它的**取值**，不看它排在第几列：
        # 逐样本唯一 => 是 ID（拿去建模就是完美拟合）；有重复水平 => 它就是普通的
        # 分组/协变量列，按后面的规则处理。以前这里无条件当 ID，于是出现误判：
        # 用户第一列是真分组变量（如 Habitat 三个水平）也被拒，而拒单理由写着
        # "每个样本一个水平" —— 那句话在这份数据上根本是假的。
        if (length(unique(chr)) == length(chr)) {
          out[[col_name]] <- chr
          next
        }
      }
      if (anyNA(chr) || !length(chr)) {
        stop(sprintf("样本表第 %d 列 %s 有空值，无法建模", i, col_name))
      }
      num <- suppressWarnings(as.numeric(chr))
      if (all(!is.na(num))) {
        # 数字编码的“分组嫌疑”：整数值且不同取值很少（<= 样本数一半）——
        # 数学上它既能读成组也能读成斜率，机器替不了用户决定，但必须把后果说出来。
        uniq <- unique(num)
        # 只在 **>=3 个整数值** 时报。两层时 0/1 的连续拟合与分组拟合得到完全相同的分割，
        # adonis2 的 F/p 逐字相等（实测都 F=0.292、p=0.667）——那里报警是假噪音。
        # 3 层起才是真陷阱：1/2/3 被当“随编号上升的趋势”，而不是三组互相比较。
        if (all(uniq == round(uniq)) && length(uniq) >= 3 &&
            length(uniq) <= floor(length(num) / 2) &&
            !(col_name %in% factored_terms) &&
            col_name %in% formula_terms) {
          ambiguous_terms <<- c(ambiguous_terms, col_name)
        }
        out[[col_name]] <- num
      } else if (any(!is.na(num))) {
        # 一半能转数字一半不能：以前会静默变成带 NA 的数值列，adonis2 再报“缺失值”
        stop(sprintf(paste0("样本表列 %s 既有数值又有文本（比如 'Case' 和 '1' 混在同一列）。",                             # col_name
                            "请统一：分组就全写文本，协变量就全写数值"), col_name))
      } else {
        out[[col_name]] <- factor(chr)                # 文本列：因子
      }
    }
    as.data.frame(out, stringsAsFactors = FALSE)
  }

  # 检查是否提供了样本数据和公式
  if (!is.null(params$sampleData) && !is.null(params$formula)) {
    sample_data <- to_sample_frame(params$sampleData)
    formula_str <- params$formula
    if (grepl("~", formula_str)) {
      formula_str <- trimws(strsplit(formula_str, "~")[[1]][2])
    }

    # ---------------- 公式项的合法性 ----------------
    # 实机报回来的结果是 Df=8 / R²=1.0000 / F 与 p 全是 N/A：
    # 签名指向“把样本 ID 当了解释变量”（9 个样本 9 个水平 = 逐字完美拟合）。
    # 旧代码丱完全不管：adonis2 照跑，输出照样 success，前端把 N/A 端给用户看。
    # “第一列就是 ID”这个假设必须验证，不能当公理：取值逐样本唯一才叫 ID
    first_col <- colnames(sample_data)[1]
    id_like <- length(unique(as.character(sample_data[[first_col]]))) == nrow(sample_data)
    id_col <- if (id_like) first_col else NULL
    used_terms <- formula_terms_of(formula_str)
    for (tt in used_terms) {
      if (!is.null(id_col) && identical(tt, id_col)) {
        stop(paste0("公式里的 ", tt, " 是样本 ID 列（第一列，", nrow(sample_data),
                    " 个样本有 ", length(unique(sample_data[[tt]])), " 个不同取值），",
                    "不能当解释变量：每个样本一个水平，模型会“完美拟合”（R²=1），",
                    "而 F 与 p 根本没有定义。请把公式改成分组列。"))
      }
      if (!(tt %in% colnames(sample_data))) {
        # 实测有人把"取值"当"列名"写进公式（写成 G1/G2/G3，而 G1/G2/G3 是 Group 列的值）。
        # 光列可用列名不够，要把每列的取值一并给出，用户才能一眼看出该写哪个。
        others <- if (is.null(id_col)) colnames(sample_data) else setdiff(colnames(sample_data), id_col)
        detail <- vapply(others, function(cc) {
          v <- unique(as.character(sample_data[[cc]]))
          paste0(cc, "（取值：", paste(utils::head(v, 4), collapse = ", "),
                 if (length(v) > 4) sprintf(", …共 %d 个", length(v)) else "", "）")
        }, character(1))
        stop(paste0("公式里的 ", tt, " 不是样本表里的列名。公式要写**列名**（取值不写进公式）。",
                    "可用列：", if (length(detail)) paste(detail, collapse = "; ") else "（无）",
                    if (is.null(id_col)) "" else
                      paste0("；第一列 ", first_col, " 是样本 ID，不参与建模。"),
                    if (is.null(id_col))
                      paste0("（注意：第一列 ", first_col, " 取值有重复，本次把它当普通列建模。）") else ""))
      }
      lev <- length(unique(sample_data[[tt]]))
      # 只对**因子列**判“水平太多”。连续协变量天然有 n 个不同取值（Age=25/28/30/27），
      # 那不算退化；拿它报错就是误报（上一版就是拿 4 样本夹具把 Age 误杀了）。
      # 因子列水平数 >= 样本数才是真退化：每样本自成一组，残差自由度为 0，F/p 无定义。
      if (is.factor(sample_data[[tt]]) && lev >= nrow(sample_data)) {
        stop(paste0("公式里的因子项 ", tt, " 有 ", lev, " 个水平，而样本一共 ", nrow(sample_data),
                    " 个 —— 每个样本自成一组，残差自由度为 0，F 与 p 没有定义。",
                    "请合并水平或增加样本；如果它本来就是连续量，直接写列名（不要包 as.factor）。"))
      }
      if (!is.factor(sample_data[[tt]]) && lev >= nrow(sample_data) && length(used_terms) == 1L) {
        # 数值列且逐样本唯一，又是公式里唯一一项：合法（真连续协变量就长这样），
        # 但这恰好也是“把数字 ID 喂进模型”的形状。不拒，只说出来。
        output_note <- c(output_note, paste0(
          "公式项 ", tt, " 是数值列且每个样本的取值都不同：拟合的 R² 会接近 1。",
          "如果它是连续协变量（如 pH）则正常；如果它其实是样本编号，请改用分组列。"))
      }
    }

    cat(sprintf("[PERMANOVA.R] 建模表: %d 行 × %d 列；公式: dist ~ %s\n",
                nrow(sample_data), ncol(sample_data), formula_str))

    n_samples_data <- nrow(sample_data)
    if (nrow(distance_matrix) != n_samples_data) {
      stop(sprintf("样本数不匹配：距离矩阵有 %d 个样本，但样本数据有 %d 行",
                   nrow(distance_matrix), n_samples_data))
    }

    # 执行 PERMANOVA（adonis2 的置换用全局 RNG，不设种子每次 p 都抖，故已固定）
    result <- vegan::adonis2(
      as.formula(paste("dist_obj ~", formula_str)),
      data = sample_data,
      permutations = permutations
    )
  } else {
    # 演示模式：使用距离矩阵直接进行 PERMANOVA
    # 创建一个简单的分组变量
    # 这个分组是**软件按行序虚构的**（前一半算 1 组，后一半算 2 组）：跟用户的实验设计
    # 毫无关系，p 值因此也不代表任何假设检验的结论。以前这里不出声，用户看到的是一个
    # 长得跟真结果一模一样的 p。现在每次都在 note 里写明它是虚构分组。
    output_note <- c(output_note, paste0(
      "演示模式：没有样本数据与公式，分组按行序虚构（前一半 vs 后一半）。",
      "这个 p 不是任何假设检验的结论，不要引用；要结论请填样本表并在公式里写分组列名。"))
    groups <- factor(rep(1:2, length.out = n_samples))
    sample_data <- data.frame(Group = groups)
    
    # 执行 PERMANOVA（单因素）
    result <- vegan::adonis2(
      dist_obj ~ Group,
      data = sample_data,
      permutations = permutations
    )
  }
  
  # 转换结果为列表
  result_df <- as.data.frame(result)
  
  # 构建 permanova_result 数组
  permanova_result_list <- list()
  # F 列名兼容：现代 vegan 输出 "F"，旧版输出 "F.Model"
  f_col <- if ("F.Model" %in% colnames(result_df)) "F.Model" else if ("F" %in% colnames(result_df)) "F" else NULL

  for (i in 1:nrow(result_df)) {
    row <- result_df[i, ]
    row_data <- list(
      Df = ifelse(is.na(row$Df), 0, as.numeric(row$Df)),
      R2 = as.numeric(row$R2)
    )
    # 检查列是否存在并添加
    if ("SumsOfSqs" %in% colnames(result_df)) {
      row_data$SumOfSqs <- as.numeric(row$SumsOfSqs)
    } else if ("SumOfSqs" %in% colnames(result_df)) {
      row_data$SumOfSqs <- as.numeric(row$SumOfSqs)
    }
    # vegan 当前列名是 "F"（早期版本才是 "F.Model"），两者都兼容。
    # NA 行（Residual/Total）直接不输出该字段：jsonlite 会把 NA 写成字符串 "NA"，
    # 前端拿它做数值比较会静默出错。
    if (!is.null(f_col)) {
      f_val <- as.numeric(row[[f_col]])
      if (!is.na(f_val)) {
        row_data$F_model <- f_val
        row_data$F <- f_val
      }
    }
    if ("Pr(>F)" %in% colnames(result_df)) {
      if (!is.na(row$`Pr(>F)`)) {
        row_data$p_value <- as.numeric(row$`Pr(>F)`)
      }
    }
    row_data[["_row"]] <- rownames(result_df)[i]
    permanova_result_list[[i]] <- row_data
  }
  
  # 构建输出对象
  # ---------------- 分项（边际）检验 ----------------
  # adonis2 默认 by = NULL：多因子公式只给「整模型」一行。用户最想知道的其实是
  # 「哪个变量在起作用」，而这一行很容易被读成「第一个变量的结果」。
  # 所以项数 > 1 时额外跑一次 by = "terms"（单因子时 Model 就等于那一项，不重复浪费置换）。
  per_term_list <- list()
  if (!is.null(params$sampleData) && !is.null(params$formula) && length(used_terms) > 1L) {
    m2 <- tryCatch(vegan::adonis2(
      as.formula(paste("dist_obj ~", formula_str)),
      data = sample_data, permutations = permutations, by = "terms"
    ), error = function(e) NULL)
    if (!is.null(m2)) {
      df2 <- as.data.frame(m2)
      keep <- setdiff(rownames(df2), c("Residual", "Total"))
      p_col2 <- grep("^Pr", names(df2), value = TRUE)[1]
      f_col2 <- if ("F.Model" %in% names(df2)) "F.Model" else if ("F" %in% names(df2)) "F" else NULL
      for (rn in keep) {
        e <- list(term = rn, Df = as.numeric(df2[rn, "Df"]), R2 = as.numeric(df2[rn, "R2"]))
        if (!is.null(f_col2)) {
          fv <- as.numeric(df2[rn, f_col2])
          if (!is.na(fv)) e$F <- fv          # NA 不输出：jsonlite 会把 NA 写成字符串 "NA"
        }
        if (!is.null(p_col2)) {
          pv <- as.numeric(df2[rn, p_col2])
          if (!is.na(pv)) e$p_value <- pv
        }
        per_term_list[[length(per_term_list) + 1L]] <- e
      }
    } else {
      output_note <- c(output_note, paste0(
        "分项检验（by = \"terms\"）没跑成，本次只有整模型一行：",
        "多因子公式下看不出哪个变量显著。别把 Model 行当成分组变量的结果。"))
    }
  }

  output <- list()
  output$success <- TRUE
  output$permanova_result <- permanova_result_list
  output$per_term <- per_term_list   # 单因子时为空数组（Model 行就是那一项）
  output$R2 <- as.numeric(result$R2[1])
  
  # 检查并添加 F_model（同样兼容 F / F.Model 两种列名；NA 则不输出，避免 jsonlite 写成字符串 "NA"）
  if (!is.null(f_col)) {
    fv <- as.numeric(result[[f_col]][1])
    if (!is.na(fv)) {
      output$F_model <- fv
      output$F <- fv
    }
  }
  
  # 检查并添加 p_value
  if ("Pr(>F)" %in% colnames(result_df) && !is.na(result$`Pr(>F)`[1])) {
    output$p_value <- as.numeric(result$`Pr(>F)`[1])
  }
  
  output$permutations <- permutations
  if (is.null(params$sampleData)) {
    output$message <- "演示模式：使用随机分组。请提供 sampleData 和 formula 进行真实分析。"
  }

  # ---------------- 歧义列提醒 ----------------
  # 整数编码且取值很少的列（如 Group = 1/2/3）在 adonis2 里是**连续变量**：
  # 检验的是“随编号单调上升”的趋势，不是组间差异。机器不该替用户猜，
  # 但必须把后果说清楚 —— 只拒收不给说法，用户会以为软件拒收他的数据。
  diags <- character(0)
  if (length(ambiguous_terms)) {
    cols <- unique(ambiguous_terms)
    diags <- c(diags, paste0(
      "公式里这些列是整数编码且取值很少：", paste(cols, collapse = ", "),
      "。它们被当连续协变量拟合（Df=1，检验的是斜率而不是组间差异）——",
      "如果它们其实是分组编码（如 1=病例 / 2=对照），请改成文本（Case/Control），",
      "或在公式里写成 ", paste0("as.factor(", cols, ")", collapse = " / "), "。"))
  }
  if (length(output_note)) diags <- c(diags, unique(output_note))
  if (length(diags)) output$diagnostics <- as.list(diags)
  
  # ========== 添加 PCoA 分析 ==========
  cat("Starting PCoA analysis...\n")
  tryCatch({
    # 检查距离矩阵是否有效
    if (nrow(distance_matrix) < 3) {
      cat("PCoA skipped: too few samples (", nrow(distance_matrix), ")\n", sep="")
    } else {
      # 使用 cmdscale 进行 PCoA 分析
      cat("Running cmdscale with k =", min(n_samples - 1, 10), "\n")
      pcoa_result <- cmdscale(dist_obj, k = min(n_samples - 1, 10), eig = TRUE)
      
      cat("PCoA completed. Eigenvalues:", head(pcoa_result$eig), "\n")
      
      # 提取特征值（用于计算解释方差）
      eigenvalues <- pcoa_result$eig
      
      # 移除 NA 值
      eigenvalues <- eigenvalues[!is.na(eigenvalues)]
      
      # 只保留正的特征值
      positive_eig <- eigenvalues[eigenvalues > 0]
      if (length(positive_eig) == 0) {
        cat("PCoA skipped: no positive eigenvalues\n")
      } else {
        total_eig <- sum(positive_eig)
        cat("Total eigenvalue:", total_eig, "\n")
        
        # 计算每个轴的解释方差比例
        n_axes <- min(length(positive_eig), 10)
        cat("Number of axes:", n_axes, "\n")
        
        pcoa_axes <- list()
        for (i in 1:n_axes) {
          var_exp <- as.numeric(positive_eig[i] / total_eig * 100)
          cum_var <- as.numeric(sum(positive_eig[1:i]) / total_eig * 100)
          pcoa_axes[[i]] <- list(
            axis = paste0("PCoA", i),
            eigenvalue = as.numeric(positive_eig[i]),
            variance_explained = var_exp,
            cumulative_variance = cum_var
          )
          cat(sprintf("  %s: eigenvalue=%.6f, variance=%.2f%%, cumulative=%.2f%%\n",
                      paste0("PCoA", i), positive_eig[i], var_exp, cum_var))
        }
        
        # 提取样本坐标（只取前 2 个轴用于可视化）
        n_plot_axes <- min(2, ncol(pcoa_result$points))
        points <- pcoa_result$points[, 1:n_plot_axes, drop=FALSE]
        colnames(points) <- paste0("PCoA", 1:n_plot_axes)
        cat("Points dimensions:", dim(points), "\n")
        cat("First sample coordinates:", points[1, ], "\n")
        
        # 构建样本点列表
        pcoa_samples <- list()
        sample_names <- rownames(points)
        if (is.null(sample_names)) {
          sample_names <- paste0("Sample", 1:nrow(points))
        }
        
        # 分组列只算一次（旧版在循环里给**每个样本**重建一次 as.data.frame 并 cat 一行，
        # 包名与列名全部打印到控制台）
        group_col <- NULL
        group_vals <- NULL
        if (!is.null(params$sampleData)) {
          # 着色用的列必须跟建模用的是同一列。旧版“找第一个字符型列”，
          # 数字编码的 Group 找不到 → 退化成拿首列（样本 ID）着色：
          # 图里每个点一个颜色，看上去像分组，其实根本没有分组。
          term <- if (exists("formula_str") && length(formula_str)) first_term_of(formula_str) else ""
          if (length(term) && term %in% colnames(sample_data)) {
            group_col <- term
          } else {
            cand <- colnames(sample_data)[-1]        # 除 ID 外第一个非数值列
            fac <- cand[sapply(cand, function(cc) is.factor(sample_data[[cc]]))]
            group_col <- if (length(fac)) fac[1] else (if (length(cand)) cand[1] else NULL)
          }
          if (!is.null(group_col)) group_vals <- as.character(sample_data[[group_col]])
        }

        for (i in 1:nrow(points)) {
          sample_point <- list(
            sample_id = sample_names[i],
            coordinates = as.list(points[i, ])
          )
          if (!is.null(params$sampleData)) {
            if (!is.null(group_col) && length(group_vals) >= i) {
              sample_point$group <- group_vals[i]
              sample_point$group_variable <- group_col
            }
          } else {
            # 演示模式：使用预设分组
            sample_point$group <- paste0("Group", ((i - 1) %% 3) + 1)
            sample_point$group_variable <- "Demo_Group"
          }
          pcoa_samples[[i]] <- sample_point
        }
        cat("Sample list built. Total samples:", length(pcoa_samples), "\n")
        
        # 添加到输出
        output$pcoa <- list(
          axes = pcoa_axes,
          samples = pcoa_samples,
          total_variance = as.numeric(total_eig),
          n_samples = nrow(points),
          n_axes = n_axes
        )
        cat("PCoA data added to output. Samples:", length(pcoa_samples), "\n")
      }
    }
  }, error = function(e) {
    # PCoA 失败以前只 cat 到控制台——没人看控制台，用户看到的就是“图没出来”。
    # 本轮实测就撞上了：一行赋值写到循环外 ⇒ “找不到对象 sample_point” ⇒ PCoA 静默消失整整一轮。
    output$diagnostics <<- c(output$diagnostics, paste0(
      "PCoA 排序图未能生成：", conditionMessage(e),
      "（PERMANOVA 本身的结果不受影响，仅影响绘图）"))
    cat("PCoA analysis failed:", conditionMessage(e), "\n")
  })
  # ===================================
  
  # 写入输出
  # digits = NA（全精度）：这里原来是 6，于是外部拿 adonis2 核对 R²/F 时，
  # 看到的差其实是自己的舍入（实测 R² 差 4.8e-7）—— 与 gmr4/era/nonrandom 同一规矩。
  # 前端本来就用 fmtP/fmt 控制显示位数，不需要引擎替它截。
  output_json <- jsonlite::toJSON(output, auto_unbox = TRUE, pretty = TRUE, digits = NA)
  writeLines(output_json, output_file)
  
}, error = function(e) {
  # as.character(error) 会连调用帧一起写出来（"Error in doTryCatch(return(expr), ...): 真消息"），
  # 那层噪声把真正的原因埋到最后面。取 conditionMessage，并留一行可追溯的脚本标记。
  writeLines(sprintf("[PERMANOVA] %s", conditionMessage(e)), error_file)
  quit(status = 1)
})
