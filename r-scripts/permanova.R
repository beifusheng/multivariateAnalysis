# PERMANOVA 分析脚本
# 使用 vegan 包的 adonis2 函数

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
  
  # 检查是否提供了样本数据和公式
  if (!is.null(params$sampleData) && !is.null(params$formula)) {
    # 用户提供了样本数据和公式
    sample_data_raw <- params$sampleData
    cat("[PERMANOVA.R] Sample data raw type:", typeof(sample_data_raw), "\n")
    cat("[PERMANOVA.R] Sample data raw names:", paste(names(sample_data_raw), collapse=", "), "\n")
    cat("[PERMANOVA.R] Sample data first column length:", length(sample_data_raw[[1]]), "\n")
    
    # 使用 list 构建 data.frame
    sample_data_list <- list()
    col_names <- names(sample_data_raw)
    
    for (i in seq_along(col_names)) {
      col_name <- col_names[i]
      col_data <- sample_data_raw[[col_name]]
      
      # 第一列是样本 ID，转换为字符型；其他列尝试转换为数值型
      if (i == 1) {
        sample_data_list[[col_name]] <- as.character(col_data)
      } else {
        # 尝试转换为数值，如果失败则保持字符
        numeric_data <- suppressWarnings(as.numeric(col_data))
        if (all(is.na(numeric_data))) {
          sample_data_list[[col_name]] <- as.character(col_data)
        } else {
          sample_data_list[[col_name]] <- numeric_data
        }
      }
    }
    
    # 从 list 创建 data.frame
    sample_data <- as.data.frame(sample_data_list, stringsAsFactors = FALSE)
    
    cat("[PERMANOVA.R] Sample data converted. Dimensions:", nrow(sample_data), "x", ncol(sample_data), "\n")
    cat("[PERMANOVA.R] Sample data columns:", paste(colnames(sample_data), collapse=", "), "\n")
    cat("[PERMANOVA.R] Sample data structure:\n")
    str(sample_data)
    
    formula_str <- params$formula
    
    # 验证样本数匹配
    n_samples_matrix <- nrow(distance_matrix)
    n_samples_data <- nrow(sample_data)
    
    if (n_samples_matrix != n_samples_data) {
      stop(sprintf(
        "样本数不匹配：距离矩阵有 %d 个样本，但样本数据有 %d 行",
        n_samples_matrix, n_samples_data
      ))
    }
    
    # 处理公式格式：提取 ~ 右侧的部分
    # 如果公式包含 ~ ，只保留右侧变量
    if (grepl("~", formula_str)) {
      # 分割公式，取右侧部分
      formula_parts <- strsplit(formula_str, "~")[[1]]
      if (length(formula_parts) >= 2) {
        # 取右侧部分，去除首尾空格
        formula_str <- trimws(formula_parts[2])
      }
    }
    
    cat(sprintf("PERMANOVA formula (right side): %s\n", formula_str))
    
    cat(sprintf("PERMANOVA formula: dist_obj ~ %s\n", formula_str))
    cat(sprintf("Sample data columns: %s\n", paste(colnames(sample_data), collapse=", ")))
    cat(sprintf("Number of samples: %d\n", nrow(sample_data)))
    
    # 执行 PERMANOVA
    # 注意：adonis2 的置换用全局 RNG，不设种子则每次 p 值都会抖动，
    # 无法做回归比对与结果复核，故固定（可用 params.seed 覆盖）
    result <- vegan::adonis2(
      as.formula(paste("dist_obj ~", formula_str)),
      data = sample_data,
      permutations = permutations
    )
  } else {
    # 演示模式：使用距离矩阵直接进行 PERMANOVA
    # 创建一个简单的分组变量
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
  output <- list()
  output$success <- TRUE
  output$permanova_result <- permanova_result_list
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
        
        cat("Building sample list...\n")
        for (i in 1:nrow(points)) {
          sample_point <- list(
            sample_id = sample_names[i],
            coordinates = as.list(points[i, ])
          )
          
          # 如果有样本数据，添加分组信息
          if (!is.null(params$sampleData)) {
            cat("  Sample", i, ": has sampleData\n")
            sample_data_df <- as.data.frame(params$sampleData)
            # 添加第一个分类变量作为分组（用于着色）
            if (nrow(sample_data_df) >= i) {
              # 查找第一个因子型或字符型列
              found_group <- FALSE
              for (col in colnames(sample_data_df)) {
                val <- sample_data_df[[col]][i]
                if (is.character(val) || is.factor(val)) {
                  sample_point$group <- as.character(val)
                  sample_point$group_variable <- col
                  found_group <- TRUE
                  cat("    Found group:", sample_point$group, "from column:", col, "\n")
                  break
                }
              }
              # 如果没有找到字符型列，使用第一列
              if (!found_group) {
                first_col <- colnames(sample_data_df)[1]
                sample_point$group <- as.character(sample_data_df[[first_col]][i])
                sample_point$group_variable <- first_col
                cat("    Using first column:", sample_point$group, "\n")
              }
            }
          } else {
            # 演示模式：使用预设分组
            sample_point$group <- paste0("Group", ((i - 1) %% 3) + 1)
            sample_point$group_variable <- "Demo_Group"
            cat("  Sample", i, ": demo group:", sample_point$group, "\n")
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
    cat("PCoA analysis failed:", conditionMessage(e), "\n")
    cat("Error trace:", traceback(), "\n")
  })
  # ===================================
  
  # 写入输出
  output_json <- jsonlite::toJSON(output, auto_unbox = TRUE, pretty = TRUE, digits = 6)
  writeLines(output_json, output_file)
  
}, error = function(e) {
  writeLines(as.character(e), error_file)
  quit(status = 1)
})
