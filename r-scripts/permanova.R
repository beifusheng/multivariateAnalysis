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
  distance_matrix <- as.matrix(params$distanceMatrix)
  permutations <- params$permutations
  if (is.null(permutations)) permutations <- 999
  
  # 将距离矩阵转换为 dist 对象
  dist_obj <- as.dist(distance_matrix)
  
  # 创建虚拟的环境变量数据（用于演示）
  n_samples <- nrow(distance_matrix)
  
  # 检查是否提供了样本数据和公式
  if (!is.null(params$sampleData) && !is.null(params$formula)) {
    # 用户提供了样本数据和公式
    sample_data <- as.data.frame(params$sampleData)
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
    
    # 将距离矩阵转换为 dist 对象
    dist_obj <- as.dist(distance_matrix)
    
    # 检查公式格式，如果没有 ~ ，自动添加
    if (!grepl("~", formula_str)) {
      # 用户只提供了右侧变量，如 "Treatment" 或 "pH + Temperature"
      formula_str <- formula_str
    }
    
    cat(sprintf("PERMANOVA formula: dist_obj ~ %s\n", formula_str))
    cat(sprintf("Sample data columns: %s\n", paste(colnames(sample_data), collapse=", ")))
    cat(sprintf("Number of samples: %d\n", nrow(sample_data)))
    
    # 执行 PERMANOVA
    # 直接使用 dist_obj 在公式中
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
    if ("F.Model" %in% colnames(result_df)) {
      row_data$F_model <- ifelse(is.na(row$F.Model), 0, as.numeric(row$F.Model))
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
  
  # 检查并添加 F_model
  if ("F.Model" %in% colnames(result_df)) {
    output$F_model <- ifelse(is.na(result$F.Model[1]), 0, as.numeric(result$F.Model[1]))
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
