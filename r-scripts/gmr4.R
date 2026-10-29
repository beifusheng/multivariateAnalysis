# GMR⁴ (Generalized Mixed Regularized Reduced Rank Regression) 脚本
# 基于 2025 年论文算法实现

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  stop("Usage: Rscript gmr4.R <input.json> <output.json> <error.txt>")
}

input_file <- args[1]
output_file <- args[2]
error_file <- args[3]

tryCatch({
  params <- jsonlite::fromJSON(input_file)
  
  # 检查必需包
  required_packages <- c("jsonlite", "Matrix", "glmnet")
  for (pkg in required_packages) {
    if (!require(pkg, character.only = TRUE, quietly = TRUE)) {
      stop(paste("Required package not installed:", pkg))
    }
  }
  
  # 提取参数
  X <- as.matrix(params$X)  # 预测变量
  Y <- as.matrix(params$Y)  # 响应变量
  Z <- if (!is.null(params$Z)) as.matrix(params$Z) else NULL  # 协变量
  rank <- params$rank %||% 2
  lambda <- params$lambda %||% 0.1
  
  # GMR⁴ 核心算法（简化版，需根据论文完善）
  # 1. 数据标准化
  X_scaled <- scale(X)
  Y_scaled <- scale(Y)
  
  # 2. 奇异值分解获取初始秩
  svd_result <- svd(crossprod(X_scaled, Y_scaled))
  
  # 3. 正则化降秩回归
  # 使用交替最小化算法
  n <- nrow(X)
  p <- ncol(X)
  q <- ncol(Y)
  
  # 初始化 U 和 V
  U <- svd_result$u[, 1:rank, drop = FALSE]
  V <- svd_result$v[, 1:rank, drop = FALSE]
  
  # 交替优化（简化版本）
  for (iter in 1:100) {
    # 固定 V，更新 U
    UV <- U %*% t(V)
    coef_U <- solve(crossprod(X_scaled) + lambda * diag(p), crossprod(X_scaled, Y_scaled %*% V))
    U <- X_scaled %*% coef_U
    U <- qr.Q(qr(U))  # 正交化
    
    # 固定 U，更新 V
    coef_V <- solve(crossprod(Y_scaled) + lambda * diag(q), crossprod(Y_scaled, X_scaled %*% U))
    V <- Y_scaled %*% coef_V
    V <- qr.Q(qr(V))  # 正交化
    
    # 检查收敛
    if (iter > 1 && max(abs(U - U_old)) < 1e-6 && max(abs(V - V_old)) < 1e-6) {
      break
    }
    U_old <- U
    V_old <- V
  }
  
  # 计算最终系数矩阵
  B <- U %*% t(V)
  
  # 计算拟合值和残差
  Y_fitted <- X_scaled %*% B
  residuals <- Y_scaled - Y_fitted
  
  # 计算 R²
  SS_total <- sum((Y_scaled - mean(Y_scaled))^2)
  SS_residual <- sum(residuals^2)
  R2 <- 1 - SS_residual / SS_total
  
  output <- list(
    success = TRUE,
    coefficients = B,
    U = U,
    V = V,
    R2 = R2,
    rank = rank,
    lambda = lambda,
    iterations = iter
  )
  
  output_json <- jsonlite::toJSON(output, auto_unbox = TRUE, digits = 10, pretty = TRUE)
  writeLines(output_json, output_file)
  
}, error = function(e) {
  writeLines(as.character(e), error_file)
  quit(status = 1)
})
