# PERMANOVA-med 中介分析脚本
# 基于 LDM 包的 permanovaFL 函数

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  stop("Usage: Rscript permanova_med.R <input.json> <output.json> <error.txt>")
}

input_file <- args[1]
output_file <- args[2]
error_file <- args[3]

tryCatch({
  # 加载必要包
  if (!require("jsonlite", character.only = TRUE, quietly = TRUE)) {
    stop("jsonlite package not installed")
  }
  
  if (!require("LDM", character.only = TRUE, quietly = TRUE)) {
    stop("LDM package not installed. Install from: https://github.com/yijuanhu/LDM")
  }
  
  # 读取输入参数
  params <- jsonlite::fromJSON(input_file)
  cat("[PERMANOVA-med] Input loaded successfully\n")
  
  # 提取并转换数据
  outcome_data <- as.matrix(params$outcomeData)
  mediator_data <- as.matrix(params$mediatorData)
  predictor_data <- as.matrix(params$predictorData)
  covariates <- if (!is.null(params$covariates) && nrow(params$covariates) > 0) {
    as.matrix(params$covariates)
  } else {
    NULL
  }
  permutations <- as.numeric(params$permutations %||% 999)
  
  cat("[PERMANOVA-med] Data dimensions:\n")
  cat("  Outcome:", nrow(outcome_data), "x", ncol(outcome_data), "\n")
  cat("  Mediator:", nrow(mediator_data), "x", ncol(mediator_data), "\n")
  cat("  Predictor:", nrow(predictor_data), "x", ncol(predictor_data), "\n")
  if (!is.null(covariates)) {
    cat("  Covariates:", nrow(covariates), "x", ncol(covariates), "\n")
  }
  cat("  Permutations:", permutations, "\n")
  
  # 执行 PERMANOVA-med 分析
  # LDM::permanovaFL 返回中介效应分析结果
  cat("[PERMANOVA-med] Running permanovaFL...\n")
  
  result <- tryCatch({
    LDM::permanovaFL(
      Y = outcome_data,
      X = predictor_data,
      M = mediator_data,
      Z = covariates,
      nperm = permutations,
      verbose = TRUE
    )
  }, error = function(e) {
    cat("[PERMANOVA-med] Error in permanovaFL:", conditionMessage(e), "\n")
    NULL
  })
  
  if (is.null(result)) {
    stop("permanovaFL analysis failed")
  }
  
  # 提取结果
  cat("[PERMANOVA-med] Extracting results...\n")
  
  # 全局效应
  global_effect <- list(
    statistic = result$global$statistic %||% 0,
    p_value = result$global$p_value %||% 1,
    R2 = result$global$R2 %||% 0
  )
  
  # 中介效应
  mediator_effects <- list()
  if (!is.null(result$mediator)) {
    for (i in seq_len(nrow(result$mediator))) {
      mediator_effects[[i]] <- list(
        variable = rownames(result$mediator)[i],
        indirect_effect = result$mediator$indirect[i] %||% 0,
        direct_effect = result$mediator$direct[i] %||% 0,
        total_effect = result$mediator$total[i] %||% 0,
        p_value = result$mediator$p_value[i] %||% 1,
        proportion_mediated = result$mediator$prop[i] %||% 0
      )
    }
  }
  
  # 构建输出
  output <- list(
    success = TRUE,
    method = "PERMANOVA-med",
    permutations = permutations,
    sample_size = nrow(outcome_data),
    global_effect = global_effect,
    mediator_effects = mediator_effects,
    model_info = list(
      outcome_vars = ncol(outcome_data),
      mediator_vars = ncol(mediator_data),
      predictor_vars = ncol(predictor_data),
      covariates_vars = if (!is.null(covariates)) ncol(covariates) else 0
    ),
    timestamp = format(Sys.time(), "%Y-%m-%d %H:%M:%S")
  )
  
  # 输出 JSON
  output_json <- jsonlite::toJSON(output, auto_unbox = TRUE, pretty = TRUE)
  writeLines(output_json, output_file)
  
  cat("[PERMANOVA-med] Analysis completed successfully\n")
  cat("[PERMANOVA-med] Output written to:", output_file, "\n")
  
}, error = function(e) {
  error_msg <- paste("[PERMANOVA-med] Error:", conditionMessage(e))
  cat(error_msg, "\n")
  writeLines(error_msg, error_file)
  quit(status = 1)
})
