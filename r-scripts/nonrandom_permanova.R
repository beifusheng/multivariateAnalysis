# 非随机 PERMANOVA 扩展脚本（Jaccard 距离）
# 基于 rarefaction-without-resampling 方法

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  stop("Usage: Rscript nonrandom_permanova.R <input.json> <output.json> <error.txt>")
}

input_file <- args[1]
output_file <- args[2]
error_file <- args[3]

tryCatch({
  params <- jsonlite::fromJSON(input_file)
  
  # 检查必需包
  required_packages <- c("jsonlite", "vegan")
  for (pkg in required_packages) {
    if (!require(pkg, character.only = TRUE, quietly = TRUE)) {
      stop(paste("Required package not installed:", pkg))
    }
  }
  
  # 提取参数
  presence_absence_data <- as.matrix(params$presenceAbsenceData)
  formula_str <- params$formula
  permutations <- params$permutations %||% 999
  
  # 计算 Jaccard 距离（存在 - 缺失数据）
  # Jaccard = b + c / (a + b + c)
  # 其中 a = 两者都有，b = 第一个有第二个无，c = 第一个无第二个有
  jaccard_dist <- vegdist(presence_absence_data, method = "jaccard", binary = TRUE)
  
  # 使用 avgdist 方法进行非随机 rarefaction
  # 这避免了传统 rarefaction 的随机性
  if (exists("avgdist", mode = "function")) {
    # vegan 包中的 avgdist 函数
    jaccard_avg <- avgdist(presence_absence_data, distance = "jaccard", 
                           MARGIN = 1, replicates = 100)
  } else {
    jaccard_avg <- jaccard_dist
  }
  
  # 执行 PERMANOVA
  # 构建模型框架
  model_formula <- as.formula(formula_str)
  
  result <- vegan::adonis2(
    jaccard_avg ~ .,
    data = as.data.frame(presence_absence_data),
    permutations = permutations,
    method = "jaccard"
  )
  
  # 计算存在 - 缺失关联的统计量
  # 使用非随机 rarefaction 的扩展方法
  total_species <- rowSums(presence_absence_data)
  richness_effect <- NULL
  
  if (ncol(presence_absence_data) > 0) {
    # 物种丰富度效应
    richness_effect <- cor(total_species, rep(1, nrow(presence_absence_data)))
  }
  
  output <- list(
    success = TRUE,
    permanova_result = as.data.frame(result),
    F_model = as.numeric(result$F.Model[1]),
    R2 = as.numeric(result$R2[1]),
    p_value = as.numeric(result$`Pr(>F)`[1]),
    permutations = permutations,
    distance_method = "jaccard",
    rarefaction_method = "non-random (avgdist)",
    mean_richness = mean(total_species),
    richness_effect = richness_effect
  )
  
  output_json <- jsonlite::toJSON(output, auto_unbox = TRUE, pretty = TRUE)
  writeLines(output_json, output_file)
  
}, error = function(e) {
  writeLines(as.character(e), error_file)
  quit(status = 1)
})
