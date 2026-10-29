# Bayesian ERA with Mediation 脚本
# 基于 2025 年 Psychometrika 论文

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  stop("Usage: Rscript bayesian_era_mediation.R <input.json> <output.json> <error.txt>")
}

input_file <- args[1]
output_file <- args[2]
error_file <- args[3]

tryCatch({
  params <- jsonlite::fromJSON(input_file)
  
  # 检查必需包（需要 Stan 进行贝叶斯推断）
  if (!require("rstan", character.only = TRUE, quietly = TRUE)) {
    stop("rstan package not installed. Install from: https://mc-stan.org/")
  }
  
  # 提取参数
  X <- as.matrix(params$X)  # 预测变量
  Y <- as.matrix(params$Y)  # 响应变量
  M <- as.matrix(params$M)  # 中介变量
  chains <- params$chains %||% 4
  iterations <- params$iterations %||% 2000
  
  # 准备 Stan 数据
  stan_data <- list(
    N = nrow(X),
    P = ncol(X),
    Q = ncol(Y),
    K = ncol(M),
    X = X,
    Y = Y,
    M = M
  )
  
  # Stan 模型代码（简化版 Bayesian ERA with Mediation）
  stan_code <- '
  data {
    int<lower=0> N;
    int<lower=0> P;
    int<lower=0> Q;
    int<lower=0> K;
    matrix[N, P] X;
    matrix[N, Q] Y;
    matrix[N, K] M;
  }
  parameters {
    matrix[P, K] gamma;      // X -> M 路径
    matrix[K, Q] beta_M;     // M -> Y 路径 (间接效应)
    matrix[P, Q] beta_X;     // X -> Y 路径 (直接效应)
    vector<lower=0>[Q] sigma;
  }
  model {
    // 先验
    to_vector(gamma) ~ normal(0, 1);
    to_vector(beta_M) ~ normal(0, 1);
    to_vector(beta_X) ~ normal(0, 1);
    sigma ~ cauchy(0, 2.5);
    
    // 似然
    for (n in 1:N) {
      M[n] ~ normal(X[n] * gamma, 1);
      Y[n] ~ normal(X[n] * beta_X + M[n] * beta_M, sigma);
    }
  }
  generated quantities {
    matrix[P, Q] indirect_effect;
    indirect_effect = gamma * beta_M;  // 间接效应 = gamma * beta_M
  }
  '
  
  # 拟合模型
  stan_model <- stan(model_code = stan_code, data = stan_data,
                     chains = chains, iter = iterations,
                     verbose = FALSE)
  
  # 提取结果
  summary_result <- summary(stan_model)
  draws <- extract(stan_model)
  
  # 计算后验统计
  output <- list(
    success = TRUE,
    gamma_mean = apply(draws$gamma, c(2, 3), mean),
    beta_M_mean = apply(draws$beta_M, c(2, 3), mean),
    beta_X_mean = apply(draws$beta_X, c(2, 3), mean),
    indirect_effect_mean = apply(draws$indirect_effect, c(2, 3), mean),
    sigma_mean = apply(draws$sigma, 2, mean),
    n_eff = summary_result$summary[, "n_eff"],
    Rhat = summary_result$summary[, "Rhat"]
  )
  
  output_json <- jsonlite::toJSON(output, auto_unbox = TRUE, digits = 10, pretty = TRUE)
  writeLines(output_json, output_file)
  
}, error = function(e) {
  writeLines(as.character(e), error_file)
  quit(status = 1)
})
