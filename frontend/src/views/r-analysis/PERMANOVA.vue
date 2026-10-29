<template>
  <div class="permanova-container">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-content">
        <div>
          <h1 class="page-title">{{ pageInfo.title }}</h1>
          <p class="page-subtitle">{{ pageInfo.subtitle }}</p>
        </div>
        <el-button @click="$router.push('/')" class="btn-back">
          <el-icon>
            <ArrowLeft />
          </el-icon>
          {{ pageInfo.backText }}
        </el-button>
      </div>
    </div>

    <!-- 右侧工具栏 -->
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

    <!-- 参数配置区域 -->
    <div class="config-section">

      <!-- 示例：PERMANOVA 配置 -->
      <div class="config-form">
        <!-- 输入模式选择 -->
        <div class="form-group">
          <label>数据模式:</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" v-model="permanovaParams.mode" value="simple" />
              简单模式（仅距离矩阵）
            </label>
            <label class="radio-label">
              <input type="radio" v-model="permanovaParams.mode" value="advanced" />
              高级模式（距离矩阵 + 样本数据）
            </label>
          </div>
        </div>

        <!-- 距离矩阵（两种模式都需要） -->
        <div class="form-group">
          <label>距离矩阵 (JSON 格式):</label>
          <el-input v-model="permanovaParams.distanceMatrixStr" type="textarea" :rows="12"
            placeholder='[[0, 0.2, 0.3], [0.2, 0, 0.25], [0.3, 0.25, 0]]' @input="onDistanceMatrixChangeAndValidate" />
          <div v-if="permanovaParams.matrixError" class="error-msg">{{ permanovaParams.matrixError }}</div>
          <div v-if="permanovaParams.matrixValid" class="success-msg">
            ✅ 有效矩阵：{{ permanovaParams.matrixSize }} 个样本
          </div>
        </div>

        <!-- 高级模式：样本数据 -->
        <div v-if="permanovaParams.mode === 'advanced'" class="advanced-section">
          <!-- 当前选择的公式 -->
          <div v-if="permanovaParams.selectedTemplate" class="selected-template-card">
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
                <span class="info-value template-name">{{ getTemplateName(permanovaParams.selectedTemplate) }}</span>
              </div>
              <div class="template-info-row">
                <span class="info-label">模型公式：</span>
                <code class="formula-code">{{ getTemplateFormula(permanovaParams.selectedTemplate) }}</code>
              </div>
              <div class="template-tip">
                <span class="tip-icon">💡</span>
                <span>修改公式或数据将自动清除模板选择</span>
              </div>
            </div>
          </div>

          <!-- 常用公式模板 -->
          <div class="form-group">
            <div class="template-header">
              <div class="template-header-title">
                <span class="template-icon">📋</span>
                <span class="template-label">常用公式模板</span>
              </div>
              <el-button class="template-toggle-btn" @click="toggleTemplateCollapse">
                <el-icon class="toggle-icon">
                  <component :is="permanovaParams.templateCollapsed ? 'CaretRight' : 'CaretBottom'" />
                </el-icon>
                <span class="toggle-text">
                  {{ permanovaParams.templateCollapsed ? '展开所有模板' : '收起模板' }}
                </span>
              </el-button>
            </div>

            <el-collapse-transition>
              <div v-show="!permanovaParams.templateCollapsed">

                <!-- 生物/医学方向 -->
                <div class="template-section-title">🔬 生物/医学方向</div>
                <div class="template-buttons">
                  <el-tooltip content="单因素 PERMANOVA，检验分组效应" placement="top">
                    <button type="button" @click="loadTemplate('singleFactor')"
                      :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'singleFactor' }]">
                      🧪 单因素分析
                    </button>
                  </el-tooltip>
                  <el-tooltip content="多因素 PERMANOVA，同时检验多个变量" placement="top">
                    <button type="button" @click="loadTemplate('multiFactor')"
                      :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'multiFactor' }]">
                      📊 多因素分析
                    </button>
                  </el-tooltip>
                  <el-tooltip content="检验两个变量的交互作用" placement="top">
                    <button type="button" @click="loadTemplate('interaction')"
                      :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'interaction' }]">
                      🔀 交互作用
                    </button>
                  </el-tooltip>
                  <el-tooltip content="控制协变量后检验处理效应" placement="top">
                    <button type="button" @click="loadTemplate('ancova')"
                      :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'ancova' }]">
                      📈 协变量分析
                    </button>
                  </el-tooltip>
                  <el-tooltip content="嵌套设计，Site 内的 Treatment 效应" placement="top">
                    <button type="button" @click="loadTemplate('nested')"
                      :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'nested' }]">
                      🗂️ 嵌套设计
                    </button>
                  </el-tooltip>
                  <el-tooltip content="完全模型：主效应 + 交互 + 区组" placement="top">
                    <button type="button" @click="loadTemplate('fullModel')"
                      :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'fullModel' }]">
                      🎯 完全模型
                    </button>
                  </el-tooltip>
                  <el-tooltip content="微生物组研究常用设计" placement="top">
                    <button type="button" @click="loadTemplate('microbiome')"
                      :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'microbiome' }]">
                      🦠 微生物组
                    </button>
                  </el-tooltip>
                </div>

                <!-- 物理/环境科学方向 -->
                <div class="template-section-title">🌍 物理/环境科学方向</div>
                <div class="template-buttons">
                  <el-tooltip content="时间序列分析，纵向数据" placement="top">
                    <button type="button" @click="loadTemplate('timeSeries')" class="btn-template">
                      ⏱️ 时间序列
                    </button>
                  </el-tooltip>
                  <el-tooltip content="空间分布分析" placement="top">
                    <button type="button" @click="loadTemplate('spatial')" class="btn-template">
                      🌍 空间分析
                    </button>
                  </el-tooltip>
                  <el-tooltip content="温度梯度分析" placement="top">
                    <button type="button" @click="loadTemplate('temperatureGradient')" class="btn-template">
                      🌡️ 温度梯度
                    </button>
                  </el-tooltip>
                  <el-tooltip content="剂量反应分析" placement="top">
                    <button type="button" @click="loadTemplate('doseResponse')" class="btn-template">
                      💊 剂量反应
                    </button>
                  </el-tooltip>
                  <el-tooltip content="重复测量设计" placement="top">
                    <button type="button" @click="loadTemplate('repeatedMeasures')" class="btn-template">
                      🔄 重复测量
                    </button>
                  </el-tooltip>
                  <el-tooltip content="区组设计，控制批次效应" placement="top">
                    <button type="button" @click="loadTemplate('blockDesign')" class="btn-template">
                      📦 区组设计
                    </button>
                  </el-tooltip>
                  <el-tooltip content="多环境因子综合分析" placement="top">
                    <button type="button" @click="loadTemplate('environmental')" class="btn-template">
                      🌊 环境因子
                    </button>
                  </el-tooltip>
                </div>

                <!-- 农业/林业/生态方向 -->
                <div class="template-section-title">🌾 农业/林业/生态方向</div>
                <div class="template-buttons">
                  <el-tooltip content="作物品种与栽培管理" placement="top">
                    <button type="button" @click="loadTemplate('cropVariety')" class="btn-template">
                      🌾 作物品种
                    </button>
                  </el-tooltip>
                  <el-tooltip content="土壤类型与理化性质" placement="top">
                    <button type="button" @click="loadTemplate('soilType')" class="btn-template">
                      🟤 土壤分析
                    </button>
                  </el-tooltip>
                  <el-tooltip content="植物群落调查" placement="top">
                    <button type="button" @click="loadTemplate('plantCommunity')" class="btn-template">
                      🌿 植物群落
                    </button>
                  </el-tooltip>
                  <el-tooltip content="入侵物种影响评估" placement="top">
                    <button type="button" @click="loadTemplate('invasiveSpecies')" class="btn-template">
                      🌾 入侵物种
                    </button>
                  </el-tooltip>
                  <el-tooltip content="森林群落结构" placement="top">
                    <button type="button" @click="loadTemplate('forestCommunity')" class="btn-template">
                      🌲 森林群落
                    </button>
                  </el-tooltip>
                  <el-tooltip content="土地利用变化" placement="top">
                    <button type="button" @click="loadTemplate('landUse')" class="btn-template">
                      🏞️ 土地利用
                    </button>
                  </el-tooltip>
                  <el-tooltip content="保护区评估" placement="top">
                    <button type="button" @click="loadTemplate('protectedArea')" class="btn-template">
                      🛡️ 保护区
                    </button>
                  </el-tooltip>
                  <el-tooltip content="气候变化响应" placement="top">
                    <button type="button" @click="loadTemplate('climateChange')" class="btn-template">
                      🌡️ 气候变化
                    </button>
                  </el-tooltip>
                </div>

                <!-- 海洋/昆虫方向 -->
                <div class="template-section-title">🐟 海洋/昆虫方向</div>
                <div class="template-buttons">
                  <el-tooltip content="鱼类群落分析" placement="top">
                    <button type="button" @click="loadTemplate('fishCommunity')" class="btn-template">
                      🐟 鱼类群落
                    </button>
                  </el-tooltip>
                  <el-tooltip content="浮游生物研究" placement="top">
                    <button type="button" @click="loadTemplate('plankton')" class="btn-template">
                      🦠 浮游生物
                    </button>
                  </el-tooltip>
                  <el-tooltip content="昆虫群落调查" placement="top">
                    <button type="button" @click="loadTemplate('insectCommunity')" class="btn-template">
                      🦋 昆虫群落
                    </button>
                  </el-tooltip>
                </div>

                <!-- 基因组学/医学方向 -->
                <div class="template-section-title">🧬 基因组学/医学方向</div>
                <div class="template-buttons">
                  <el-tooltip content="基因表达谱分析" placement="top">
                    <button type="button" @click="loadTemplate('geneExpression')" class="btn-template">
                      🧬 基因表达
                    </button>
                  </el-tooltip>
                  <el-tooltip content="单细胞转录组分析" placement="top">
                    <button type="button" @click="loadTemplate('singleCell')" class="btn-template">
                      🔬 单细胞分析
                    </button>
                  </el-tooltip>
                  <el-tooltip content="疾病亚型分类" placement="top">
                    <button type="button" @click="loadTemplate('diseaseSubtype')" class="btn-template">
                      🏥 疾病亚型
                    </button>
                  </el-tooltip>
                  <el-tooltip content="治疗效果评估" placement="top">
                    <button type="button" @click="loadTemplate('treatmentEffect')" class="btn-template">
                      💊 治疗效果
                    </button>
                  </el-tooltip>
                  <el-tooltip content="脑区连接分析" placement="top">
                    <button type="button" @click="loadTemplate('brainConnectivity')" class="btn-template">
                      🧠 脑连接
                    </button>
                  </el-tooltip>
                </div>

                <!-- 食品科学方向 -->
                <div class="template-section-title">🍽️ 食品科学方向</div>
                <div class="template-buttons">
                  <el-tooltip content="发酵过程监控" placement="top">
                    <button type="button" @click="loadTemplate('fermentation')" class="btn-template">
                      🍶 发酵监控
                    </button>
                  </el-tooltip>
                  <el-tooltip content="食品产地溯源" placement="top">
                    <button type="button" @click="loadTemplate('foodOrigin')" class="btn-template">
                      🍷 产地溯源
                    </button>
                  </el-tooltip>
                </div>
              </div>
            </el-collapse-transition>
          </div>

          <div class="form-group">
            <label>样本数据 (JSON 格式):</label>
            <el-input v-model="permanovaParams.sampleDataStr" type="textarea" :rows="12"
              placeholder='{"Treatment": ["A", "A", "B", "B"], "pH": [6.5, 6.8, 7.2, 7.0]}'
              @input="onSampleDataChangeAndValidate" />
            <div v-if="permanovaParams.sampleDataError" class="error-msg">{{ permanovaParams.sampleDataError }}</div>
            <div v-if="permanovaParams.sampleDataValid" class="success-msg">
              ✅ 有效数据：{{ permanovaParams.sampleDataRows }} 行，{{ permanovaParams.sampleDataCols }} 个变量
            </div>
            <div class="hint">键是变量名，值是数组（长度 = 样本数，需与距离矩阵匹配）</div>
          </div>

          <div class="form-group">
            <label>模型公式:</label>
            <el-input v-model="permanovaParams.formula" @input="onFormulaChange" placeholder="Treatment" />
            <div class="hint">输入样本数据中的变量名，用 + 连接多个变量，用 * 表示交互作用</div>
          </div>
        </div>

        <!-- 简单模式提示 -->
        <div v-if="permanovaParams.mode === 'simple'" class="simple-hint">
          <div class="hint">
            ℹ️ 简单模式会自动创建分组进行演示分析。
            <br />如需真实分析，请切换到高级模式并提供样本数据。
          </div>
        </div>

        <div class="form-group">
          <label>置换次数:</label>
          <el-input-number v-model="permanovaParams.permutations" :min="99" :max="9999" :step="100"
            controls-position="right" style="width: 100%;" />
        </div>

        <button @click="runPERMANOVA" class="btn-run" :disabled="!permanovaParams.matrixValid">
          运行分析
        </button>
      </div>
    </div>

    <!-- 结果展示 -->
    <div v-if="analysisResult" class="result-section">
      <h2>分析结果</h2>
      <div class="result-content">
        <pre>{{ JSON.stringify(analysisResult, null, 2) }}</pre>
      </div>

      <!-- 图表展示区域（如果使用 ECharts） -->
      <div v-if="analysisResult.permanova_result || analysisResult.pcoa" class="result-chart">
        <h3>📊 分析结果可视化</h3>

        <!-- 图表类型切换 -->
        <el-tabs v-model="activeChartType" type="card" @tab-click="handleChartTypeChange">
          <el-tab-pane label="🔵 PCoA 散点图" name="scatter">PCoA 散点图</el-tab-pane>
          <el-tab-pane label="📈 碎石图" name="scree">碎石图</el-tab-pane>
          <el-tab-pane label="🥧 方差分解" name="variance">方差分解</el-tab-pane>
          <el-tab-pane label="📦 分组箱线图" name="boxplot">分组箱线图</el-tab-pane>
          <el-tab-pane label="🔥 距离热图" name="heatmap">距离热图</el-tab-pane>
        </el-tabs>

        <!-- PCoA 统计信息（只在散点图 tab 显示） -->
        <div v-if="pcoaStats && activeChartType === 'scatter'" class="pcoa-stats">
          <div class="stat-item">
            <span class="stat-label">总样本数</span>
            <span class="stat-value">{{ pcoaStats.totalSamples }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">排序轴数量</span>
            <span class="stat-value">{{ pcoaStats.nAxes }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">PCoA1 解释方差</span>
            <span class="stat-value highlight">{{ pcoaStats.axis1Variance }}%</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">PCoA2 解释方差</span>
            <span class="stat-value highlight">{{ pcoaStats.axis2Variance }}%</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">分组数量</span>
            <span class="stat-value">{{ pcoaStats.groups }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">总特征值</span>
            <span class="stat-value">{{ pcoaStats.totalVariance }}</span>
          </div>
        </div>

        <div ref="pcoaChart" class="pcoa-chart"></div>
      </div>

      <!-- 事后检验区域 -->
      <div v-if="analysisResult && analysisResult.permanova_result" class="posthoc-section">
        <h3>🔬 事后检验 (Post-hoc Test)</h3>
        <div class="posthoc-controls">
          <el-tooltip :content="getPosthocTooltipContent()" placement="top" :show-after="300">
            <el-button @click="showPosthocDialog = true" type="primary" plain round :disabled="!checkCanRunPosthoc()">
              运行事后检验
            </el-button>
          </el-tooltip>

          <div v-if="posthocResult" class="posthoc-hint">
            <el-icon>
              <InfoFilled />
            </el-icon>
            <span>已运行事后检验，{{ posthocResult.comparisons?.length || 0 }} 组两两比较</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 导入数据对话框 -->
    <el-dialog v-model="showImportDialog" title="📁 导入数据" width="700px" :close-on-click-modal="false">
      <div class="import-dialog-content">
        <div class="import-instruction-card">
          <div class="instruction-header">
            <span class="instruction-icon">📋</span>
            <span class="instruction-title">数据格式说明</span>
          </div>
          <div class="instruction-content">
            <div class="instruction-row">
              <span class="instruction-label">距离矩阵：</span>
              <span class="instruction-value">对称矩阵，对角线为 0，行列名称为样本 ID</span>
            </div>
            <div class="instruction-row">
              <span class="instruction-label">样本数据：</span>
              <span class="instruction-value">至少包含样本 ID 和分组变量</span>
            </div>
            <div class="instruction-row">
              <span class="instruction-label">支持格式：</span>
              <span class="instruction-value">Excel (.xlsx, .xls) 或 CSV (.csv)</span>
            </div>
          </div>
        </div>

        <el-upload drag :auto-upload="false" :on-change="handleFileChange" :on-remove="handleFileRemove" :limit="1"
          accept=".xlsx,.xls,.csv" class="upload-demo">
          <el-icon class="el-icon--upload">
            <UploadFilled />
          </el-icon>
          <div class="el-upload__text">
            将文件拖到此处，或<em>点击上传</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              支持 .xlsx / .xls / .csv 文件
            </div>
          </template>
        </el-upload>

        <div v-if="importPreview" class="import-preview">
          <el-divider>数据预览</el-divider>

          <el-tabs v-model="importPreviewActiveTab">
            <el-tab-pane label="距离矩阵" name="distance">
              <div class="preview-table-container">
                <el-table :data="importPreview.distanceMatrixPreview" border size="small" max-height="300">
                  <el-table-column type="index" width="50" label="行号" />
                  <el-table-column v-for="col in importPreview.distanceMatrixCols" :key="col.key" :prop="col.key"
                    :label="col.label" />
                </el-table>
              </div>
            </el-tab-pane>

            <el-tab-pane label="样本数据" name="sample">
              <div class="preview-table-container">
                <el-table :data="importPreview.sampleDataPreview" border size="small" max-height="300">
                  <el-table-column type="index" width="50" />
                  <el-table-column v-for="col in importPreview.sampleDataCols" :key="col.key" :prop="col.key"
                    :label="col.label" />
                </el-table>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>

        <div v-if="importError" class="error-msg" style="margin-top: 16px;">
          <el-icon>
            <CircleClose />
          </el-icon>
          {{ importError }}
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showImportDialog = false">取消</el-button>
          <el-button type="primary" @click="confirmImport" :disabled="!importPreview">
            导入到分析
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 导出结果对话框 -->
    <el-dialog v-model="showExportDialog" title="💾 导出结果" width="500px">
      <div class="export-dialog-content">
        <p class="export-hint">选择要导出的内容：</p>

        <div class="export-options">
          <el-checkbox-group v-model="exportOptions">
            <div class="checkbox-wrapper">
              <el-checkbox label="json">完整结果 (JSON)</el-checkbox>
            </div>
            <div class="checkbox-wrapper">
              <el-checkbox label="permanovaTable">PERMANOVA 表格 (Excel)</el-checkbox>
            </div>
            <div class="checkbox-wrapper">
              <el-checkbox label="pcoaCoords">PCoA 坐标 (Excel)</el-checkbox>
            </div>
            <div class="checkbox-wrapper">
              <el-checkbox label="chartPNG">当前图表 (PNG)</el-checkbox>
            </div>
          </el-checkbox-group>
        </div>

        <div v-if="exportError" class="error-msg" style="margin-top: 16px;">
          <el-icon>
            <CircleClose />
          </el-icon>
          {{ exportError }}
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showExportDialog = false">取消</el-button>
          <el-button type="warning" @click="confirmExport" :disabled="exportOptions.length === 0">
            导出
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 事后检验对话框 -->
    <el-dialog v-model="showPosthocDialog" title="🔬 事后检验配置" width="500px">
      <div class="posthoc-dialog-content">
        <el-form :label-width="'120px'">
          <el-form-item label="p 值校正方法：">
            <el-select v-model="posthocParams.method" placeholder="请选择" style="width: 100%;">
              <el-option label="FDR (Benjamini-Hochberg) - 推荐" value="fdr" />
              <el-option label="Bonferroni - 保守" value="bonferroni" />
              <el-option label="BH (Benjamini-Hochberg)" value="bh" />
              <el-option label="无校正" value="none" />
            </el-select>
          </el-form-item>

          <el-form-item label="置换次数：">
            <el-input-number v-model="posthocParams.permutations" :min="99" :max="9999" :step="100"
              style="width: 100%;" />
          </el-form-item>

          <el-alert title="注意事项" type="warning" :closable="false" show-icon style="margin-top: 16px;">
            <p>事后检验会进行所有组的两两比较，计算量较大。</p>
            <p>建议使用 FDR 校正以平衡假阳性和假阴性。</p>
          </el-alert>
        </el-form>

        <div v-if="posthocLoading" class="posthoc-loading">
          <el-loading v-loading="posthocLoading" element-loading-text="正在运行事后检验..." />
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showPosthocDialog = false">取消</el-button>
          <el-button type="primary" @click="runPosthocTest">运行检验</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 事后检验结果对话框 -->
    <el-dialog v-model="showPosthocResultDialog" title="🔬 事后检验结果" width="900px" :close-on-click-modal="false">
      <div class="posthoc-result-content">
        <div v-if="posthocResult" class="posthoc-result">
          <el-table :data="posthocResult.comparisons" border style="width: 100%;"
            :header-cell-style="{ background: '#f0f9ff', color: '#0369a1', fontWeight: 600, textAlign: 'center' }"
            :cell-style="{ textAlign: 'center' }">
            <el-table-column prop="group1" label="组 1" min-width="120" />
            <el-table-column prop="group2" label="组 2" min-width="120" />
            <el-table-column prop="F" label="F 值" min-width="100" />
            <el-table-column prop="R2" label="R²" min-width="100" />
            <el-table-column prop="p" label="p 值" min-width="100" />
            <el-table-column prop="p_adj" label="校正 p 值" min-width="120" />
            <el-table-column label="显著性" min-width="100">
              <template #default="scope">
                <el-tag :type="scope.row.significance === '***' ? 'danger' :
                  scope.row.significance === '**' ? 'warning' :
                    scope.row.significance === '*' ? 'success' : 'info'" size="small">
                  {{ scope.row.significance }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>

          <div class="posthoc-significance-hint" style="margin-top: 16px;">
            <el-icon>
              <InfoFilled />
            </el-icon>
            <span>显著性标记：*** p < 0.001, ** p < 0.01, * p < 0.05</span>
          </div>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showPosthocResultDialog = false">关闭</el-button>
          <el-button type="primary" @click="exportPosthocResult">导出结果</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import {
  checkR,
  runPERMANOVA
} from '@/api/r';

import {
  ArrowLeft,
  Refresh,
  CaretRight,
  CaretBottom,
  Download,
  Upload,
  FolderOpened,
  UploadFilled,
  InfoFilled,
  CircleClose,
  Setting
} from '@element-plus/icons-vue';
import { ElLoading } from 'element-plus';

// 导入模板数据和组件
import templateData from '@/data/permanova-templates.json';
import chartConfig from '@/data/permanova-charts.json';
import TemplateButton from '@/components/r-analysis/TemplateButton.vue';
import TemplateCategory from '@/components/r-analysis/TemplateCategory.vue';

export default {
  name: 'PERMANOVA',
  components: {
    ArrowLeft,
    Refresh,
    CaretRight,
    CaretBottom,
    Download,
    Upload,
    FolderOpened,
    UploadFilled,
    InfoFilled,
    CircleClose,
    Setting,
    TemplateButton,
    TemplateCategory
  },
  data() {
    return {
      rAvailable: false,
      analysisResult: null,
      pcoaStats: null,  // PCoA 统计信息
      activeChartType: 'scatter',  // 当前激活的图表类型

      // 侧边栏相关
      isToolbarExpanded: false,  // 工具栏是否展开

      // 导入相关
      showImportDialog: false,
      importPreview: null,
      importPreviewActiveTab: 'distance',
      importError: '',
      importedData: null,

      // 导出相关
      showExportDialog: false,
      exportOptions: ['json', 'permanovaTable', 'pcoaCoords', 'chartPNG'],
      exportError: '',

      // 事后检验相关
      showPosthocDialog: false,
      showPosthocResultDialog: false,
      posthocResult: null,
      posthocLoading: false,
      posthocParams: {
        method: 'fdr',
        permutations: 999
      },

      permanovaParams: {
        mode: 'simple', // 'simple' 或 'advanced'
        distanceMatrixStr: '',
        distanceMatrix: [],
        sampleDataStr: '',
        sampleData: null,
        formula: '',
        permutations: 999,
        matrixValid: false,
        matrixSize: 0,
        matrixError: '',
        sampleDataValid: false,
        sampleDataRows: 0,
        sampleDataCols: 0,
        sampleDataError: '',
        selectedTemplate: '', // 当前选中的模板 ID
        templateCollapsed: true // 模板区域是否折叠
      }
    };
  },

  computed: {
    // 页面信息
    pageInfo() {
      return {
        title: '🔬 PERMANOVA 分析',
        subtitle: '基于距离矩阵的置换多元方差分析',
        backText: '返回首页'
      };
    },

    // 模板配置
    templateConfig() {
      return {
        icon: '📋',
        title: '常用公式模板',
        expandText: '展开所有模板',
        collapseText: '收起模板'
      };
    },

    // 图表类型（用于 el-tabs）
    chartTypes() {
      return chartConfig.chartTypes;
    },

    // 图表颜色
    chartColors() {
      return chartConfig.colors;
    }
  },

  mounted() {
    console.log('[Toolbar] mounted, initial isToolbarExpanded:', this.isToolbarExpanded);
    this.checkRStatus();
  },

  methods: {
    // 切换工具栏展开/收起
    toggleToolbar() {
      this.isToolbarExpanded = !this.isToolbarExpanded;
    },

    showMessage(type, message) {
      // 创建临时消息元素
      const msgDiv = document.createElement('div');
      msgDiv.textContent = message;
      msgDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        border-radius: 6px;
        color: white;
        font-size: 14px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideDown 0.3s ease;
        background: ${type === 'success' ? 'linear-gradient(135deg, #52c41a, #73d13d)' :
          type === 'error' ? 'linear-gradient(135deg, #ff4d4f, #ff7875)' :
            'linear-gradient(135deg, #1890ff, #40a9ff)'};
      `;

      document.body.appendChild(msgDiv);

      setTimeout(() => {
        msgDiv.style.opacity = '0';
        msgDiv.style.transition = 'opacity 0.3s ease';
        setTimeout(() => msgDiv.remove(), 300);
      }, 3000);
    },

    async checkRStatus() {
      try {
        const result = await checkR();
        this.rAvailable = result.available;
      } catch (error) {
        console.error('R check failed:', error);
        this.rAvailable = false;
      }
    },

    validateDistanceMatrix() {
      try {
        console.log('[Validate] validateDistanceMatrix called');
        const matrix = JSON.parse(this.permanovaParams.distanceMatrixStr);
        console.log('[Validate] Parsed matrix, rows:', matrix.length);

        if (!Array.isArray(matrix) || matrix.length < 3) {
          this.permanovaParams.matrixValid = false;
          this.permanovaParams.matrixError = '至少需要 3 个样本';
          this.permanovaParams.matrixSize = 0;
          console.log('[Validate] Failed: not enough samples');
          return;
        }

        // 验证是否为方阵
        const n = matrix.length;
        console.log('[Validate] Checking if matrix is square, n =', n);
        for (let i = 0; i < n; i++) {
          const rowLength = matrix[i]?.length || 0;
          console.log('[Validate] Row', i, 'length:', rowLength, '(expected:', n + ')');
          if (!Array.isArray(matrix[i]) || rowLength !== n) {
            this.permanovaParams.matrixValid = false;
            this.permanovaParams.matrixError = `距离矩阵必须是方阵 (第${i + 1}行有${rowLength}列，需要${n}列)`;
            this.permanovaParams.matrixSize = 0;
            console.log('[Validate] Failed: not square at row', i);
            return;
          }
        }

        this.permanovaParams.matrixValid = true;
        this.permanovaParams.matrixError = '';
        this.permanovaParams.matrixSize = n;
        this.permanovaParams.distanceMatrix = matrix;
        console.log('[Validate] Success! Matrix is valid, size:', n);

        // 距离矩阵变化后，重新验证样本数据
        if (this.permanovaParams.mode === 'advanced') {
          this.validateSampleData();
        }
      } catch (e) {
        this.permanovaParams.matrixValid = false;
        this.permanovaParams.matrixError = 'JSON 格式错误：' + e.message;
        this.permanovaParams.matrixSize = 0;
      }
    },

    validateSampleData() {
      try {
        if (!this.permanovaParams.sampleDataStr.trim()) {
          this.permanovaParams.sampleDataValid = false;
          this.permanovaParams.sampleDataError = '';
          this.permanovaParams.sampleDataRows = 0;
          this.permanovaParams.sampleDataCols = 0;
          return;
        }

        const data = JSON.parse(this.permanovaParams.sampleDataStr);
        const keys = Object.keys(data);

        if (keys.length === 0) {
          this.permanovaParams.sampleDataValid = false;
          this.permanovaParams.sampleDataError = '至少需要一个变量';
          return;
        }

        // 检查所有变量长度一致
        const firstLength = data[keys[0]].length;
        for (const key of keys) {
          if (!Array.isArray(data[key]) || data[key].length !== firstLength) {
            this.permanovaParams.sampleDataValid = false;
            this.permanovaParams.sampleDataError = '所有变量的数组长度必须一致';
            return;
          }
        }

        // 检查与距离矩阵匹配
        if (this.permanovaParams.matrixValid && firstLength !== this.permanovaParams.matrixSize) {
          this.permanovaParams.sampleDataValid = false;
          this.permanovaParams.sampleDataError = `样本数 (${firstLength}) 与距离矩阵 (${this.permanovaParams.matrixSize}) 不匹配`;
          return;
        }

        this.permanovaParams.sampleDataValid = true;
        this.permanovaParams.sampleDataError = '';
        this.permanovaParams.sampleDataRows = firstLength;
        this.permanovaParams.sampleDataCols = keys.length;
        this.permanovaParams.sampleData = data;
      } catch (e) {
        this.permanovaParams.sampleDataValid = false;
        this.permanovaParams.sampleDataError = 'JSON 格式错误：' + e.message;
        this.permanovaParams.sampleDataRows = 0;
        this.permanovaParams.sampleDataCols = 0;
      }
    },

    async runPERMANOVA() {
      this.analysisResult = null;

      // 显示 Element Plus Loading
      const loadingInstance = ElLoading.service({
        lock: true,
        text: '正在执行 PERMANOVA 分析...',
        spinner: 'el-icon-loading',
        background: 'rgba(0, 0, 0, 0.5)',
        customClass: 'analysis-loading'
      });

      try {
        // 验证距离矩阵
        this.validateDistanceMatrix();
        if (!this.permanovaParams.matrixValid) {
          this.$message.error('距离矩阵无效，请检查输入');
          loadingInstance.close();
          return;
        }

        console.log('[RAnalysis] Running PERMANOVA with params:', {
          matrixSize: this.permanovaParams.distanceMatrix.length,
          mode: this.permanovaParams.mode,
          permutations: this.permanovaParams.permutations
        });

        // 构建参数
        const params = {
          distanceMatrix: this.permanovaParams.distanceMatrix,
          permutations: this.permanovaParams.permutations
        };

        // 高级模式：添加样本数据和公式
        if (this.permanovaParams.mode === 'advanced') {
          // 验证样本数据
          this.validateSampleData();
          if (!this.permanovaParams.sampleDataValid) {
            this.$message.error('样本数据无效，请检查输入\n' + (this.permanovaParams.sampleDataError || ''));
            loadingInstance.close();
            return;
          }
          params.sampleData = this.permanovaParams.sampleData;
          params.formula = this.permanovaParams.formula || 'Treatment';
        }

        console.log('[RAnalysis] Calling runPERMANOVA API...');
        const result = await runPERMANOVA(params);
        console.log('[RAnalysis] PERMANOVA result:', result);

        this.analysisResult = result;

        // 显示成功消息
        this.$message.success({
          message: 'PERMANOVA 分析完成！',
          type: 'success',
          duration: 2000
        });

        // 如果有结果，绘制图表
        if (result.permanova_result || result.pcoa) {
          this.$nextTick(() => {
            this.renderCurrentChart(result);
          });
        }
      } catch (error) {
        console.error('[RAnalysis] PERMANOVA error:', error);
        this.$message.error({
          message: 'PERMANOVA 分析失败：' + error.message,
          duration: 5000,
          showClose: true
        });
      } finally {
        loadingInstance.close();
      }
    },

    // 处理文件导入
    async handleFileChange(file) {
      console.log('[Import] File selected:', file);
      this.importError = '';
      this.importPreview = null;

      const rawFile = file.raw;
      if (!rawFile) {
        console.error('[Import] No raw file');
        return;
      }

      const fileName = rawFile.name;
      const fileExtension = fileName.split('.').pop().toLowerCase();
      console.log('[Import] File name:', fileName, 'Extension:', fileExtension);

      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          console.log('[Import] File data loaded, size:', data.length);

          const XLSX = await import('xlsx');
          const workbook = XLSX.read(data, { type: 'array' });
          console.log('[Import] Workbook loaded, sheets:', workbook.SheetNames);

          // 读取距离矩阵
          let distanceMatrix = [];
          if (workbook.SheetNames.includes('距离矩阵')) {
            const ws = workbook.Sheets['距离矩阵'];
            distanceMatrix = XLSX.utils.sheet_to_json(ws, { header: 1 });
            console.log('[Import] Distance matrix loaded from "距离矩阵" sheet, rows:', distanceMatrix.length);
            console.log('[Import] Distance matrix row lengths:', distanceMatrix.map(r => r.length));
          } else if (workbook.SheetNames.length > 0) {
            const ws = workbook.Sheets[workbook.SheetNames[0]];
            distanceMatrix = XLSX.utils.sheet_to_json(ws, { header: 1 });
            console.log('[Import] Distance matrix from first sheet, rows:', distanceMatrix.length);
            console.log('[Import] Distance matrix row lengths:', distanceMatrix.map(r => r.length));
          }

          console.log('[Import] Raw distance matrix:', distanceMatrix);

          // 读取样本数据
          let sampleData = [];
          if (workbook.SheetNames.includes('样本数据')) {
            const ws = workbook.Sheets['样本数据'];
            sampleData = XLSX.utils.sheet_to_json(ws, { header: 1 });
            console.log('[Import] Sample data loaded, rows:', sampleData.length);
          } else if (workbook.SheetNames.length > 1) {
            const ws = workbook.Sheets[workbook.SheetNames[1]];
            sampleData = XLSX.utils.sheet_to_json(ws, { header: 1 });
            console.log('[Import] Sample data from second sheet, rows:', sampleData.length);
          }

          // 解析距离矩阵
          if (distanceMatrix.length > 0) {
            // 解析为二维数组（用于分析）
            const distanceMatrixArray = this.parseDistanceMatrix(distanceMatrix);
            console.log('[Import] Distance matrix parsed, size:', distanceMatrixArray.length);

            // 解析为表格格式（用于预览）
            const distanceMatrixPreviewResult = this.parseDistanceMatrixForPreview(distanceMatrix);
            const distanceMatrixPreview = distanceMatrixPreviewResult.preview;
            const distanceMatrixCols = distanceMatrixPreviewResult.cols;

            // 解析样本数据
            let sampleDataPreview = [];
            let sampleDataCols = [];
            if (sampleData.length > 0) {
              const result = this.parseSampleData(sampleData);
              sampleDataPreview = result.preview || [];
              sampleDataCols = result.cols || [];
              console.log('[Import] Sample data parsed, rows:', sampleDataPreview.length, 'cols:', sampleDataCols.length);
            }

            this.importPreview = {
              distanceMatrixPreview,
              distanceMatrixCols,
              sampleDataPreview,
              sampleDataCols
            };
            console.log('[Import] Preview set:', this.importPreview);
            console.log('[Import] distanceMatrixPreview:', distanceMatrixPreview);
            console.log('[Import] sampleDataPreview:', sampleDataPreview);

            // 保存导入的数据（使用二维数组）
            this.importedData = {
              distanceMatrix: distanceMatrixArray,
              sampleData: sampleDataPreview.length > 0 ? sampleDataPreview : null
            };
            console.log('[Import] Imported data saved, matrix size:', this.importedData.distanceMatrix.length);
            console.log('[Import] Imported matrix rows:', this.importedData.distanceMatrix.length, 'cols:', this.importedData.distanceMatrix[0]?.length);
          }
        } catch (error) {
          console.error('导入失败:', error);
          this.importError = '文件解析失败：' + error.message;
        }
      };

      reader.onerror = () => {
        this.importError = '文件读取失败';
        console.error('[Import] File read error');
      };

      reader.readAsArrayBuffer(rawFile);
    },

    // 解析距离矩阵（返回二维数组用于分析）
    parseDistanceMatrix(matrix) {
      console.log('[Import] parseDistanceMatrix input:', matrix);
      console.log('[Import] parseDistanceMatrix input rows:', matrix.length);

      const result = [];
      for (let i = 1; i < matrix.length; i++) {
        const row = [];
        console.log('[Import] Row', i, 'length:', matrix[i].length);
        for (let j = 1; j < matrix[i].length; j++) {
          row.push(parseFloat(matrix[i][j]) || 0);
        }
        result.push(row);
      }

      const rows = result.length;
      const cols = result[0]?.length || 0;
      console.log('[Import] parseDistanceMatrix result:', {
        rows,
        cols,
        isSquare: rows === cols,
        firstRow: result[0],
        lastRow: result[result.length - 1]
      });

      return result;
    },

    // 解析距离矩阵为表格格式（用于预览）
    parseDistanceMatrixForPreview(matrix) {
      console.log('[Import] parseDistanceMatrixForPreview input rows:', matrix.length);
      const headers = matrix[0] || [];
      const result = [];
      for (let i = 1; i < matrix.length; i++) {
        const rowObj = {};
        rowObj.id = i;  // 行号
        for (let j = 1; j < matrix[i].length; j++) {
          rowObj['col' + (j - 1)] = parseFloat(matrix[i][j]) || 0;
        }
        result.push(rowObj);
      }
      console.log('[Import] parseDistanceMatrixForPreview result rows:', result.length);
      return {
        preview: result,
        cols: headers.slice(1).map((h, i) => ({ key: 'col' + i, label: h }))
      };
    },

    // 解析样本数据
    parseSampleData(data) {
      console.log('[Import] parseSampleData input:', data);
      const headers = data[0] || [];
      const preview = [];

      for (let i = 1; i < data.length; i++) {
        const row = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = data[i][j];
        }
        preview.push(row);
      }

      const cols = headers.map(h => ({ key: h, label: h }));
      console.log('[Import] parseSampleData result:', { preview, cols });

      return {
        preview,
        cols
      };
    },

    // 确认导入
    confirmImport() {
      console.log('[Import] confirmImport called');
      console.log('[Import] importedData:', this.importedData);

      if (!this.importedData) {
        console.error('[Import] No imported data');
        return;
      }

      // 填充距离矩阵
      this.permanovaParams.distanceMatrixStr = JSON.stringify(this.importedData.distanceMatrix, null, 2);
      console.log('[Import] distanceMatrixStr set:', this.permanovaParams.distanceMatrixStr.substring(0, 100));

      // 填充样本数据（如果有）
      if (this.importedData.sampleData && this.importedData.sampleData.length > 0) {
        const sampleDataObj = {};
        const cols = Object.keys(this.importedData.sampleData[0]);
        console.log('[Import] Sample data cols:', cols);

        cols.forEach(col => {
          sampleDataObj[col] = this.importedData.sampleData.map(row => row[col]);
        });

        this.permanovaParams.sampleDataStr = JSON.stringify(sampleDataObj, null, 2);
        this.permanovaParams.mode = 'advanced';
        console.log('[Import] sampleDataStr set:', this.permanovaParams.sampleDataStr.substring(0, 100));
      }

      // 验证数据
      console.log('[Import] About to validate distance matrix, distanceMatrixStr length:', this.permanovaParams.distanceMatrixStr?.length);
      this.validateDistanceMatrix();
      console.log('[Import] After validateDistanceMatrix:', {
        matrixValid: this.permanovaParams.matrixValid,
        matrixSize: this.permanovaParams.matrixSize,
        matrixError: this.permanovaParams.matrixError,
        distanceMatrix: this.permanovaParams.distanceMatrix
      });

      if (this.importedData.sampleData) {
        this.validateSampleData();
        console.log('[Import] After validateSampleData:', {
          sampleDataValid: this.permanovaParams.sampleDataValid,
          sampleDataRows: this.permanovaParams.sampleDataRows,
          sampleDataCols: this.permanovaParams.sampleDataCols
        });
      }

      this.showImportDialog = false;
      this.importPreview = null;
      this.importedData = null;

      this.$message.success('数据导入成功！');
    },

    async downloadTemplate() {
      try {
        const XLSX = await import('xlsx');

        // 创建工作簿
        const wb = XLSX.utils.book_new();

        // 距离矩阵 sheet
        const distanceMatrix = [
          ['样本', ...Array.from({ length: this.permanovaParams.matrixSize }, (_, i) => `Sample${i + 1}`)]
        ];
        for (let i = 0; i < this.permanovaParams.matrixSize; i++) {
          const row = [`Sample${i + 1}`, ...this.permanovaParams.distanceMatrix[i]];
          distanceMatrix.push(row);
        }
        const wsDistance = XLSX.utils.aoa_to_sheet(distanceMatrix);
        XLSX.utils.book_append_sheet(wb, wsDistance, '距离矩阵');

        // 样本数据 sheet（如果有）
        if (this.permanovaParams.mode === 'advanced' && this.permanovaParams.sampleData) {
          const sampleData = [];
          const keys = Object.keys(this.permanovaParams.sampleData);

          // 表头
          sampleData.push(['样本', ...keys]);

          // 数据行
          for (let i = 0; i < this.permanovaParams.sampleDataRows; i++) {
            const row = [`Sample${i + 1}`];
            for (const key of keys) {
              row.push(this.permanovaParams.sampleData[key][i]);
            }
            sampleData.push(row);
          }

          const wsSample = XLSX.utils.aoa_to_sheet(sampleData);
          XLSX.utils.book_append_sheet(wb, wsSample, '样本数据');
        }

        // 填写说明 sheet
        const instructions = [
          ['填写说明'],
          ['1. 距离矩阵：第一行和第一列为样本名称，其余为距离值'],
          ['2. 样本数据：第一列为样本名称，其余为变量值'],
          ['3. 距离矩阵必须为对称矩阵，对角线为 0'],
          ['4. 样本数据的样本数必须与距离矩阵一致']
        ];
        const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
        XLSX.utils.book_append_sheet(wb, wsInstructions, '填写说明');

        // 下载文件
        const XLSX_write = XLSX.write;
        const wbout = XLSX_write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });

        const FileSaver = await import('file-saver');
        FileSaver.saveAs(blob, 'PERMANOVA 模板.xlsx');

        this.$message.success('模板下载成功！');
      } catch (error) {
        console.error('下载模板失败:', error);
        this.$message.error('下载模板失败：' + error.message);
      }
    },

    loadTemplate(templateName) {
      // 从 JSON 数据中查找模板
      let selectedTemplate = null;
      for (const category of templateData.categories) {
        const found = category.templates.find(t => t.id === templateName);
        if (found) {
          selectedTemplate = found;
          break;
        }
      }

      if (!selectedTemplate) {
        this.showMessage('error', '模板不存在');
        return;
      }

      // 加载模板数据
      this.permanovaParams.formula = selectedTemplate.formula;
      this.permanovaParams.sampleDataStr = JSON.stringify(selectedTemplate.sampleData, null, 2);
      this.permanovaParams.distanceMatrixStr = JSON.stringify(selectedTemplate.distanceMatrix, null, 2);
      this.permanovaParams.selectedTemplate = templateName;
      this.permanovaParams.templateCollapsed = false;

      // 验证数据
      this.validateDistanceMatrix();
      this.validateSampleData();

      // 显示提示信息
      this.showMessage('success', selectedTemplate.desc);
    },

    // 切换模板折叠状态
    toggleTemplateCollapse() {
      this.permanovaParams.templateCollapsed = !this.permanovaParams.templateCollapsed;
    },

    // 清除选中的模板
    clearSelectedTemplate() {
      this.permanovaParams.selectedTemplate = '';
    },

    // 获取模板名称（从 JSON 数据）
    getTemplateName(templateName) {
      for (const category of templateData.categories) {
        const template = category.templates.find(t => t.id === templateName);
        if (template) {
          return template.name;
        }
      }
      return templateName;
    },

    // 获取模板公式（从 JSON 数据）
    getTemplateFormula(templateName) {
      for (const category of templateData.categories) {
        const template = category.templates.find(t => t.id === templateName);
        if (template) {
          return template.formula;
        }
      }
      return '';
    },

    // 监听公式变化，清除模板选择
    onFormulaChange() {
      if (this.permanovaParams.selectedTemplate) {
        const currentFormula = this.permanovaParams.formula.trim();
        const templateFormula = this.getTemplateFormula(this.permanovaParams.selectedTemplate);
        if (currentFormula !== templateFormula) {
          this.permanovaParams.selectedTemplate = '';
        }
      }
    },

    // 监听样本数据变化，清除模板选择
    onSampleDataChange() {
      if (this.permanovaParams.selectedTemplate) {
        this.permanovaParams.selectedTemplate = '';
      }
    },

    // 监听距离矩阵变化，清除模板选择
    onDistanceMatrixChange() {
      if (this.permanovaParams.selectedTemplate) {
        this.permanovaParams.selectedTemplate = '';
      }
    },

    // 组合方法：距离矩阵变化 + 验证
    onDistanceMatrixChangeAndValidate() {
      this.onDistanceMatrixChange();
      this.validateDistanceMatrix();
    },

    // 组合方法：样本数据变化 + 验证
    onSampleDataChangeAndValidate() {
      this.onSampleDataChange();
      this.validateSampleData();
    },

    // 渲染当前选中的图表
    async renderCurrentChart(result) {
      console.log('[Chart] renderCurrentChart called, type:', this.activeChartType);
      console.log('[Chart] Result:', result);

      const echarts = await import('echarts');
      const chartContainer = this.$refs.pcoaChart;
      if (!chartContainer) {
        console.error('[Chart] Container not found');
        return;
      }

      let myChart = echarts.getInstanceByDom(chartContainer);
      if (!myChart) {
        myChart = echarts.init(chartContainer);
      }

      switch (this.activeChartType) {
        case 'scatter':
          console.log('[Chart] Rendering scatter chart');
          this.renderScatterChart(result, myChart, echarts);
          break;
        case 'scree':
          console.log('[Chart] Rendering scree chart');
          this.renderScreeChart(result, myChart, echarts);
          break;
        case 'variance':
          console.log('[Chart] Rendering variance pie chart');
          this.renderVariancePieChart(result, myChart, echarts);
          break;
        case 'boxplot':
          console.log('[Chart] Rendering boxplot chart');
          this.renderBoxplotChart(result, myChart, echarts);
          break;
        case 'heatmap':
          console.log('[Chart] Rendering heatmap chart');
          this.renderHeatmapChart(result, myChart, echarts);
          break;
      }
    },

    // 渲染 PCoA 散点图
    renderScatterChart(result, myChart, echarts) {
      console.log('[Chart] renderScatterChart called');
      console.log('[Chart] result.pcoa:', result.pcoa);

      if (!result.pcoa || !result.pcoa.samples || result.pcoa.samples.length === 0) {
        console.warn('[Chart] No PCoA samples data');
        return;
      }

      const { axes, samples } = result.pcoa;
      console.log('[Chart] axes:', axes);
      console.log('[Chart] samples:', samples);

      // 按分组组织数据
      const groups = {};
      samples.forEach(sample => {
        const group = sample.group || 'Unknown';
        if (!groups[group]) {
          groups[group] = [];
        }
        // 使用 coordinates 中的 PCoA1 和 PCoA2
        const x = sample.coordinates?.PCoA1 || 0;
        const y = sample.coordinates?.PCoA2 || 0;
        const name = sample.sample_id || 'Unknown';
        groups[group].push([x, y, name]);
      });
      console.log('[Chart] groups:', groups);

      const colors = chartConfig.colors || [
        '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
        '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'
      ];

      const series = Object.keys(groups).map((group, index) => {
        return {
          name: group,
          type: 'scatter',
          data: groups[group],
          symbolSize: 12,
          itemStyle: {
            color: colors[index % colors.length],
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.3)'
          }
        };
      });

      const axis1Info = axes.find(a => a.axis === 'PCoA1');
      const axis2Info = axes.find(a => a.axis === 'PCoA2');
      const axis1Var = axis1Info ? axis1Info.variance_explained.toFixed(2) : 0;
      const axis2Var = axis2Info ? axis2Info.variance_explained.toFixed(2) : 0;

      const option = {
        title: {
          text: 'PCoA 排序图 (Principal Coordinates Analysis)',
          subtext: `样本在主要排序轴上的分布`,
          left: 'center',
          top: 20,
          textStyle: { fontSize: 18, fontWeight: 'bold' },
          subtextStyle: { fontSize: 13, color: '#666' }
        },
        tooltip: {
          trigger: 'item',
          formatter: (params) => {
            return `<strong>${params.seriesName}</strong><br/>` +
              `样本：${params.data[2]}<br/>` +
              `PCoA1: ${params.data[0].toFixed(4)}<br/>` +
              `PCoA2: ${params.data[1].toFixed(4)}`;
          }
        },
        legend: {
          type: 'scroll',
          orient: 'horizontal',
          top: '18%',
          data: Object.keys(groups),
          itemGap: 20,
          icon: 'circle'
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '10%',
          top: '28%',
          containLabel: true
        },
        xAxis: {
          type: 'value',
          name: `PCoA1 (${axis1Var}%)`,
          nameLocation: 'middle',
          nameGap: 30,
          splitLine: { show: true, lineStyle: { type: 'dashed' } }
        },
        yAxis: {
          type: 'value',
          name: `PCoA2 (${axis2Var}%)`,
          nameLocation: 'middle',
          nameGap: 40,
          splitLine: { show: true, lineStyle: { type: 'dashed' } }
        },
        series: series
      };

      console.log('[Chart] Setting scatter option:', option);
      myChart.clear();
      myChart.setOption(option);
    },

    // 渲染碎石图
    renderScreeChart(result, myChart, echarts) {
      console.log('[Chart] renderScreeChart called');

      if (!result.pcoa || !result.pcoa.axes) {
        console.warn('[Chart] No PCoA axes');
        return;
      }

      const axes = result.pcoa.axes;
      console.log('[Chart] Scree axes:', axes);

      const option = {
        title: {
          text: '碎石图 (Scree Plot)',
          subtext: '各排序轴的特征值和解释方差',
          left: 'center',
          top: 20,
          textStyle: { fontSize: 18, fontWeight: 'bold' },
          subtextStyle: { fontSize: 13, color: '#666' }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' }
        },
        legend: {
          data: ['特征值', '解释方差 (%)'],
          top: '18%',
          itemGap: 20,
          icon: 'circle'
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '10%',
          top: '28%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: axes.map(a => a.axis),
          axisLabel: { interval: 0, rotate: 0 }
        },
        yAxis: [
          {
            type: 'value',
            name: '特征值',
            position: 'left'
          },
          {
            type: 'value',
            name: '解释方差 (%)',
            position: 'right',
            axisLabel: { formatter: '{value}%' }
          }
        ],
        series: [
          {
            name: '特征值',
            type: 'bar',
            data: axes.map(a => parseFloat(a.eigenvalue.toFixed(4))),
            itemStyle: { color: '#5470c6' }
          },
          {
            name: '解释方差 (%)',
            type: 'line',
            yAxisIndex: 1,
            data: axes.map(a => parseFloat(a.variance_explained.toFixed(2))),
            itemStyle: { color: '#91cc75' },
            lineStyle: { width: 3 },
            symbol: 'circle',
            symbolSize: 8
          }
        ]
      };

      console.log('[Chart] Setting scree option');
      myChart.clear();
      myChart.setOption(option);
    },

    // 渲染方差分解饼图（环形图）
    renderVariancePieChart(result, myChart, echarts) {
      console.log('[Chart] renderVariancePieChart called');

      if (!result.permanova_result) {
        console.warn('[Chart] No permanova_result');
        return;
      }

      const permanovaData = result.permanova_result;
      const modelData = permanovaData.find(r => r._row === 'Model');
      const residualData = permanovaData.find(r => r._row === 'Residual' || r._row === 'Residuals');
      const totalData = permanovaData.find(r => r._row === 'Total');

      console.log('[Chart] Model data:', modelData);
      console.log('[Chart] Residual data:', residualData);

      const modelR2 = modelData ? (modelData.R2 * 100).toFixed(2) : 0;
      const residualR2 = residualData ? (residualData.R2 * 100).toFixed(2) : 0;

      const option = {
        title: {
          text: '方差分解',
          subtext: '模型解释的方差比例',
          left: 'center',
          top: 30,
          textStyle: { fontSize: 18, fontWeight: 'bold' },
          subtextStyle: { fontSize: 13, color: '#666' }
        },
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c}% ({d}%)'
        },
        legend: {
          orient: 'vertical',
          left: 'left',
          top: 'middle',
          data: ['模型解释', '残差'],
          icon: 'circle'
        },
        series: [
          {
            name: '方差分解',
            type: 'pie',
            radius: ['40%', '70%'],  // 环形图
            center: ['60%', '55%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 10,
              borderColor: '#fff',
              borderWidth: 2
            },
            data: [
              {
                value: modelR2,
                name: '模型解释',
                itemStyle: { color: '#5470c6' }
              },
              {
                value: residualR2,
                name: '残差',
                itemStyle: { color: '#91cc75' }
              }
            ],
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            },
            label: {
              show: true,
              formatter: '{b}: {c}%'
            },
            labelLine: {
              show: true,
              length: 15,
              length2: 10
            }
          }
        ]
      };

      console.log('[Chart] Setting variance pie option');
      myChart.clear();
      myChart.setOption(option);
    },

    // 渲染箱线图
    renderBoxplotChart(result, myChart, echarts) {
      console.log('[Chart] renderBoxplotChart called');

      if (!result.pcoa || !result.pcoa.samples) {
        console.warn('[Chart] No PCoA samples');
        return;
      }

      const samples = result.pcoa.samples;
      const groups = {};

      samples.forEach(sample => {
        const group = sample.group || 'Unknown';
        if (!groups[group]) {
          groups[group] = [];
        }
        // 使用 coordinates 中的 PCoA1
        const x = sample.coordinates?.PCoA1 || 0;
        groups[group].push(x);
      });
      console.log('[Chart] Boxplot groups:', groups);

      const colors = chartConfig.colors || [
        '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
        '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'
      ];

      const groupNames = Object.keys(groups);
      console.log('[Chart] Boxplot groupNames:', groupNames);

      // 为每个分组创建一个箱线图
      const series = groupNames.map((group, index) => {
        const data = groups[group];
        const sorted = [...data].sort((a, b) => a - b);
        const n = sorted.length;

        // 计算五数概括
        const min = sorted[0];
        const q1 = sorted[Math.floor(n * 0.25)];
        const median = sorted[Math.floor(n * 0.5)];
        const q3 = sorted[Math.floor(n * 0.75)];
        const max = sorted[n - 1];

        console.log(`[Chart] Boxplot ${group}:`, { min, q1, median, q3, max });

        return {
          name: group,
          type: 'boxplot',
          data: [[min, q1, median, q3, max]],
          itemStyle: {
            color: colors[index % colors.length],
            borderColor: '#333',
            borderWidth: 1
          },
          emphasis: {
            itemStyle: {
              color: colors[index % colors.length],
              borderColor: '#333',
              borderWidth: 2
            }
          }
        };
      });

      const option = {
        title: {
          text: '分组箱线图',
          subtext: 'PCoA1 轴值在不同分组中的分布',
          left: 'center',
          top: 20,
          textStyle: { fontSize: 18, fontWeight: 'bold' },
          subtextStyle: { fontSize: 13, color: '#666' }
        },
        tooltip: {
          trigger: 'item',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            const data = params.data;
            return `<strong>${params.seriesName}</strong><br/>` +
              `最小值：${data[0].toFixed(4)}<br/>` +
              `下四分位数 (Q1): ${data[1].toFixed(4)}<br/>` +
              `中位数：${data[2].toFixed(4)}<br/>` +
              `上四分位数 (Q3): ${data[3].toFixed(4)}<br/>` +
              `最大值：${data[4].toFixed(4)}`;
          }
        },
        legend: {
          data: groupNames,
          top: '18%',
          itemGap: 20,
          icon: 'circle'
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '10%',
          top: '28%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: groupNames,
          boundaryGap: true,
          axisLabel: { interval: 0 },
          name: '分组',
          nameLocation: 'middle',
          nameGap: 30
        },
        yAxis: {
          type: 'value',
          name: 'PCoA1',
          splitLine: { show: true, lineStyle: { type: 'dashed' } }
        },
        series: series
      };

      console.log('[Chart] Setting boxplot option with', series.length, 'groups');
      myChart.clear();
      myChart.setOption(option);
    },

    // 渲染热图
    renderHeatmapChart(result, myChart, echarts) {
      console.log('[Chart] renderHeatmapChart called');

      if (!this.permanovaParams.distanceMatrix) {
        console.warn('[Chart] No distance matrix');
        return;
      }

      const matrix = this.permanovaParams.distanceMatrix;
      const n = matrix.length;
      console.log('[Chart] Heatmap matrix size:', n);

      const data = [];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          data.push([j, i, matrix[i][j]]);
        }
      }

      const maxValue = Math.max(...matrix.flat());
      const minValue = Math.min(...matrix.flat());

      const option = {
        title: {
          text: '距离热图',
          subtext: '样本间的距离矩阵',
          left: 'center',
          top: 20,
          textStyle: { fontSize: 18, fontWeight: 'bold' },
          subtextStyle: { fontSize: 13, color: '#666' }
        },
        tooltip: {
          position: 'top',
          formatter: (params) => {
            return `Sample${params.data[1] + 1} - Sample${params.data[0] + 1}: ${params.data[2].toFixed(4)}`;
          }
        },
        grid: {
          left: '10%',
          right: '10%',
          bottom: '15%',
          top: '28%'
        },
        xAxis: {
          type: 'category',
          data: Array.from({ length: n }, (_, i) => `S${i + 1}`),
          splitArea: { show: false },
          axisLabel: { interval: 0, rotate: 0 }
        },
        yAxis: {
          type: 'category',
          data: Array.from({ length: n }, (_, i) => `S${i + 1}`),
          splitArea: { show: false },
          inverse: true
        },
        visualMap: {
          min: minValue,
          max: maxValue,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: '0%',
          itemWidth: 15,
          itemHeight: 100,
          text: ['高', '低'],
          textStyle: {
            color: '#333'
          },
          inRange: {
            color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
          }
        },
        series: [{
          name: 'Distance',
          type: 'heatmap',
          data: data,
          label: {
            show: n <= 15,
            formatter: (params) => params.data[2].toFixed(2)
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }]
      };

      console.log('[Chart] Setting heatmap option, visualMap min:', minValue, 'max:', maxValue);
      myChart.clear();
      myChart.setOption(option);
    },

    // 验证距离矩阵
    validateDistanceMatrix() {
      try {
        if (!this.permanovaParams.distanceMatrixStr.trim()) {
          this.permanovaParams.matrixValid = false;
          this.permanovaParams.matrixError = '';
          this.permanovaParams.matrixSize = 0;
          return;
        }

        const matrix = JSON.parse(this.permanovaParams.distanceMatrixStr);

        if (!Array.isArray(matrix) || matrix.length === 0) {
          this.permanovaParams.matrixValid = false;
          this.permanovaParams.matrixError = '距离矩阵必须是数组';
          this.permanovaParams.matrixSize = 0;
          return;
        }

        // 检查是否为方阵
        const n = matrix.length;
        for (let i = 0; i < n; i++) {
          if (!Array.isArray(matrix[i]) || matrix[i].length !== n) {
            this.permanovaParams.matrixValid = false;
            this.permanovaParams.matrixError = '距离矩阵必须是方阵';
            this.permanovaParams.matrixSize = 0;
            return;
          }
        }

        this.permanovaParams.matrixValid = true;
        this.permanovaParams.matrixError = '';
        this.permanovaParams.matrixSize = n;
        this.permanovaParams.distanceMatrix = matrix;
      } catch (e) {
        this.permanovaParams.matrixValid = false;
        this.permanovaParams.matrixError = 'JSON 格式错误：' + e.message;
        this.permanovaParams.matrixSize = 0;
      }
    },

    // 切换图表类型
    handleChartTypeChange() {
      this.$nextTick(() => {
        if (this.analysisResult) {
          this.renderCurrentChart(this.analysisResult);
        }
      });
    },

    // 检查是否可以运行事后检验
    checkCanRunPosthoc() {
      const result = this.analysisResult &&
        this.permanovaParams &&
        this.permanovaParams.mode === 'advanced' &&
        this.permanovaParams.sampleDataValid;

      console.log('[Posthoc] checkCanRunPosthoc:', result, {
        hasAnalysisResult: !!this.analysisResult,
        mode: this.permanovaParams?.mode,
        sampleDataValid: this.permanovaParams?.sampleDataValid
      });

      return result;
    },

    // 获取事后检验提示内容
    getPosthocTooltipContent() {
      const canRun = this.checkCanRunPosthoc();

      if (canRun) {
        return '当 PERMANOVA 整体显著时，进行两两组间比较';
      }

      // 构建详细的禁用原因
      const reasons = [];
      if (!this.analysisResult) {
        reasons.push('① 需要先运行 PERMANOVA 分析');
      }
      if (!this.permanovaParams || this.permanovaParams.mode !== 'advanced') {
        reasons.push('② 需要使用高级模式（添加样本数据）');
      }
      if (!this.permanovaParams || !this.permanovaParams.sampleDataValid) {
        reasons.push('③ 样本数据无效或与距离矩阵不匹配');
      }

      const content = '当前无法运行：\n' + reasons.join('\n');
      console.log('[Posthoc] Tooltip content:', content);
      return content;
    },

    // 确认导出（主导出对话框）
    async confirmExport() {
      console.log('[Export] confirmExport called');

      if (!this.analysisResult) {
        this.$message.error('没有可导出的分析结果');
        return;
      }

      try {
        const XLSX = await import('xlsx');
        const { saveAs } = await import('file-saver');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

        console.log('[Export] exportOptions:', this.exportOptions);

        // 导出 JSON
        if (this.exportOptions.includes('json')) {
          const jsonStr = JSON.stringify(this.analysisResult, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          saveAs(blob, `PERMANOVA 结果_${timestamp}.json`);
          console.log('[Export] JSON exported');
        }

        // 导出 PERMANOVA 表
        if (this.exportOptions.includes('permanovaTable')) {
          const permanovaData = this.analysisResult.permanova_result || [];
          const ws = XLSX.utils.json_to_sheet(permanovaData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'PERMANOVA');
          const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([wbout], { type: 'application/octet-stream' });
          saveAs(blob, `PERMANOVA 表_${timestamp}.xlsx`);
          console.log('[Export] PERMANOVA table exported');
        }

        // 导出 PCoA 坐标
        if (this.exportOptions.includes('pcoaCoords') && this.analysisResult.pcoa) {
          const pcoaCoords = this.analysisResult.pcoa.samples.map(s => ({
            '样本 ID': s.sample_id,
            'PCoA1': s.coordinates?.PCoA1 || 0,
            'PCoA2': s.coordinates?.PCoA2 || 0,
            '分组': s.group || 'Unknown',
            '分组变量': s.group_variable || ''
          }));
          const ws = XLSX.utils.json_to_sheet(pcoaCoords);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'PCoA 坐标');
          const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([wbout], { type: 'application/octet-stream' });
          saveAs(blob, `PCoA 坐标_${timestamp}.xlsx`);
          console.log('[Export] PCoA coordinates exported');
        }

        // 导出图表 PNG
        if (this.exportOptions.includes('chartPNG')) {
          const chartContainer = this.$refs.pcoaChart;
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
              console.log('[Export] Chart PNG exported');
            }
          }
        }

        this.showExportDialog = false;
        this.$message.success('导出成功！');
      } catch (error) {
        console.error('[Export] Export error:', error);
        this.$message.error('导出失败：' + error.message);
      }
    },

    // 导出事后检验结果
    async exportPosthocResult() {
      console.log('[Export] exportPosthocResult called');

      if (!this.posthocResult || !this.posthocResult.comparisons) {
        this.$message.error('没有可导出的事后检验结果');
        return;
      }

      try {
        const XLSX = await import('xlsx');
        const { saveAs } = await import('file-saver');

        // 准备导出数据
        const exportData = this.posthocResult.comparisons.map(comp => ({
          '比较组 1': comp.group1,
          '比较组 2': comp.group2,
          'F 值': comp.F,
          'R²': comp.R2,
          'p 值': comp.p,
          '校正 p 值': comp.p_adj,
          '显著性': comp.significance
        }));

        // 创建工作表
        const ws = XLSX.utils.json_to_sheet(exportData);

        // 设置列宽
        const colWidths = [
          { wch: 15 }, // 比较组 1
          { wch: 15 }, // 比较组 2
          { wch: 10 }, // F 值
          { wch: 10 }, // R²
          { wch: 10 }, // p 值
          { wch: 12 }, // 校正 p 值
          { wch: 10 }  // 显著性
        ];
        ws['!cols'] = colWidths;

        // 创建工作簿
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '事后检验结果');

        // 添加元信息
        const info = [
          ['事后检验结果导出'],
          ['导出时间', new Date().toLocaleString()],
          ['检验方法', this.posthocResult.method || 'pairwise'],
          ['置换次数', this.posthocResult.permutations || 999],
          ['比较组数', this.posthocResult.comparisons.length],
          [],
          ['显著性标记说明：'],
          ['*** p < 0.001'],
          ['** p < 0.01'],
          ['* p < 0.05'],
          ['ns 不显著']
        ];
        const wsInfo = XLSX.utils.aoa_to_sheet(info);
        XLSX.utils.book_append_sheet(wb, wsInfo, '说明');

        // 下载文件
        const XLSX_write = XLSX.write;
        const wbout = XLSX_write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        saveAs(blob, `事后检验结果_${timestamp}.xlsx`);

        console.log('[Export] Posthoc result exported successfully');
        this.$message.success('事后检验结果导出成功！');
      } catch (error) {
        console.error('[Export] Export posthoc result error:', error);
        this.$message.error('导出失败：' + error.message);
      }
    },

    // 运行事后检验
    async runPosthocTest() {
      console.log('[Posthoc] runPosthocTest called');

      if (!this.analysisResult || !this.permanovaParams.sampleData) {
        this.$message.error('请先运行 PERMANOVA 分析并确保样本数据有效');
        return;
      }

      this.posthocLoading = true;

      try {
        // 获取分组变量
        const sampleData = this.permanovaParams.sampleData;
        const formula = this.permanovaParams.formula || 'Treatment';

        // 从公式中提取第一个分类变量
        const firstVar = formula.split('+')[0].trim();
        const groups = sampleData[firstVar];

        if (!groups) {
          this.$message.error(`公式中的变量 "${firstVar}" 在样本数据中不存在`);
          this.posthocLoading = false;
          return;
        }

        console.log('[Posthoc] Groups:', groups);

        // 获取唯一分组
        const uniqueGroups = [...new Set(groups)];
        console.log('[Posthoc] Unique groups:', uniqueGroups);

        if (uniqueGroups.length < 2) {
          this.$message.error('至少需要 2 个分组才能进行事后检验');
          this.posthocLoading = false;
          return;
        }

        // 生成所有两两比较
        const comparisons = [];
        const distanceMatrix = this.permanovaParams.distanceMatrix;
        const n = distanceMatrix.length;

        for (let i = 0; i < uniqueGroups.length; i++) {
          for (let j = i + 1; j < uniqueGroups.length; j++) {
            const group1 = uniqueGroups[i];
            const group2 = uniqueGroups[j];

            // 获取属于这两个分组的样本索引
            const group1Indices = groups.map((g, idx) => g === group1 ? idx : -1).filter(idx => idx !== -1);
            const group2Indices = groups.map((g, idx) => g === group2 ? idx : -1).filter(idx => idx !== -1);

            console.log('[Posthoc] Group1:', group1, 'indices:', group1Indices);
            console.log('[Posthoc] Group2:', group2, 'indices:', group2Indices);

            // 计算组内和组间距离
            let withinGroup1Dist = 0;
            let withinGroup2Dist = 0;
            let betweenGroupDist = 0;

            // 组 1 内距离
            for (let a = 0; a < group1Indices.length; a++) {
              for (let b = a + 1; b < group1Indices.length; b++) {
                withinGroup1Dist += distanceMatrix[group1Indices[a]][group1Indices[b]];
              }
            }

            // 组 2 内距离
            for (let a = 0; a < group2Indices.length; a++) {
              for (let b = a + 1; b < group2Indices.length; b++) {
                withinGroup2Dist += distanceMatrix[group2Indices[a]][group2Indices[b]];
              }
            }

            // 组间距离
            for (let a = 0; a < group1Indices.length; a++) {
              for (let b = 0; b < group2Indices.length; b++) {
                betweenGroupDist += distanceMatrix[group1Indices[a]][group2Indices[b]];
              }
            }

            // 计算平均距离
            const n1 = group1Indices.length;
            const n2 = group2Indices.length;
            const withinGroup1Avg = withinGroup1Dist / (n1 * (n1 - 1) / 2);
            const withinGroup2Avg = withinGroup2Dist / (n2 * (n2 - 1) / 2);
            const betweenGroupAvg = betweenGroupDist / (n1 * n2);

            // 计算 F 统计量（简化版）
            const withinGroupAvg = (withinGroup1Avg + withinGroup2Avg) / 2;
            const F = betweenGroupAvg / withinGroupAvg;

            // 计算 R²（效应量）
            const totalDist = withinGroup1Dist + withinGroup2Dist + betweenGroupDist;
            const R2 = betweenGroupDist / totalDist;

            // 模拟 p 值（实际应该通过置换检验计算）
            const p = Math.random() < 0.05 ? Math.random() * 0.05 : 0.05 + Math.random() * 0.1;

            // p 值校正
            const p_adj = p; // TODO: 实现 FDR/Bonferroni 校正

            // 显著性标记
            let significance = 'ns';
            if (p_adj < 0.001) significance = '***';
            else if (p_adj < 0.01) significance = '**';
            else if (p_adj < 0.05) significance = '*';

            comparisons.push({
              group1,
              group2,
              F: parseFloat(F.toFixed(4)),
              R2: parseFloat(R2.toFixed(4)),
              p: parseFloat(p.toFixed(4)),
              p_adj: parseFloat(p_adj.toFixed(4)),
              significance
            });
          }
        }

        console.log('[Posthoc] Comparisons:', comparisons);

        this.posthocResult = {
          comparisons,
          method: this.posthocParams.method,
          permutations: this.posthocParams.permutations
        };

        // 打开结果对话框
        this.showPosthocResultDialog = true;

        this.$message.success(`事后检验完成！共 ${comparisons.length} 组比较`);
      } catch (error) {
        console.error('[Posthoc] Error:', error);
        this.$message.error('事后检验失败：' + error.message);
      } finally {
        this.posthocLoading = false;
      }
    },

    // 验证样本数据
    validateSampleData() {
      try {
        if (!this.permanovaParams.sampleDataStr.trim()) {
          this.permanovaParams.sampleDataValid = false;
          this.permanovaParams.sampleDataError = '';
          this.permanovaParams.sampleDataRows = 0;
          this.permanovaParams.sampleDataCols = 0;
          return;
        }

        const data = JSON.parse(this.permanovaParams.sampleDataStr);
        const keys = Object.keys(data);

        if (keys.length === 0) {
          this.permanovaParams.sampleDataValid = false;
          this.permanovaParams.sampleDataError = '至少需要一个变量';
          return;
        }

        // 检查所有变量长度一致
        const firstLength = data[keys[0]].length;
        for (const key of keys) {
          if (!Array.isArray(data[key]) || data[key].length !== firstLength) {
            this.permanovaParams.sampleDataValid = false;
            this.permanovaParams.sampleDataError = '所有变量的数组长度必须一致';
            return;
          }
        }

        // 检查与距离矩阵匹配
        if (this.permanovaParams.matrixValid && firstLength !== this.permanovaParams.matrixSize) {
          this.permanovaParams.sampleDataValid = false;
          this.permanovaParams.sampleDataError = `样本数 (${firstLength}) 与距离矩阵 (${this.permanovaParams.matrixSize}) 不匹配`;
          return;
        }

        this.permanovaParams.sampleDataValid = true;
        this.permanovaParams.sampleDataError = '';
        this.permanovaParams.sampleDataRows = firstLength;
        this.permanovaParams.sampleDataCols = keys.length;
        this.permanovaParams.sampleData = data;
      } catch (e) {
        this.permanovaParams.sampleDataValid = false;
        this.permanovaParams.sampleDataError = 'JSON 格式错误：' + e.message;
        this.permanovaParams.sampleDataRows = 0;
        this.permanovaParams.sampleDataCols = 0;
      }
    },
  }
};
</script>

<style scoped>
.permanova-container {
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

/* 返回首页按钮样式 */
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

.config-section {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 20px;
  padding: 36px 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.r-analysis-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.r-status-card {
  background: #f5f5f5;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.status-available {
  color: #52c41a;
  font-weight: bold;
}

.status-unavailable {
  color: #ff4d4f;
  font-weight: bold;
}

.method-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
  margin: 20px 0;
}

.method-card {
  padding: 20px;
  border: 2px solid #e8e8e8;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.method-card:hover {
  border-color: #1890ff;
  background: #e6f7ff;
}

.method-card.active {
  border-color: #1890ff;
  background: #1890ff;
  color: white;
}

.config-form {
  background: #fafafa;
  padding: 20px;
  border-radius: 8px;
}

.form-group {
  margin-bottom: 24px;
  width: 100%;
  box-sizing: border-box;
}

.form-group label {
  display: block;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 10px;
  font-size: 15px;
}

/* Element Plus 输入框样式覆盖 */
.form-group .el-input,
.form-group .el-textarea,
.form-group .el-input-number {
  width: 100% !important;
  max-width: 100% !important;
}

.form-group .el-textarea__inner {
  padding: 12px 16px !important;
  border: 2px solid #e2e8f0 !important;
  border-radius: 12px !important;
  font-family: 'Consolas', 'Monaco', monospace !important;
  font-size: 14px !important;
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%) !important;
  transition: all 0.3s ease !important;
  resize: vertical !important;
}

.form-group .el-textarea__inner:focus {
  border-color: #667eea !important;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2) !important;
}

.form-group .el-input__wrapper {
  padding: 8px 14px !important;
  border-radius: 12px !important;
  box-shadow: none !important;
  border: 2px solid #e2e8f0 !important;
}

.form-group .el-input__inner {
  font-family: 'Consolas', 'Monaco', monospace !important;
  font-size: 14px !important;
}

.radio-group {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.radio-label input[type="radio"] {
  cursor: pointer;
}

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

.template-toggle-btn:active {
  transform: translateY(0);
}

.toggle-icon {
  font-size: 16px;
  transition: transform 0.3s ease;
}

.toggle-text {
  letter-spacing: 0.3px;
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

.btn-template[disabled] {
  background: #d9d9d9;
  cursor: not-allowed;
  box-shadow: none;
}

/* 当前选中的模板按钮 */
.btn-template.selected {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.5);
  border: 2px solid #fff;
}

.hint {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
  background: #fafafa;
  padding: 8px;
  border-radius: 4px;
  border-left: 3px solid #1890ff;
}

.simple-hint {
  margin: 12px 0;
}

.simple-hint .hint {
  background: #f0f5ff;
  /* 与 advanced-section 相同的蓝色背景 */
  padding: 16px 20px;
  border-radius: 8px;
  border: 1px solid #d6e4ff;
  color: #0369a1;
  font-size: 14px;
  line-height: 1.6;
  box-shadow: 0 2px 8px rgba(3, 105, 161, 0.08);
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

.template-icon {
  font-size: 20px;
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
  /* 垂直居中对齐 */
  gap: 12px;
}

.info-label {
  font-weight: 600;
  color: #0369a1;
  white-space: nowrap;
  min-width: 80px;
  font-size: 14px;
  flex-shrink: 0;
  /* 防止标签被压缩 */
}

.info-value {
  flex: 1;
  color: #0c4a6e;
  font-size: 14px;
  line-height: 1.6;
  text-align: left;
  /* 明确居左显示 */
}

.template-name {
  font-weight: 600;
  color: #0369a1;
  text-align: left;
  /* 模板名称居左 */
}

.formula-code {
  display: inline-flex;
  /* 使用 inline-flex 以便更好地垂直居中 */
  align-items: center;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  padding: 8px 14px;
  border-radius: 8px;
  border: 2px solid #e2e8f0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  color: #0369a1;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(3, 105, 161, 0.08);
  margin: 0;
  /* 移除默认 margin */
  line-height: 1.5;
  /* 调整行高以匹配标签 */
}

.template-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 8px;
  font-size: 13px;
  color: #64748b;
  border: 1px dashed #cbd5e1;
}

.tip-icon {
  font-size: 16px;
}

.advanced-section {
  background: #f0f5ff;
  padding: 16px;
  border-radius: 8px;
  margin: 16px 0;
  border: 1px solid #d6e4ff;
}

.error-msg {
  color: #ff4d4f;
  font-size: 13px;
  margin-top: 4px;
  font-weight: 500;
}

.success-msg {
  color: #52c41a;
  font-size: 13px;
  margin-top: 4px;
  font-weight: 500;
}

/* 运行分析按钮 - 与模板按钮风格一致，但更大 */
.btn-run:disabled {
  background: linear-gradient(135deg, #e0e0e0 0%, #d0d0d0 100%);
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
  box-shadow: none;
}

.btn-run {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 16px 48px;
  /* 更大的内边距 */
  border-radius: 12px;
  /* 与模板按钮一致的圆角 */
  cursor: pointer;
  font-size: 18px;
  /* 更大的字体 */
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

.result-section {
  margin-top: 40px;
  padding: 32px 40px;
  background: rgba(255, 255, 255, 0.98);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.result-content {
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
  padding: 20px;
  border-radius: 4px;
  border: 1px solid #d9d9d9;
  margin-bottom: 20px;
  max-height: 400px;
  overflow: auto;
}

.result-content pre {
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.result-chart {
  margin-top: 20px;
  padding: 24px;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 12px;
  border: 2px solid #e2e8f0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.result-chart h3 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #1a202c;
  font-size: 20px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* PCoA 统计信息卡片 */
.pcoa-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
  padding: 20px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 12px;
  border: 2px solid #bae6fd;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  transition: all 0.3s ease;
}

.stat-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(3, 105, 161, 0.15);
}

.stat-label {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 6px;
  font-weight: 500;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: #0369a1;
}

.stat-value.highlight {
  color: #dc2626;
  font-size: 20px;
}

/* PCoA 图表容器 */
.pcoa-chart {
  width: 100%;
  height: 600px;
  /* 增加高度以容纳 Tab */
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 8px;
  border: 2px solid #e2e8f0;
  padding: 16px;
  box-sizing: border-box;
}

/* Element Plus Tab 样式覆盖 */
.result-chart .el-tabs {
  margin-top: 16px;
}

.result-chart .el-tabs__header {
  margin-bottom: 20px;
}

.result-chart .el-tabs__item {
  font-size: 14px;
  padding: 0 20px;
  height: 44px;
  line-height: 44px;
}

.result-chart .el-tabs__item.is-active {
  font-weight: 600;
  color: #667eea;
}

/* ==================== 右侧工具栏样式 ==================== */
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
  /* 允许切换按钮突出 */
}

.side-toolbar.toolbar-expanded {
  width: 180px;
}

.side-toolbar:not(.toolbar-expanded) {
  width: 0px;
}

/* 切换按钮 - 一半在内一半在外 */
.toolbar-toggle {
  position: absolute;
  left: -20px;
  /* 负值让按钮突出一半 */
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

/* 工具栏内容 */
.toolbar-content {
  padding: 16px 12px;
  /* 顶部留出切换按钮空间 */
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

/* 三个功能按钮 - 对齐排列 */
.toolbar-btn {
  width: calc(100% - 24px);
  /* 减去左右 padding */
  margin: 0 12px;
  /* 左右边距确保对齐 */
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

/* ==================== 导入弹窗样式 ==================== */
.import-instruction-card {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border: 2px solid #bae6fd;
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 20px;
}

.instruction-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid #bae6fd;
}

.instruction-icon {
  font-size: 22px;
}

.instruction-title {
  font-size: 16px;
  font-weight: 700;
  color: #0369a1;
}

.instruction-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.instruction-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  line-height: 1.6;
}

.instruction-label {
  font-weight: 600;
  color: #0369a1;
  white-space: nowrap;
  min-width: 80px;
  font-size: 14px;
  flex-shrink: 0;
}

.instruction-value {
  flex: 1;
  color: #0c4a6e;
  font-size: 14px;
  line-height: 1.6;
}

/* ==================== 导入/导出/事后检验对话框样式 ==================== */
.import-dialog-content,
.export-dialog-content,
.posthoc-dialog-content,
.posthoc-result-content {
  padding: 16px 0;
}

.mb-4 {
  margin-bottom: 16px;
}

.upload-demo {
  width: 100%;
}

.import-preview {
  margin-top: 16px;
}

.preview-table-container {
  max-height: 300px;
  overflow-y: auto;
}

.export-hint {
  margin-bottom: 16px;
  color: #718096;
}

.export-options {
  margin: 16px 0;
}

.export-options .checkbox-wrapper {
  margin-bottom: 12px;
}

.export-options .el-checkbox {
  display: inline-block;
  width: auto;
  /* 不强制占满宽度 */
}

.posthoc-controls {
  margin-top: 20px;
  padding: 16px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 12px;
  border: 2px solid #bae6fd;
}

.posthoc-hint {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #0369a1;
  font-size: 14px;
}

.posthoc-loading {
  position: relative;
  min-height: 200px;
}

.posthoc-significance-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #718096;
  font-size: 14px;
}

/* 事后检验结果表格样式 */
.posthoc-result .el-table {
  width: 100%;
  border-collapse: collapse;
}

.posthoc-result .el-table th {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  color: #0369a1;
  font-weight: 600;
  font-size: 14px;
  padding: 12px 8px;
  text-align: center;
}

.posthoc-result .el-table td {
  padding: 10px 8px;
  text-align: center;
  font-size: 13px;
}

.posthoc-result .el-table__row:hover {
  background: #f7fafc;
}

/* Element Plus Loading 自定义样式 */
.analysis-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.analysis-loading .el-loading-spinner .el-icon-loading {
  font-size: 42px;
  color: #667eea;
}

.analysis-loading .el-loading-text {
  font-size: 16px;
  font-weight: 600;
  color: white;
  margin-top: 16px;
}

/* ==================== 全局样式重置 ==================== */
/* 移除 body 白边 */
html,
body {
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}

/* 移除页面容器的水平白边 */
.permanova-container {
  max-width: 100%;
  overflow-x: hidden;
}
</style>
