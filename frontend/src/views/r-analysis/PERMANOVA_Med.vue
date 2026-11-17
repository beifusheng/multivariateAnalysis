<template>
  <div class="permanova-med-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <div>
          <h1 class="page-title">🧬 PERMANOVA-med 中介分析</h1>
          <p class="page-subtitle">中介效应分析：研究预测变量 X 如何通过中介变量 M 影响结果变量 Y</p>
        </div>
        <el-button @click="$router.push('/')" class="btn-back">
          <el-icon>
            <ArrowLeft />
          </el-icon>
          返回首页
        </el-button>
      </div>
    </div>

    <!-- 侧边工具栏 -->
    <div class="side-toolbar" :class="{ 'toolbar-expanded': isToolbarExpanded }">
      <div class="toolbar-toggle" @click="toggleToolbar">
        <el-icon class="toggle-icon" :class="{ 'rotated': isToolbarExpanded }">
          <Setting />
        </el-icon>
      </div>

      <div class="toolbar-content">
        <el-tooltip content="下载 Excel 模板" placement="top">
          <el-button @click="downloadTemplate" type="success" class="toolbar-btn">
            <el-icon>
              <Download />
            </el-icon>
            <span class="btn-text">下载模板</span>
          </el-button>
        </el-tooltip>

        <el-tooltip content="导入 Excel/CSV 数据" placement="top">
          <el-button @click="showImportDialog = true" type="primary" class="toolbar-btn">
            <el-icon>
              <Upload />
            </el-icon>
            <span class="btn-text">导入数据</span>
          </el-button>
        </el-tooltip>

        <el-tooltip content="导出分析结果" placement="top">
          <el-button @click="showExportDialog = true" type="warning" class="toolbar-btn" :disabled="!analysisResult">
            <el-icon>
              <FolderOpened />
            </el-icon>
            <span class="btn-text">导出结果</span>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <div class="config-section">

        <!-- 当前选择的模板 -->
        <div v-if="selectedTemplate" class="selected-template-card">
          <div class="template-card-header">
            <div class="template-card-title">
              <span class="template-icon">📌</span>
              <span>当前选择的模板</span>
            </div>
            <el-button type="info" size="small" plain round @click="clearSelectedTemplate" class="clear-btn">
              清除选择
            </el-button>
          </div>
          <div class="template-card-content">
            <div class="template-info-row">
              <span class="info-label">模板名称：</span>
              <span class="info-value template-name">{{ selectedTemplate.name }}</span>
            </div>
            <div class="template-info-row">
              <span class="info-label">模型公式：</span>
              <code class="formula-code">{{ selectedTemplate.formula }}</code>
            </div>
            <div class="template-tip">
              <span class="tip-icon">💡</span>
              <span>修改公式或数据将自动清除模板选择</span>
            </div>
          </div>
        </div>

        <!-- 常用公式模板 -->
        <div class="template-section">
          <div class="template-header">
            <div class="template-header-title">
              <span class="template-icon">📋</span>
              <span class="template-label">常用公式模板</span>
            </div>
            <el-button class="template-toggle-btn" @click="toggleTemplateCollapse">
              <el-icon class="toggle-icon">
                <component :is="templateCollapsed ? 'CaretRight' : 'CaretBottom'" />
              </el-icon>
              <span class="toggle-text">
                {{ templateCollapsed ? '展开所有模板' : '收起模板' }}
              </span>
            </el-button>
          </div>

          <el-collapse-transition>
            <div v-show="!templateCollapsed">

              <!-- 生物医学方向 -->
              <div class="template-section-title">🔬 生物医学方向</div>
              <div class="template-buttons">
                <el-tooltip content="肠道菌群通过代谢物影响疾病" placement="top">
                  <button type="button" @click="loadTemplate('gut_microbiome_metabolites')"
                    :class="['btn-template', { selected: selectedTemplateId === 'gut_microbiome_metabolites' }]">
                    🦠 肠道菌群 - 代谢物 - 疾病
                  </button>
                </el-tooltip>
                <el-tooltip content="脑肠轴通过神经递质影响行为" placement="top">
                  <button type="button" @click="loadTemplate('brain_gut_axis')"
                    :class="['btn-template', { selected: selectedTemplateId === 'brain_gut_axis' }]">
                    🧠 脑肠轴 - 神经递质 - 行为
                  </button>
                </el-tooltip>
                <el-tooltip content="免疫系统通过炎症反应影响癌症" placement="top">
                  <button type="button" @click="loadTemplate('immune_inflammation_cancer')"
                    :class="['btn-template', { selected: selectedTemplateId === 'immune_inflammation_cancer' }]">
                    🛡️ 免疫 - 炎症 - 癌症
                  </button>
                </el-tooltip>
              </div>

              <!-- 心理学方向 -->
              <div class="template-section-title">🧠 心理学方向</div>
              <div class="template-buttons">
                <el-tooltip content="压力通过睡眠质量影响抑郁" placement="top">
                  <button type="button" @click="loadTemplate('stress_depression_sleep')"
                    :class="['btn-template', { selected: selectedTemplateId === 'stress_depression_sleep' }]">
                    😴 压力 - 睡眠 - 抑郁
                  </button>
                </el-tooltip>
                <el-tooltip content="社会支持通过认知偏差影响焦虑" placement="top">
                  <button type="button" @click="loadTemplate('social_anxiety_cognition')"
                    :class="['btn-template', { selected: selectedTemplateId === 'social_anxiety_cognition' }]">
                    💭 社交 - 认知 - 焦虑
                  </button>
                </el-tooltip>
              </div>

              <!-- 教育研究方向 -->
              <div class="template-section-title">🎓 教育研究方向</div>
              <div class="template-buttons">
                <el-tooltip content="动机通过学习策略影响学业成就" placement="top">
                  <button type="button" @click="loadTemplate('motivation_strategy_achievement')"
                    :class="['btn-template', { selected: selectedTemplateId === 'motivation_strategy_achievement' }]">
                    📚 动机 - 策略 - 学业
                  </button>
                </el-tooltip>
                <el-tooltip content="教学通过学生投入影响表现" placement="top">
                  <button type="button" @click="loadTemplate('teaching_engagement_performance')"
                    :class="['btn-template', { selected: selectedTemplateId === 'teaching_engagement_performance' }]">
                    👨‍🏫 教学 - 投入 - 表现
                  </button>
                </el-tooltip>
              </div>

              <!-- 市场营销方向 -->
              <div class="template-section-title">🛒 市场营销方向</div>
              <div class="template-buttons">
                <el-tooltip content="品牌形象通过忠诚度影响购买" placement="top">
                  <button type="button" @click="loadTemplate('brand_image_loyalty_purchase')"
                    :class="['btn-template', { selected: selectedTemplateId === 'brand_image_loyalty_purchase' }]">
                    🏷️ 品牌形象 - 忠诚度 - 购买
                  </button>
                </el-tooltip>
                <el-tooltip content="广告通过品牌态度影响意向" placement="top">
                  <button type="button" @click="loadTemplate('advertising_attitude_intention')"
                    :class="['btn-template', { selected: selectedTemplateId === 'advertising_attitude_intention' }]">
                    📺 广告 - 态度 - 意向
                  </button>
                </el-tooltip>
              </div>

              <!-- 环境科学方向 -->
              <div class="template-section-title">🌿 环境科学方向</div>
              <div class="template-buttons">
                <el-tooltip content="污染通过生物多样性影响生态系统" placement="top">
                  <button type="button" @click="loadTemplate('pollution_biodiversity_ecosystem')"
                    :class="['btn-template', { selected: selectedTemplateId === 'pollution_biodiversity_ecosystem' }]">
                    🌍 污染 - 生物多样性 - 生态
                  </button>
                </el-tooltip>
              </div>

            </div>
          </el-collapse-transition>
        </div>

        <!-- 数据模板：选中后直接填入可运行的合成数据 -->
        <div class="template-section">
          <div class="template-header">
            <div class="template-header-title">
              <span class="template-icon">🧬</span>
              <span class="template-label">数据模板（{{ medDataCount }} 个 · 含可运行数据）</span>
            </div>
            <el-button class="template-toggle-btn" @click="medDataCollapsed = !medDataCollapsed">
              <el-icon class="toggle-icon">
                <component :is="medDataCollapsed ? 'CaretRight' : 'CaretBottom'" />
              </el-icon>
              <span class="toggle-text">{{ medDataCollapsed ? '展开数据模板' : '收起数据模板' }}</span>
            </el-button>
          </div>

          <div v-if="medDataSummary" class="med-data-current">
            <span>📌 当前数据模板：<b>{{ selectedMedDataLabel }}</b>（{{ medDataSummary }}）</span>
            <el-button link type="primary" size="small" @click="clearMedDataTemplate">清除</el-button>
          </div>

          <el-collapse-transition>
            <div v-show="!medDataCollapsed">
              <div class="med-data-note">
                点击后自动将 M / X / Y / Z 写入下方输入框，可直接点「运行分析」。
                数据为程序合成的演示数据（非实测数据），已经便携版 R 实测：25/25 中介效应 p &lt; 0.05。
              </div>
              <div v-for="group in medDataGroups" :key="group.title">
                <div class="template-section-title">{{ group.title }}</div>
                <div class="template-buttons">
                  <el-tooltip v-for="item in group.items" :key="item.id" :content="item.tip" placement="top">
                    <button type="button" @click="loadMedDataTemplate(item.id)"
                      :class="['btn-template', { selected: selectedMedDataId === item.id }]">
                      {{ item.icon }} {{ item.label }}
                    </button>
                  </el-tooltip>
                </div>
              </div>
            </div>
          </el-collapse-transition>
        </div>

        <!-- 数据输入区域 -->
        <div class="data-input-section">
          <h2 class="section-title">📊 数据输入</h2>

          <div class="input-hint-card">
            <el-icon>
              <InfoFilled />
            </el-icon>
            <span>请输入 4 个数据矩阵，所有矩阵的样本数必须一致。协变量为可选项。</span>
          </div>
          <div class="data-input-grid">
            <!-- 结果变量 Y -->
            <div class="data-input-card">
              <h3>📈 结果变量 (Y)</h3>
              <p class="input-hint">因变量矩阵，n 个样本 × m 个变量</p>
              <el-input v-model="permanovaMedParams.outcomeDataStr" type="textarea" :rows="6" placeholder='推荐二维数组 [[...],[...]]（每行一个样本）：
[
  [1.2, 3.4],
  [2.3, 4.5],
  [1.8, 3.9]
]
也支持 {"Sample1": [1.2, 3.4]} 行字典与 {"Y1": [1.2, 2.3, 1.8]} 列字典' @change="onOutcomeDataChange" />
              <div class="validation-status">
                <el-tag :type="permanovaMedParams.outcomeDataValid ? 'success' : 'info'" size="small">
                  {{ permanovaMedParams.outcomeDataValid ? ('✓ 数据有效 ' + permanovaMedParams.outcomeInfo) : '等待输入' }}
                </el-tag>
                <span v-if="permanovaMedParams.outcomeDataError" class="error-text">
                  {{ permanovaMedParams.outcomeDataError }}
                </span>
              </div>
            </div>

            <!-- 中介变量 M -->
            <div class="data-input-card">
              <h3>🔗 中介变量 (M)</h3>
              <p class="input-hint">中介变量矩阵，n 个样本 × p 个变量</p>
              <el-input v-model="permanovaMedParams.mediatorDataStr" type="textarea" :rows="6" placeholder='推荐二维数组 [[...],[...]]（微生物组为 样本 × OTU 非负计数）：
[
  [0.5, 1.2, 0.8],
  [0.7, 1.5, 0.9]
]
也支持 {"Sample1": [0.5, 1.2]} 行字典与 {"OTU1": [0.5, 0.7]} 列字典' @change="onMediatorDataChange" />
              <div class="validation-status">
                <el-tag :type="permanovaMedParams.mediatorDataValid ? 'success' : 'info'" size="small">
                  {{ permanovaMedParams.mediatorDataValid ? ('✓ 数据有效 ' + permanovaMedParams.mediatorInfo) : '等待输入' }}
                </el-tag>
                <span v-if="permanovaMedParams.mediatorDataError" class="error-text">
                  {{ permanovaMedParams.mediatorDataError }}
                </span>
              </div>
            </div>

            <!-- 预测变量 X -->
            <div class="data-input-card">
              <h3>📊 预测变量 (X)</h3>
              <p class="input-hint">自变量矩阵，n 个样本 × q 个变量</p>
              <el-input v-model="permanovaMedParams.predictorDataStr" type="textarea" :rows="6" placeholder='推荐二维数组 [[...],[...]]（每行一个样本的暴露值）：
[
  [1, 0],
  [0, 1],
  [1, 1]
]
也支持 {"Sample1": [1, 0]} 行字典与 {"X1": [1, 0, 1]} 列字典' @change="onPredictorDataChange" />
              <div class="validation-status">
                <el-tag :type="permanovaMedParams.predictorDataValid ? 'success' : 'info'" size="small">
                  {{ permanovaMedParams.predictorDataValid ? ('✓ 数据有效 ' + permanovaMedParams.predictorInfo) : '等待输入' }}
                </el-tag>
                <span v-if="permanovaMedParams.predictorDataError" class="error-text">
                  {{ permanovaMedParams.predictorDataError }}
                </span>
              </div>
            </div>

            <!-- 协变量（可选） -->
            <div class="data-input-card optional">
              <h3>🔧 协变量（可选）</h3>
              <p class="input-hint">需要控制的混杂变量</p>
              <el-input v-model="permanovaMedParams.covariatesStr" type="textarea" :rows="6" placeholder='推荐二维数组 [[...],[...]]（每行一个样本）：
[
  [25, 22.5],
  [30, 25.0],
  [35, 23.5]
]
也支持 {"Age": [25, 30, 35]} 列字典；如不需要，留空即可' @change="onCovariatesChange" />
              <div class="validation-status">
                <el-tag :type="permanovaMedParams.covariatesValid ? 'success' : 'info'" size="small">
                  {{ permanovaMedParams.covariatesValid ? ('✓ 数据有效 ' + permanovaMedParams.covariatesInfo) : '可选' }}
                </el-tag>
                <span v-if="permanovaMedParams.covariatesError" class="error-text">
                  {{ permanovaMedParams.covariatesError }}
                </span>
              </div>
            </div>
          </div>

          <!-- 置换次数 -->
          <div class="data-input-card">
            <h3>🔄 置换次数</h3>
            <p class="input-hint">统计显著性检验的置换次数</p>
            <el-input-number v-model="permanovaMedParams.permutations" :min="100" :max="10000" :step="100"
              step-strictly controls-position="right" style="width: 100%;"
              @change="onPermutationsChange" />
            <p class="formula-hint">
              💡 LDM 要求置换次数为 <b>100 的整数倍</b>（控件已限步长 100）；建议 ≥ 1000 以获得稳定 p 值。
              若填入非 100 倍数的值，R 侧会自动上调并在结果中告知实际使用次数。
            </p>
          </div>
        </div>
        <!-- 样本数不一致时先在前端提示，避免白跑一次 R -->
        <div v-if="permanovaMedParams.sampleMismatch" class="sample-mismatch">
          <el-icon><WarningFilled /></el-icon>
          <span>{{ permanovaMedParams.sampleMismatch }}</span>
        </div>

        <!-- 运行分析按钮 -->
        <div class="run-button-container">
          <button @click="runPERMANOVAMed" class="btn-run" :disabled="!canRunAnalysis">
            <el-icon>
              <VideoPlay />
            </el-icon>
            运行分析
          </button>
          <span v-if="!canRunAnalysis" class="run-hint">
            <el-icon>
              <InfoFilled />
            </el-icon>
            <span>请确保所有数据有效</span>
          </span>
        </div>

        <!-- 结果展示（与 PERMANOVA 一致：放在 config-section 内部，共用同一张白卡片） -->
        <div v-if="analysisResult" class="result-section">
        <h2 class="section-title">📊 分析结果</h2>

        <!-- 中介效应结论 -->
        <div :class="['med-headline-card', analysisResult.significant_mediation ? 'sig' : 'nsig']">
          <div class="med-headline-left">
            <div class="med-p-big">{{ fmtP(analysisResult.mediation_p) }}</div>
            <div class="med-p-caption">中介效应 p 值（LDM 置换检验）</div>
          </div>
          <div class="med-headline-right">
            <el-tag :type="analysisResult.significant_mediation ? 'success' : 'info'" size="large" effect="dark">
              {{ analysisResult.significant_mediation ? '✓ 中介效应显著' : '× 中介效应不显著' }}
            </el-tag>
            <p class="med-interp">{{ analysisResult.interpretation }}</p>
            <p class="med-sub">
              样本数 {{ analysisResult.sample_size }}｜完成置换 {{ analysisResult.n_perm_completed || analysisResult.n_perm_used }} 次（请求 {{ analysisResult.n_perm_requested }}，实际使用 {{ analysisResult.n_perm_used }}）
              <template v-if="analysisResult.mediation_p_omni">｜omni p = {{ fmtP(analysisResult.mediation_p_omni) }}</template>
              <template v-if="analysisResult.ldm_version">｜LDM {{ analysisResult.ldm_version }}</template>
            </p>
          </div>
        </div>

        <!-- 分组置换检验（LDM 的序贯检验结果） -->
        <div class="mediator-effects-card">
          <h3>🔗 分组置换检验（序贯）</h3>
          <el-table :data="analysisResult.covariate_tests || []" border style="width: 100%"
            :header-cell-style="{ background: '#f0f9ff', color: '#0369a1', fontWeight: 600 }">
            <el-table-column prop="term" label="协变量组（角色）" min-width="160" />
            <el-table-column prop="label" label="公式项" min-width="90" />
            <el-table-column label="F 统计量" min-width="110">
              <template #default="scope">{{ fmt(scope.row.F_statistic, 4) }}</template>
            </el-table-column>
            <el-table-column label="R²" min-width="100">
              <template #default="scope">{{ fmt(scope.row.R2, 4) }}</template>
            </el-table-column>
            <el-table-column label="p 值" min-width="110">
              <template #default="scope">
                <span :class="getSignificanceClass(scope.row.p_value)">{{ fmtP(scope.row.p_value) }}</span>
              </template>
            </el-table-column>
          </el-table>
          <p class="table-note">
            LDM 按公式顺序逐组检验：第 1 组（暴露 X）看中介矩阵能被 X 解释多少；第 2 组（结局 Y）是在 X 已入模后，Y 还能多解释多少。
            中介统计量取两组 F 之积，因此两组都要有一定解释力才会显著。
          </p>
        </div>

        <!-- 路径分解（标量可视化口径） -->
        <div v-if="pathData" class="global-effect-card">
          <h3>🧭 路径分解（标准化系数）</h3>
          <div class="effect-stats">
            <div class="stat-item">
              <div class="stat-label">a：X → M轴</div>
              <div class="stat-value">{{ fmt(pathData.a, 4) }}</div>
              <div class="stat-sub" :class="getSignificanceClass(pathData.a_p)">p = {{ fmtP(pathData.a_p) }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">b：M轴 → Y｜X</div>
              <div class="stat-value">{{ fmt(pathData.b, 4) }}</div>
              <div class="stat-sub" :class="getSignificanceClass(pathData.b_p)">p = {{ fmtP(pathData.b_p) }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">间接效应 a×b</div>
              <div class="stat-value">{{ fmt(pathData.indirect, 4) }}</div>
              <div class="stat-sub">95%CI {{ fmt(pathData.indirect_ci?.[0], 3) }} ~ {{ fmt(pathData.indirect_ci?.[1], 3) }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">直接效应 c′</div>
              <div class="stat-value">{{ fmt(pathData.c_prime, 4) }}</div>
              <div class="stat-sub" :class="getSignificanceClass(pathData.c_prime_p)">p = {{ fmtP(pathData.c_prime_p) }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">总效应</div>
              <div class="stat-value">{{ fmt(pathData.total, 4) }}</div>
              <div class="stat-sub">中介比例 {{ fmt((pathData.proportion_mediated ?? 0) * 100, 2) }}%</div>
            </div>
          </div>
          <p class="table-note">{{ chartData?.note }}</p>
        </div>

        <!-- 模型信息 -->
        <div v-if="analysisResult.model_info" class="model-info-card">
          <h3>🧩 模型信息</h3>
          <div class="info-grid">
            <div class="info-item"><span class="info-label">LDM 公式</span>
              <code class="formula-code">{{ analysisResult.model_info.formula }}</code></div>
            <div class="info-item"><span class="info-label">中介矩阵规模</span>
              <span class="info-value">{{ analysisResult.model_info.mediator_dim }}</span></div>
            <div class="info-item"><span class="info-label">中介矩阵类型</span>
              <span class="info-value">{{ analysisResult.model_info.mediator_is_distance ? '对称距离矩阵' : '变量矩阵（OTU/丰度）' }}</span></div>
            <div class="info-item"><span class="info-label">暴露 / 结局变量数</span>
              <span class="info-value">{{ analysisResult.model_info.exposure_vars }} / {{ analysisResult.model_info.outcome_vars }}</span></div>
            <div class="info-item"><span class="info-label">混杂校正变量数</span>
              <span class="info-value">{{ analysisResult.model_info.confounder_vars }}</span></div>
            <div class="info-item"><span class="info-label">是否校正 OTU 表尺度</span>
              <span class="info-value">{{ analysisResult.model_info.scale_otu_table ? '是' : '否' }}</span></div>
            <div class="info-item"><span class="info-label">运行时间</span>
              <span class="info-value">{{ analysisResult.timestamp }}</span></div>
          </div>
        </div>

        <!-- 可视化图表 -->
        <div class="visualization-section">
          <h3>📈 数据可视化</h3>
          <el-tabs v-model="activeChartType" @tab-click="handleChartTypeChange">
            <el-tab-pane v-for="chart in chartTypes" :key="chart.id" :label="chart.name" :name="chart.id" />
          </el-tabs>
          <div v-if="!chartData" class="chart-empty">本次结果未包含图表数据（请更新 r-scripts/permanova_med.R 后重试）。</div>
          <div v-else ref="medChart" class="chart-container" style="height: 500px;"></div>
        </div>
        </div><!-- result-section -->
      </div><!-- config-section -->
    </div><!-- main-content -->
  </div><!-- permanova-med-container -->

  <!-- 导入对话框 -->
  <el-dialog v-model="showImportDialog" title="📥 导入数据" width="900px" :close-on-click-modal="false">
    <el-upload drag :auto-upload="false" :on-change="handleFileChange" :show-file-list="false" accept=".xlsx,.xls,.csv">
      <el-icon class="el-icon--upload">
        <UploadFilled />
      </el-icon>
      <div class="el-upload__text">
        将文件拖到此处，或<em>点击上传</em>
      </div>
      <template #tip>
        <div class="el-upload__tip">
          支持 Excel (.xlsx/.xls) 和 CSV 文件，包含 4 个 sheet：Outcome、Mediator、Predictor、Covariates
        </div>
      </template>
    </el-upload>

    <div v-if="importPreview" class="import-preview">
      <el-tabs v-model="importPreviewActiveTab">
        <el-tab-pane label="结果变量 (Y)" name="outcome">
          <el-table :data="importPreview.outcomePreview" border max-height="300">
            <el-table-column v-for="col in importPreview.outcomeCols" :key="col.key" :prop="col.key"
              :label="col.label" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="中介变量 (M)" name="mediator">
          <el-table :data="importPreview.mediatorPreview" border max-height="300">
            <el-table-column v-for="col in importPreview.mediatorCols" :key="col.key" :prop="col.key"
              :label="col.label" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="预测变量 (X)" name="predictor">
          <el-table :data="importPreview.predictorPreview" border max-height="300">
            <el-table-column v-for="col in importPreview.predictorCols" :key="col.key" :prop="col.key"
              :label="col.label" />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="协变量" name="covariates">
          <el-table :data="importPreview.covariatesPreview" border max-height="300">
            <el-table-column v-for="col in importPreview.covariatesCols" :key="col.key" :prop="col.key"
              :label="col.label" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <el-button @click="showImportDialog = false">取消</el-button>
      <el-button type="primary" @click="confirmImport">确认导入</el-button>
    </template>
  </el-dialog>

  <!-- 导出对话框 -->
  <el-dialog v-model="showExportDialog" title="💾 导出结果" width="500px">
    <div class="export-dialog-content">
      <p class="export-hint">选择要导出的内容：</p>

      <div class="export-options">
        <el-checkbox-group v-model="exportOptions">
          <div class="checkbox-wrapper">
            <el-checkbox label="json">完整结果 (JSON)</el-checkbox>
          </div>
          <div class="checkbox-wrapper">
            <el-checkbox label="globalEffect">分组置换检验 (Excel)</el-checkbox>
          </div>
          <div class="checkbox-wrapper">
            <el-checkbox label="mediatorEffects">路径分解 (Excel)</el-checkbox>
          </div>
          <div class="checkbox-wrapper">
            <el-checkbox label="chartPNG">当前图表 (PNG)</el-checkbox>
          </div>
        </el-checkbox-group>
      </div>
    </div>

    <template #footer>
      <el-button @click="showExportDialog = false">取消</el-button>
      <el-button type="warning" @click="confirmExport" :disabled="exportOptions.length === 0">
        导出
      </el-button>
    </template>
  </el-dialog>
</template>

<script>
import { defineComponent } from 'vue';
import {
  ArrowLeft, Document, Connection, DataLine, TrendCharts,
  Histogram, Filter, InfoFilled, VideoPlay, UploadFilled,
  Download, Upload, FolderOpened, Setting, CaretRight, CaretBottom, WarningFilled
} from '@element-plus/icons-vue';
import { ElLoading, ElMessage } from 'element-plus';
import { checkR, runPERMANOVA_Med } from '@/api/r';
import TemplateCategory from '../../components/r-analysis/TemplateCategory.vue';
import templateData from '../../data/permanova-med-templates.json';
import chartConfig from '../../data/permanova-med-charts.json';
// 25 个「数据模板」：一键生成可直接运行的合成数据（已经便携版 R 实测 25/25 中介 p<0.05）
import { MED_TEMPLATE_GROUPS, MED_TEMPLATE_MAP, buildMedTemplateData } from '@/utils/medTemplates';
// 输入格式解析（与 R 侧 permanova_med.R 的 to_num_matrix 同一套语义）
import {
  inspectMatrix as parseMatrix,
  refSampleNFrom,
  sampleMismatchMessage
} from '@/utils/matrixInput';
// 图表配置生成（纯函数，可在 node 侧用真实 R 输出做单测）
import { MED_CHART_BUILDERS, makeFormatters } from '@/utils/medCharts';

const FORMATTERS = makeFormatters();

export default defineComponent({
  name: 'PERMANOVA_Med',
  components: {
    TemplateCategory,
    ArrowLeft, Document, Connection, DataLine, TrendCharts,
    Histogram, Filter, InfoFilled, VideoPlay, UploadFilled,
    Download, Upload, FolderOpened, Setting, CaretRight, CaretBottom, WarningFilled
  },
  data() {
    return {
      // 模板相关
      selectedTemplateId: null,
      selectedTemplate: null,
      templateCollapsed: true, // 初始收缩

      // 数据模板（含可运行合成数据）
      medDataGroups: MED_TEMPLATE_GROUPS,
      medDataCount: MED_TEMPLATE_GROUPS.reduce((s, g) => s + g.items.length, 0),
      medDataCollapsed: true,
      selectedMedDataId: null,
      selectedMedDataLabel: '',
      medDataSummary: '',

      // 分析参数
      permanovaMedParams: {
        outcomeDataStr: '',
        mediatorDataStr: '',
        predictorDataStr: '',
        covariatesStr: '',
        outcomeDataValid: false,
        mediatorDataValid: false,
        predictorDataValid: false,
        covariatesValid: true,
        outcomeDataError: '',
        mediatorDataError: '',
        predictorDataError: '',
        covariatesError: '',
        outcomeInfo: '',
        mediatorInfo: '',
        predictorInfo: '',
        covariatesInfo: '',
        sampleMismatch: '',
        mediatorN: null,
        permutations: 1000
      },

      // 分析结果
      analysisResult: null,

      // 图表相关
      activeChartType: 'path',

      // 侧边栏
      isToolbarExpanded: false, // 初始收缩

      // 导入相关
      showImportDialog: false,
      importPreview: null,
      importPreviewActiveTab: 'outcome',
      importError: '',
      importedData: null,

      // 导出相关
      showExportDialog: false,
      exportOptions: ['json', 'globalEffect', 'mediatorEffects', 'chartPNG'],
      exportError: '',

      // R 环境状态
      rAvailable: false
    };
  },

  computed: {
    templateConfig() {
      return templateData;
    },

    chartTypes() {
      return chartConfig.chartTypes.filter(c => c.enabled);
    },

    // R 侧新输出的图表数据（旧版本 R 脚本可能没有，故容错）
    chartData() {
      return this.analysisResult?.chart_data || null;
    },

    pathData() {
      return this.chartData?.path || null;
    },

    canRunAnalysis() {
      return this.permanovaMedParams.outcomeDataValid &&
        this.permanovaMedParams.mediatorDataValid &&
        this.permanovaMedParams.predictorDataValid &&
        !this.permanovaMedParams.sampleMismatch;
    }
  },

  mounted() {
    console.log('[PERMANOVA-med] mounted');
    // 滚动到页面顶部
    window.scrollTo(0, 0);
    // 检查 R 环境
    this.checkRStatus();
  },

  methods: {
    // 检查 R 环境
    async checkRStatus() {
      try {
        const result = await checkR();
        this.rAvailable = result.available;
      } catch (error) {
        console.error('R check failed:', error);
        this.rAvailable = false;
      }
    },

    // 返回主页
    goBack() {
      this.$router.push('/');
    },

    // 切换工具栏
    toggleToolbar() {
      this.isToolbarExpanded = !this.isToolbarExpanded;
    },

    // 切换模板折叠状态
    toggleTemplateCollapse() {
      this.templateCollapsed = !this.templateCollapsed;
    },

    // 加载模板
    loadTemplate(templateId) {
      console.log('[PERMANOVA-med] Load template:', templateId);

      if (this.selectedTemplateId === templateId) {
        this.clearSelectedTemplate();
        return;
      }

      this.selectedTemplateId = templateId;

      // 查找模板
      for (const cat of this.templateConfig.categories) {
        const tmpl = cat.templates.find(t => t.id === templateId);
        if (tmpl) {
          this.selectedTemplate = { ...tmpl, color: cat.color };
          // 回填数据到输入框
          this.fillTemplateData(tmpl);
          break;
        }
      }

      console.log('[PERMANOVA-med] Loaded template:', this.selectedTemplate);
    },

    // 回填模板数据
    fillTemplateData(template) {
      // 生成示例数据格式提示
      const outcomeExample = {
        'Sample1': [1.2, 3.4, 2.1],
        'Sample2': [2.3, 4.5, 3.2],
        'Sample3': [1.8, 3.9, 2.7]
      };

      const mediatorExample = {
        'Sample1': [0.5, 1.2],
        'Sample2': [0.7, 1.5],
        'Sample3': [0.6, 1.3]
      };

      const predictorExample = {
        'Sample1': [1, 0],
        'Sample2': [0, 1],
        'Sample3': [1, 1]
      };

      const covariatesExample = {
        'Age': [25, 30, 35],
        'BMI': [22.5, 25.0, 23.5]
      };

      // 填充输入框（示例格式）
      this.permanovaMedParams.outcomeDataStr = JSON.stringify(outcomeExample, null, 2);
      this.permanovaMedParams.mediatorDataStr = JSON.stringify(mediatorExample, null, 2);
      this.permanovaMedParams.predictorDataStr = JSON.stringify(predictorExample, null, 2);
      this.permanovaMedParams.covariatesStr = JSON.stringify(covariatesExample, null, 2);

      // 触发验证
      this.validateOutcomeData();
      this.validateMediatorData();
      this.validatePredictorData();
      this.validateCovariates();

      ElMessage.success(`已加载模板：${template.name}`);
    },

    // 清除选择
    clearSelectedTemplate() {
      this.selectedTemplateId = null;
      this.selectedTemplate = null;
    },

    // 数据验证
    // 回填模板数据
    // 公式预设只描述研究设计（X→M→Y 的角色与变量名），本身不包含数据。
    // 以前这里会写入 3 行假矩阵：既不是模板描述的结构，又让直接运行必然失败，
    // 因此改为保留用户已有数据，并提示如何拿到可运行数据。
    fillTemplateData(template) {
      const empty = !this.permanovaMedParams.mediatorDataStr.trim();
      if (empty) {
        ElMessage.info({
          message: `已应用公式预设「${template.name}」（中介：${template.mediator || 'M'}）。`
            + '该预设不含数据，请再点一个「数据模板」生成可运行数据，或用 Excel 导入自己的数据。',
          duration: 7000
        });
      } else {
        ElMessage.success(`已应用公式预设：${template.name}（当前数据保持不变）`);
      }
    },

    // 载入数据模板（生成并回填可直接运行的合成数据）
    loadMedDataTemplate(id) {
      const item = MED_TEMPLATE_MAP[id];
      if (!item) {
        ElMessage.error(`未知数据模板：${id}`);
        return;
      }
      if (this.selectedMedDataId === id) {
        this.clearMedDataTemplate();
        return;
      }
      try {
        const d = buildMedTemplateData(item.spec);
        const p = this.permanovaMedParams;
        p.mediatorDataStr = JSON.stringify(d.mediatorData);
        p.predictorDataStr = JSON.stringify(d.predictorData);
        p.outcomeDataStr = JSON.stringify(d.outcomeData);
        p.covariatesStr = d.covariates ? JSON.stringify(d.covariates) : '';

        // 先算中介（定义样本数），再校验其他，用于行/列字典消歧
        this.validateMediatorData();
        this.validatePredictorData();
        this.validateOutcomeData();
        this.validateCovariates();

        this.selectedMedDataId = id;
        this.selectedMedDataLabel = item.label;
        this.medDataSummary = `${d.n} 样本 × ${d.taxa} 中介变量｜LDM 公式 ${d.formula}｜${item.spec.note || item.tip}`;
        this.analysisResult = null;
        ElMessage.success(`已载入数据模板：${item.label}，可直接运行分析`);
      } catch (e) {
        ElMessage.error('数据模板生成失败：' + e.message);
      }
    },

    clearMedDataTemplate() {
      const p = this.permanovaMedParams;
      p.mediatorDataStr = '';
      p.predictorDataStr = '';
      p.outcomeDataStr = '';
      p.covariatesStr = '';
      p.mediatorN = null;
      p.mediatorInfo = p.predictorInfo = p.outcomeInfo = p.covariatesInfo = '';
      p.mediatorDataValid = false;
      p.predictorDataValid = false;
      p.outcomeDataValid = false;
      p.covariatesValid = true;
      p.sampleMismatch = '';
      this.selectedMedDataId = null;
      this.selectedMedDataLabel = '';
      this.medDataSummary = '';
      this.analysisResult = null;
    },

    // 从其他矩阵推出参照样本数（用于判别对象格式是行还是列）
    refSampleN(excludeField) {
      // 解析语义统一由 @/utils/matrixInput 提供，避免与 R 侧 to_num_matrix 漂移
      return refSampleNFrom(this.permanovaMedParams, excludeField);
    },

    // 三种历史写法 -> 「样本 × 变量」二维数组
    inspectMatrix(str, refN) {
      return parseMatrix(str, refN);
    },

    // 四个矩阵样本数一致性检查（前端先拦住，不等到 R 报错）
    checkSampleConsistency() {
      const p = this.permanovaMedParams;
      p.sampleMismatch = sampleMismatchMessage([
        ['中介 M', p.mediatorDataStr],
        ['暴露 X', p.predictorDataStr],
        ['结局 Y', p.outcomeDataStr],
        ['协变量 Z', p.covariatesStr],
      ], p.mediatorN);
    },

        validateOutcomeData() {
      try {
        if (!this.permanovaMedParams.outcomeDataStr.trim()) {
          this.permanovaMedParams.outcomeDataValid = false;
          this.permanovaMedParams.outcomeDataError = '请输入结果变量数据';
          return;
        }

        const ref = this.permanovaMedParams.mediatorN ?? this.refSampleN('outcomeDataStr');
        const info = this.inspectMatrix(this.permanovaMedParams.outcomeDataStr, ref);
        this.permanovaMedParams.outcomeDataValid = info.ok;
        this.permanovaMedParams.outcomeDataError = info.ok ? '' : info.error;
        this.permanovaMedParams.outcomeInfo = info.ok ? `${info.n} 样本 × ${info.p} 变量` : '';
        this.checkSampleConsistency();
      } catch (e) {
        this.permanovaMedParams.outcomeDataValid = false;
        this.permanovaMedParams.outcomeDataError = 'JSON 格式错误：' + e.message;
      }
    },

    validateMediatorData() {
      try {
        if (!this.permanovaMedParams.mediatorDataStr.trim()) {
          this.permanovaMedParams.mediatorDataValid = false;
          this.permanovaMedParams.mediatorDataError = '请输入中介变量数据';
          return;
        }

        const ref = this.refSampleN('mediatorDataStr');
        const info = this.inspectMatrix(this.permanovaMedParams.mediatorDataStr, ref);
        this.permanovaMedParams.mediatorDataValid = info.ok;
        this.permanovaMedParams.mediatorDataError = info.ok ? '' : info.error;
        this.permanovaMedParams.mediatorInfo = info.ok ? `${info.n} 样本 × ${info.p} 变量` : '';
        this.permanovaMedParams.mediatorN = info.ok ? info.n : null;
        this.checkSampleConsistency();
      } catch (e) {
        this.permanovaMedParams.mediatorDataValid = false;
        this.permanovaMedParams.mediatorDataError = 'JSON 格式错误：' + e.message;
      }
    },

    validatePredictorData() {
      try {
        if (!this.permanovaMedParams.predictorDataStr.trim()) {
          this.permanovaMedParams.predictorDataValid = false;
          this.permanovaMedParams.predictorDataError = '请输入预测变量数据';
          return;
        }

        const ref = this.permanovaMedParams.mediatorN ?? this.refSampleN('predictorDataStr');
        const info = this.inspectMatrix(this.permanovaMedParams.predictorDataStr, ref);
        this.permanovaMedParams.predictorDataValid = info.ok;
        this.permanovaMedParams.predictorDataError = info.ok ? '' : info.error;
        this.permanovaMedParams.predictorInfo = info.ok ? `${info.n} 样本 × ${info.p} 变量` : '';
        this.checkSampleConsistency();
      } catch (e) {
        this.permanovaMedParams.predictorDataValid = false;
        this.permanovaMedParams.predictorDataError = 'JSON 格式错误：' + e.message;
      }
    },

    validateCovariates() {
      try {
        if (!this.permanovaMedParams.covariatesStr.trim()) {
          this.permanovaMedParams.covariatesValid = true;
          return;
        }

        const ref = this.permanovaMedParams.mediatorN ?? this.refSampleN('covariatesStr');
        const info = this.inspectMatrix(this.permanovaMedParams.covariatesStr, ref);
        this.permanovaMedParams.covariatesValid = info.ok;
        this.permanovaMedParams.covariatesError = info.ok ? '' : info.error;
        this.permanovaMedParams.covariatesInfo = info.ok ? `${info.n} 样本 × ${info.p} 变量` : '';
        this.checkSampleConsistency();
      } catch (e) {
        this.permanovaMedParams.covariatesValid = false;
        this.permanovaMedParams.covariatesError = 'JSON 格式错误：' + e.message;
      }
    },

    onOutcomeDataChange() {
      this.validateOutcomeData();
    },

    onMediatorDataChange() {
      this.validateMediatorData();
    },

    onPredictorDataChange() {
      this.validatePredictorData();
    },

    onCovariatesChange() {
      this.validateCovariates();
    },

    // 运行分析
    async runPERMANOVAMed() {
      console.log('[PERMANOVA-med] runPERMANOVAMed called');

      const loadingInstance = ElLoading.service({
        lock: true,
        text: '正在执行 PERMANOVA-med 分析...',
        background: 'rgba(0, 0, 0, 0.5)'
      });

      try {
        // 统一转成「样本 × 变量」二维数组再发送，避开历史三种格式在 R 侧的歧义
        const toRows = (field) => {
          const ref = field === 'mediatorDataStr' ? this.refSampleN('mediatorDataStr') : this.permanovaMedParams.mediatorN;
          const r = this.inspectMatrix(this.permanovaMedParams[field], ref);
          if (!r.ok) throw new Error(r.error);
          return r.rows;
        };

        const params = {
          outcomeData: toRows('outcomeDataStr'),
          mediatorData: toRows('mediatorDataStr'),
          predictorData: toRows('predictorDataStr'),
          covariates: this.permanovaMedParams.covariatesStr.trim() ? toRows('covariatesStr') : null,
          permutations: this.permanovaMedParams.permutations
        };

        console.log('[PERMANOVA-med] Running analysis with params:', params);

        const result = await runPERMANOVA_Med(params);

        console.log('[PERMANOVA-med] Analysis result:', result);

        this.analysisResult = result;
        ElMessage.success('PERMANOVA-med 分析完成！');

        // 自动切换到结果区域并立即渲染图表（之前只在切 tab 时渲染，导致运行后图表空白）
        this.$nextTick(() => {
          document.querySelector('.result-section')?.scrollIntoView({ behavior: 'smooth' });
          this.renderCurrentChart();
        });
      } catch (error) {
        console.error('[PERMANOVA-med] Analysis error:', error);
        
        // 检查是否是 Electron 环境
        if (error.message.includes('ipcRenderer') || !window.electron) {
          ElMessage.error({
            message: '请在 Electron 窗口中运行（不是浏览器）',
            duration: 5000
          });
        } else {
          ElMessage.error('分析失败：' + error.message);
        }
      } finally {
        loadingInstance.close();
      }
    },

    // 处理图表切换
    handleChartTypeChange() {
      console.log('[PERMANOVA-med] Chart type changed to:', this.activeChartType);
      this.$nextTick(() => {
        this.renderCurrentChart();
      });
    },

    // 渲染当前图表（配置生成在 @/utils/medCharts 里，便于单测）
    renderCurrentChart() {
      const el = this.$refs.medChart;
      if (!el || !this.chartData) return;

      import('echarts').then((echarts) => {
        const chart = echarts.getInstanceByDom(el) || echarts.init(el);
        const build = MED_CHART_BUILDERS[this.activeChartType] || MED_CHART_BUILDERS.bar;
        chart.setOption(build(this.chartData, FORMATTERS), true);
        chart.resize();
      }).catch((e) => {
        console.error('[PERMANOVA-med] 图表加载失败:', e);
        ElMessage.error('图表库加载失败：' + e.message);
      });
    },

    // ---- 数值格式化（表格与图表共用）----
    fmt(v, d = 4) {
      return FORMATTERS.fmt(v, d);
    },

    fmtP(v) {
      return FORMATTERS.fmtP(v);
    },

    onPermutationsChange(v) {
      const n = Math.max(100, Math.round((Number(v) || 100) / 100) * 100);
      if (n !== v) this.permanovaMedParams.permutations = n;
    },

    // 下载模板
    async downloadTemplate() {
      try {
        const XLSX = await import('xlsx');
        const FileSaver = await import('file-saver');

        const wb = XLSX.utils.book_new();

        // 创建 4 个 sheet
        const outcomeSheet = XLSX.utils.aoa_to_sheet([
          ['样本 ID', 'Y1', 'Y2', 'Y3'],
          ['Sample1', 1.2, 3.4, 2.1],
          ['Sample2', 2.3, 4.5, 3.2]
        ]);

        const mediatorSheet = XLSX.utils.aoa_to_sheet([
          ['样本 ID', 'M1', 'M2'],
          ['Sample1', 0.5, 1.2],
          ['Sample2', 0.7, 1.5]
        ]);

        const predictorSheet = XLSX.utils.aoa_to_sheet([
          ['样本 ID', 'X1'],
          ['Sample1', 1],
          ['Sample2', 0]
        ]);

        const covariatesSheet = XLSX.utils.aoa_to_sheet([
          ['样本 ID', 'Age', 'BMI'],
          ['Sample1', 25, 22.5],
          ['Sample2', 30, 25.0]
        ]);

        XLSX.utils.book_append_sheet(wb, outcomeSheet, 'Outcome');
        XLSX.utils.book_append_sheet(wb, mediatorSheet, 'Mediator');
        XLSX.utils.book_append_sheet(wb, predictorSheet, 'Predictor');
        XLSX.utils.book_append_sheet(wb, covariatesSheet, 'Covariates');

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        FileSaver.saveAs(blob, `PERMANOVA-med 模板_${timestamp}.xlsx`);

        ElMessage.success('模板下载成功！');
      } catch (error) {
        console.error('[PERMANOVA-med] Download template error:', error);
        ElMessage.error('模板下载失败：' + error.message);
      }
    },

    // 处理文件导入
    handleFileChange(file) {
      console.log('[PERMANOVA-med] File selected:', file.name);

      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const XLSX = await import('xlsx');
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });

          console.log('[PERMANOVA-med] Workbook sheets:', workbook.SheetNames);

          // 解析 4 个 sheet
          const outcomeData = XLSX.utils.sheet_to_json(workbook.Sheets['Outcome']);
          const mediatorData = XLSX.utils.sheet_to_json(workbook.Sheets['Mediator']);
          const predictorData = XLSX.utils.sheet_to_json(workbook.Sheets['Predictor']);
          const covariatesData = workbook.Sheets['Covariates'] ?
            XLSX.utils.sheet_to_json(workbook.Sheets['Covariates']) : [];

          console.log('[PERMANOVA-med] Parsed data:', {
            outcome: outcomeData.length,
            mediator: mediatorData.length,
            predictor: predictorData.length,
            covariates: covariatesData.length
          });

          this.importPreview = {
            outcomePreview: outcomeData,
            outcomeCols: outcomeData.length > 0 ?
              Object.keys(outcomeData[0]).map(k => ({ key: k, label: k })) : [],
            mediatorPreview: mediatorData,
            mediatorCols: mediatorData.length > 0 ?
              Object.keys(mediatorData[0]).map(k => ({ key: k, label: k })) : [],
            predictorPreview: predictorData,
            predictorCols: predictorData.length > 0 ?
              Object.keys(predictorData[0]).map(k => ({ key: k, label: k })) : [],
            covariatesPreview: covariatesData,
            covariatesCols: covariatesData.length > 0 ?
              Object.keys(covariatesData[0]).map(k => ({ key: k, label: k })) : []
          };

          this.importedData = {
            outcome: outcomeData,
            mediator: mediatorData,
            predictor: predictorData,
            covariates: covariatesData
          };

        } catch (error) {
          console.error('[PERMANOVA-med] Parse file error:', error);
          this.importError = '文件解析失败：' + error.message;
        }
      };

      reader.onerror = () => {
        this.importError = '文件读取失败';
      };

      reader.readAsArrayBuffer(file.raw);
    },

    // 确认导入
    confirmImport() {
      if (!this.importedData) {
        ElMessage.error('请先选择文件');
        return;
      }

      try {
        // 转换数据格式
        const outcomeData = this.convertImportData(this.importedData.outcome);
        const mediatorData = this.convertImportData(this.importedData.mediator);
        const predictorData = this.convertImportData(this.importedData.predictor);
        const covariatesData = this.importedData.covariates.length > 0 ?
          this.convertImportData(this.importedData.covariates) : null;

        // 填充到输入框
        this.permanovaMedParams.outcomeDataStr = JSON.stringify(outcomeData, null, 2);
        this.permanovaMedParams.mediatorDataStr = JSON.stringify(mediatorData, null, 2);
        this.permanovaMedParams.predictorDataStr = JSON.stringify(predictorData, null, 2);
        this.permanovaMedParams.covariatesStr = covariatesData ?
          JSON.stringify(covariatesData, null, 2) : '';

        // 验证数据
        this.validateOutcomeData();
        this.validateMediatorData();
        this.validatePredictorData();
        this.validateCovariates();

        this.showImportDialog = false;
        ElMessage.success('数据导入成功！');
      } catch (error) {
        console.error('[PERMANOVA-med] Import error:', error);
        ElMessage.error('导入失败：' + error.message);
      }
    },

    // 转换导入数据格式
    convertImportData(dataArray) {
      const result = {};
      if (dataArray.length === 0) return result;

      const keys = Object.keys(dataArray[0]);
      const sampleIdKey = keys.find(k => k.includes('样本') || k.toLowerCase().includes('sample') || k === 'id');

      if (!sampleIdKey) {
        // 如果没有样本 ID 列，使用索引
        for (let i = 0; i < dataArray.length; i++) {
          result[`Sample${i + 1}`] = keys
            .filter(k => k !== 'id')
            .map(k => dataArray[i][k]);
        }
      } else {
        // 使用样本 ID 列
        for (const row of dataArray) {
          const sampleId = row[sampleIdKey];
          result[sampleId] = keys
            .filter(k => k !== sampleIdKey)
            .map(k => row[k]);
        }
      }

      return result;
    },

    // 导出结果
    async confirmExport() {
      if (!this.analysisResult) {
        ElMessage.error('没有可导出的分析结果');
        return;
      }

      try {
        const XLSX = await import('xlsx');
        const { saveAs } = await import('file-saver');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

        // 导出 JSON
        if (this.exportOptions.includes('json')) {
          const jsonStr = JSON.stringify(this.analysisResult, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          saveAs(blob, `PERMANOVA-med 结果_${timestamp}.json`);
        }

        // 导出分组置换检验（LDM 的真实输出）
        if (this.exportOptions.includes('globalEffect')) {
          const rows = (this.analysisResult.covariate_tests || []).map((t) => ({
            协变量组: t.term, 公式项: t.label,
            F统计量: t.F_statistic, R2: t.R2, p值: t.p_value,
          }));
          const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 说明: '本次结果无分组检验数据' }]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Covariate_Tests');
          const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([wbout], { type: 'application/octet-stream' });
          saveAs(blob, `分组置换检验_${timestamp}.xlsx`);
        }

        // 导出路径分解
        if (this.exportOptions.includes('mediatorEffects')) {
          const p = this.pathData;
          const rows = p ? [
            { 路径: 'a: X → M轴', 估计: p.a, p值: p.a_p, CI下: p.a_ci?.[0], CI上: p.a_ci?.[1] },
            { 路径: 'b: M轴 → Y｜X', 估计: p.b, p值: p.b_p, CI下: p.b_ci?.[0], CI上: p.b_ci?.[1] },
            { 路径: "c': X → Y｜M轴", 估计: p.c_prime, p值: p.c_prime_p, CI下: p.c_prime_ci?.[0], CI上: p.c_prime_ci?.[1] },
            { 路径: '间接效应 a×b', 估计: p.indirect, p值: null, CI下: p.indirect_ci?.[0], CI上: p.indirect_ci?.[1] },
            { 路径: '总效应', 估计: p.total, p值: p.total_p, CI下: null, CI上: null },
            { 路径: '中介比例', 估计: p.proportion_mediated, p值: null, CI下: null, CI上: null },
          ] : [{ 说明: '本次结果无路径分解数据（请更新 r-scripts/permanova_med.R）' }];
          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Path_Decomposition');
          const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([wbout], { type: 'application/octet-stream' });
          saveAs(blob, `路径分解_${timestamp}.xlsx`);
        }

        // 导出图表
        if (this.exportOptions.includes('chartPNG')) {
          const chartContainer = this.$refs.medChart;
          if (chartContainer) {
            const echarts = await import('echarts');
            const myChart = echarts.getInstanceByDom(chartContainer);
            if (myChart) {
              const url = myChart.getDataURL({
                type: 'png',
                pixelRatio: 2,
                backgroundColor: '#ffffff'
              });
              saveAs(url, `分析图表_${timestamp}.png`);
            }
          }
        }

        this.showExportDialog = false;
        ElMessage.success('导出成功！');
      } catch (error) {
        console.error('[PERMANOVA-med] Export error:', error);
        ElMessage.error('导出失败：' + error.message);
      }
    },

    // 获取显著性样式
    getSignificanceClass(pValue) {
      if (!pValue) return '';
      if (pValue < 0.001) return 'significance-high';
      if (pValue < 0.01) return 'significance-medium';
      if (pValue < 0.05) return 'significance-low';
      return '';
    }
  }
});
</script>

<style scoped>
.permanova-med-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
}

.page-header {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 20px;
  padding: 28px 36px;
  margin-bottom: 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-back {
  padding: 12px 28px;
  font-size: 15px;
  font-weight: 700;
  border-radius: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  color: white;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-back:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.5);
}

.btn-back:active {
  transform: translateY(-1px);
}

.page-title {
  font-size: 36px;
  font-weight: 800;
  margin: 0 0 10px 0;
  color: #1a202c;
  letter-spacing: -0.5px;
}

.page-subtitle {
  font-size: 17px;
  color: #718096;
  margin: 0;
  font-weight: 400;
  line-height: 1.6;
}

/* 主内容区域 */
.main-content {
  width: 100%;
  margin: 0 auto;
}

.config-section {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 20px;
  padding: 36px 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.3);
}

/* 模板区域样式（与 PERMANOVA 保持一致） */
.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 8px;
  border: 1px solid #bae6fd;
  box-shadow: 0 2px 8px rgba(14, 165, 233, 0.1);
}

.template-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.template-icon {
  font-size: 20px;
}

.template-label {
  font-size: 15px;
  font-weight: 600;
  color: #0369a1;
  letter-spacing: 0.5px;
}

.template-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(14, 165, 233, 0.3);
}

.template-toggle-btn:hover {
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.5);
}

.sample-mismatch {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  padding: 10px 12px;
  font-size: 13px;
  color: #c45656;
  background: #fef0f0;
  border: 1px solid #fbc4c4;
  border-left: 4px solid #f56c6c;
  border-radius: 6px;
}

.med-data-note {
  margin: 8px 0 4px 0;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.7;
  color: #606266;
  background: #fdf6ec;
  border: 1px solid #f5dab1;
  border-radius: 6px;
}

.med-data-current {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 8px 0;
  padding: 8px 12px;
  font-size: 13px;
  color: #1f2937;
  background: #f0f9eb;
  border: 1px solid #b3e19d;
  border-left: 4px solid #67c23a;
  border-radius: 6px;
}

.template-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1890ff;
  margin: 16px 0 8px 0;
  padding: 8px 12px;
  background: linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%);
  border-radius: 6px;
  border-left: 4px solid #1890ff;
}

.template-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.btn-template {
  padding: 10px 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-template:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
}

.btn-template:active {
  transform: translateY(0);
}

.btn-template.selected {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.5);
  border: 2px solid #fff;
}

/* 当前选择的模板卡片 */
.selected-template-card {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border: 2px solid #bae6fd;
  border-radius: 12px;
  padding: 20px;
  margin: 16px 0;
  box-shadow: 0 4px 16px rgba(3, 105, 161, 0.1);
  transition: all 0.3s ease;
}

.selected-template-card:hover {
  box-shadow: 0 6px 20px rgba(3, 105, 161, 0.15);
  border-color: #7dd3fc;
}

.template-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid #bae6fd;
}

.template-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: #0369a1;
}

.clear-btn {
  border-color: #0284c7;
  color: #0284c7;
  font-size: 13px;
  padding: 6px 16px;
  transition: all 0.3s ease;
}

.clear-btn:hover {
  background: #0284c7;
  color: white;
}

.template-card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-info-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.info-label {
  font-weight: 600;
  color: #0369a1;
  white-space: nowrap;
  min-width: 80px;
  font-size: 14px;
  flex-shrink: 0;
}

.info-value {
  flex: 1;
  color: #0c4a6e;
  font-size: 14px;
  line-height: 1.6;
  text-align: left;
}

.template-name {
  font-weight: 600;
  color: #0369a1;
}

.formula-code {
  background: rgba(255, 255, 255, 0.6);
  padding: 6px 12px;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.template-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border-radius: 8px;
  border: 1px solid #fde68a;
  font-size: 13px;
  color: #92400e;
}

.tip-icon {
  font-size: 16px;
}

.template-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.template-icon {
  font-size: 28px;
}

.template-title {
  font-size: 24px;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
}

.template-formula,
.template-description,
.template-details .detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 12px;
  margin-bottom: 12px;
  font-size: 15px;
  color: #334155;
}

.template-formula .el-icon,
.template-description .el-icon,
.template-details .detail-row .el-icon {
  font-size: 20px;
  color: #0369a1;
  flex-shrink: 0;
  margin-top: 2px;
}

/* 数据输入区域 */
.data-input-section {
  width: 100%;
  margin: 0 auto 30px;
}

.input-hint-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 12px;
  border: 2px solid #bae6fd;
  margin-bottom: 24px;
  font-size: 15px;
  color: #0369a1;
}

.input-hint-card .el-icon {
  font-size: 20px;
  color: #0284c7;
}

.data-input-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 24px;
  margin-bottom: 24px;
}

.data-input-card {
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 24px;
  transition: all 0.3s ease;
}

.data-input-card:hover {
  border-color: #667eea;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.15);
}

.data-input-card.optional {
  border-style: dashed;
}

.data-input-card h3 {
  font-size: 18px;
  font-weight: 700;
  color: #1a202c;
  margin: 0 0 8px;
}

.input-hint {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 12px;
}

.validation-status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.error-text {
  font-size: 13px;
  color: #ef4444;
}

.formula-hint {
  font-size: 13px;
  color: #64748b;
  margin: 12px 0 0;
}

.formula-hint code {
  background: rgba(102, 126, 234, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  color: #667eea;
  font-weight: 600;
}

/* 运行分析按钮容器 */
.run-button-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 2px solid #e2e8f0;
}

.run-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 13px;
  color: #f59e0b;
  font-weight: 500;
  padding: 6px 12px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
}

.btn-run {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 16px 48px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 18px;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
  transition: all 0.3s ease;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.btn-run:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.5);
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
}

.btn-run:active:not(:disabled) {
  transform: translateY(-1px);
}

.btn-run:disabled {
  background: linear-gradient(135deg, #e0e0e0 0%, #d0d0d0 100%);
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
  box-shadow: none;
}

/* 结果区域 */
.result-section {
  margin-top: 30px;
}

.global-effect-card,
.mediator-effects-card,
.visualization-section {
  margin-bottom: 32px;
}

.global-effect-card h3,
.mediator-effects-card h3,
.visualization-section h3 {
  font-size: 20px;
  font-weight: 700;
  color: #1a202c;
  margin: 0 0 20px;
}

.effect-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.stat-item {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}

.stat-label {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #0369a1;
}

.stat-value.significance-high {
  color: #ef4444;
}

.stat-value.significance-medium {
  color: #f59e0b;
}

.stat-value.significance-low {
  color: #10b981;
}

/* 图表容器 */
.chart-container {
  width: 100%;
  height: 500px;
}

/* 侧边工具栏 */
.side-toolbar {
  position: fixed;
  right: 0px;
  top: 50%;
  transform: translateY(-50%);
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 8px 0 0 8px;
  box-shadow: -4px 4px 24px rgba(0, 0, 0, 0.12);
  border: 2px solid #e2e8f0;
  transition: all 0.3s ease;
  z-index: 1000;
  overflow: visible;
}

.side-toolbar.toolbar-expanded {
  width: 180px;
}

.side-toolbar:not(.toolbar-expanded) {
  width: 0px;
}

.toolbar-toggle {
  position: absolute;
  left: -20px;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  z-index: 1001;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.toolbar-toggle:hover {
  transform: translateY(-50%) scale(1.1);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.toggle-icon {
  color: white;
  font-size: 20px;
  transition: transform 0.3s ease;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

.toolbar-content {
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  opacity: 1;
  visibility: visible;
  transition: opacity 0.2s ease, visibility 0.2s ease;
}

.side-toolbar:not(.toolbar-expanded) .toolbar-content {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.toolbar-btn {
  width: calc(100% - 24px);
  margin: 0 12px;
  justify-content: flex-start;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  height: 48px;
  display: flex;
  align-items: center;
}

.toolbar-btn .el-icon {
  font-size: 18px;
  margin-right: 10px;
  flex-shrink: 0;
}

.toolbar-btn .btn-text {
  white-space: nowrap;
}

.toolbar-btn:hover {
  transform: translateX(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.toolbar-btn[type="success"] {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border-color: #86efac;
  color: #166534;
}

.toolbar-btn[type="success"]:hover {
  background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
  border-color: #4ade80;
}

.toolbar-btn[type="primary"] {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border-color: #93c5fd;
  color: #1e40af;
}

.toolbar-btn[type="primary"]:hover {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  border-color: #60a5fa;
}

.toolbar-btn[type="warning"] {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border-color: #fcd34d;
  color: #92400e;
}

.toolbar-btn[type="warning"]:hover {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border-color: #fbbf24;
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* 导入/导出对话框 */
.import-preview {
  margin-top: 20px;
}

.export-dialog-content {
  padding: 20px 0;
}

.export-hint {
  font-size: 15px;
  color: #475569;
  margin: 0 0 20px;
}

.export-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
}

/* 响应式 */
@media (max-width: 768px) {
  .data-input-grid {
    grid-template-columns: 1fr;
  }

  .effect-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
/* ===== 中介分析结果（对齐 LDM 真实输出）===== */
.med-headline-card {
  display: flex;
  gap: 20px;
  align-items: center;
  margin-bottom: 18px;
  padding: 18px 22px;
  border-radius: 12px;
  border: 1px solid #dcdfe6;
  background: #fff;
}

.med-headline-card.sig {
  border-color: #b3e19d;
  background: linear-gradient(135deg, #f0f9eb 0%, #ffffff 60%);
}

.med-headline-card.nsig {
  border-color: #f5dab1;
  background: linear-gradient(135deg, #fdf6ec 0%, #ffffff 60%);
}

.med-headline-left {
  min-width: 150px;
  text-align: center;
}

.med-p-big {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.1;
  color: #303133;
}

.med-p-caption {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

.med-headline-right {
  flex: 1;
}

.med-interp {
  margin: 10px 0 4px 0;
  font-size: 13px;
  line-height: 1.7;
  color: #303133;
}

.med-sub {
  margin: 0;
  font-size: 12px;
  color: #909399;
}

.global-effect-card,
.model-info-card,
.mediator-effects-card {
  margin-bottom: 18px;
  padding: 16px 18px;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  background: #fff;
}

.global-effect-card h3,
.model-info-card h3,
.mediator-effects-card h3 {
  margin: 0 0 12px 0;
  font-size: 15px;
  color: #303133;
}

.stat-sub {
  margin-top: 4px;
  font-size: 11px;
  color: #909399;
}

.stat-sub.significance-high,
.stat-sub.significance-medium,
.stat-sub.significance-low {
  color: #67c23a;
  font-weight: 600;
}

.table-note {
  margin: 10px 0 0 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.7;
  color: #606266;
  background: #f5f7fa;
  border-left: 3px solid #c0c4cc;
  border-radius: 4px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px 18px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.chart-empty {
  padding: 18px;
  font-size: 13px;
  color: #909399;
  text-align: center;
  background: #f5f7fa;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
}
</style>
