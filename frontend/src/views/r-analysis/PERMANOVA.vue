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

      <!-- 收起时靠 .toolbar-content 的 opacity/visibility 把按钮藏掉；
           没有这一层的话 side-toolbar 是 width:0 + overflow:visible，四个按钮会直接溢出到页面上 -->
      <div class="toolbar-content">
        <ToolbarActions
          :can-run="permanovaParams.matrixValid" :has-result="!!analysisResult" :show-input="true"
          @template="downloadTemplate" @import="openImport" @export="openExport" @input="downloadInput"
        />
      </div>
    </div>

    <!-- 参数配置区域 -->
    <div class="config-section">

      <!-- 当前选择的模板 -->
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
      <div class="template-section">
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
              <el-tooltip content="公式首项写成 as.factor(Group)：验证因子包装与“首列取值有重复”两种写法主管道与事后检验都能接住" placement="top">
                <button type="button" @click="loadTemplate('factorFormula')"
                  :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'factorFormula' }]">
                  🧬 显式因子 + 协变量
                </button>
              </el-tooltip>
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

      <!-- 数据输入区域 -->
      <div class="data-input-section">
        <h2 class="section-title">📊 数据输入</h2>

        <div class="input-hint-card">
          <el-icon>
            <InfoFilled />
          </el-icon>
          <span>请输入距离矩阵（必需）和样本数据（用于公式分析）。所有数据必须有效才能运行分析。</span>
        </div>

        <div class="data-input-grid">
          <!-- 距离矩阵 -->
          <div class="data-input-card">
            <h3>🔷 距离矩阵</h3>
            <p class="input-hint">n × n 对称矩阵，对角线为 0</p>
            <el-input v-model="permanovaParams.distanceMatrixStr" type="textarea" :rows="10"
              placeholder='[[0, 0.2, 0.3], [0.2, 0, 0.25], [0.3, 0.25, 0]]'
              @input="onDistanceMatrixChangeAndValidate" />
            <div class="validation-status">
              <el-tag :type="permanovaParams.matrixValid ? 'success' : 'info'" size="small">
                {{ permanovaParams.matrixValid ? `✓ 有效矩阵：${permanovaParams.matrixSize} 个样本` : '等待输入' }}
              </el-tag>
              <span v-if="permanovaParams.matrixError" class="error-text">
                {{ permanovaParams.matrixError }}
              </span>
            </div>
          </div>

          <!-- 样本数据 -->
          <div class="data-input-card">
            <h3>📋 样本数据</h3>
            <p class="input-hint">样本分组信息，用于 PERMANOVA 公式</p>
            <el-input v-model="permanovaParams.sampleDataStr" type="textarea" :rows="10"
              placeholder='{"Sample1": {"Group": "A", "Treatment": "Control"}, "Sample2": {"Group": "B", "Treatment": "Treated"}}'
              @input="onSampleDataChangeAndValidate" />
            <div class="validation-status">
              <el-tag :type="permanovaParams.sampleDataValid ? 'success' : 'info'" size="small">
                {{ permanovaParams.sampleDataValid ? '✓ 数据有效' : '等待输入' }}
              </el-tag>
              <span v-if="permanovaParams.sampleDataError" class="error-text">
                {{ permanovaParams.sampleDataError }}
              </span>
            </div>
          </div>

          <!-- 模型公式 -->
          <div class="data-input-card">
            <h3>🧮 模型公式</h3>
            <p class="input-hint">基于样本数据中的变量名</p>
            <el-input v-model="permanovaParams.formula" size="large" placeholder="Treatment + pH * Temperature"
              @input="onFormulaChange" />
            <p class="formula-hint">
              💡 用 <code>+</code> 连接多个变量，用 <code>*</code> 表示交互作用
            </p>
          </div>

          <!-- 置换次数 -->
          <div class="data-input-card">
            <h3>🔄 置换次数</h3>
            <p class="input-hint">统计显著性检验的置换次数</p>
            <el-input-number v-model="permanovaParams.permutations" :min="99" :max="9999" :step="100"
              controls-position="right" style="width: 100%;" />
            <p class="formula-hint">
              💡 建议 ≥ 999 以获得稳定的 p 值
            </p>
          </div>
        </div>
      </div>

      <!-- 运行分析按钮 -->
      <div class="run-button-container">
        <button @click="runPERMANOVA" class="btn-run" :disabled="!permanovaParams.matrixValid">
          <el-icon>
            <VideoPlay />
          </el-icon>
          运行分析
        </button>
        <span v-if="!permanovaParams.matrixValid" class="run-hint">
          <el-icon>
            <InfoFilled />
          </el-icon>
          请确保所有数据有效
        </span>
      </div>

      <!-- 结果展示 -->
      <div v-if="analysisResult" class="result-section">
        <h2>分析结果</h2>
      <!-- 结果概览：以前这里是一个 <pre>{{ JSON.stringify(analysisResult) }}</pre>，
           用户打开自己的分析结果看到的是一堆键值对。引擎新加的 diagnostics
           （整数编码被当趋势拟合等）塑在那个 JSON 里根本没人看得见。 -->
      <div class="result-summary">
        <div class="rs-headline" :class="headlineState">
          <div class="rs-p">{{ fmtP(analysisResult.p_value) }}</div>
          <div class="rs-cap">{{ headlineCaption }}</div>
          <div class="rs-nums">
            F = {{ fmt(analysisResult.F_model != null ? analysisResult.F_model : analysisResult.F, 4) }}
            ｜R² = {{ fmt(analysisResult.R2, 4) }}
            ｜样本 {{ analysisResult.pcoa && analysisResult.pcoa.n_samples ? analysisResult.pcoa.n_samples : '-' }}
          </div>
        </div>
        <el-alert v-for="(d, di) in diagnostics" :key="'pm-dg-' + di"
                  type="warning" :closable="false" show-icon class="rs-diagnostic">
          <template #title>{{ d }}</template>
        </el-alert>
        <p v-if="analysisResult.message" class="rs-note">{{ analysisResult.message }}</p>
      </div>

      <div class="result-content">
        <table class="rs-table" v-if="resultTerms.length">
          <thead>
            <tr><th>术语</th><th>Df</th><th>SumOfSqs</th><th>R²</th><th>F</th><th>p</th></tr>
          </thead>
          <tbody>
            <tr v-for="t in resultTerms" :key="t.term">
              <td>{{ t.term }}</td>
              <td>{{ t.Df }}</td>
              <td>{{ fmt(t.SumOfSqs, 4) }}</td>
              <td>{{ fmt(t.R2, 4) }}</td>
              <td>{{ fmt(t.F, 4) }}</td>
              <td>{{ fmtP(t.p) }}</td>
            </tr>
          </tbody>
        </table>
        <el-collapse class="rs-raw">
          <el-collapse-item title="原始输出（JSON，调试用）" name="raw">
            <pre>{{ JSON.stringify(analysisResult, null, 2) }}</pre>
          </el-collapse-item>
        </el-collapse>
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
      </div><!-- result-section -->
    </div><!-- config-section -->
  </div>

  <!-- 导入数据对话框 -->
  <ImportDialog v-model="showImportDialog" :sheets="importSheets" :tabs="importTabs"
    :error="importError" :warnings="importWarnings" @file-change="handleFileChange" @apply="applyImport" />


  <!-- 导出结果对话框 -->
  <ExportDialog v-model="showExportDialog" :options="exportOptions2" :selected="exportOptions"
    :error="exportError" @update:selected="(v) => (exportOptions = v)" @confirm="confirmExport" />


  <!-- 事后检验对话框 -->
  <el-dialog v-model="showPosthocDialog" title="🔬 事后检验配置" width="500px">
    <div class="posthoc-dialog-content">
      <el-form :label-width="'120px'">
        <el-form-item label="显著性口径：">
          <el-select v-model="posthocParams.method" placeholder="请选择" style="width: 100%;">
            <el-option label="BH / FDR（Benjamini-Hochberg，推荐）" value="bh" />
            <el-option label="Bonferroni（保守）" value="bonferroni" />
            <el-option label="不校正（看原始置换 p）" value="none" />
          </el-select>
        </el-form-item>

        <el-form-item label="置换次数：">
          <el-input-number v-model="posthocParams.permutations" :min="99" :max="9999" :step="100"
            style="width: 100%;" />
        </el-form-item>

        <el-alert title="注意事项" type="warning" :closable="false" show-icon style="margin-top: 16px;">
          <p>每个对子都单独跑一次两组 PERMANOVA（在它们的样本上重新置换），不是拿整体 p 去拆。</p>
          <p>BH 与 Bonferroni 两列都会给出，选择只决定星号从哪一列起。</p>
          <p>组合数小的对子改用穷举精确置换（默认阈值 5 万划分），此时 p 是精确值。</p>
        </el-alert>
      </el-form>

      <!-- v-loading 是指令不是组件。上一版这里写的是
           <el-loading v-loading="..." /> —— 一个零宽高的未知元素，于是转圈被压在
           一条竖窄里（用户报的“竖向窄条”就是这个）。正确用法：指令直接挂在
           有尺寸的容器上，并整页遮罩。 -->
      <div v-show="posthocLoading" v-loading="posthocLoading" class="posthoc-loading"
        element-loading-text="正在运行事后检验（逐对组独立置换，可能要几十秒）..."
        element-loading-background="rgba(255, 255, 255, 0.88)"></div>
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
          <el-table-column prop="group1" label="组 1" min-width="90" />
          <el-table-column prop="group2" label="组 2" min-width="90" />
          <el-table-column label="n1 / n2" min-width="80">
            <template #default="scope">{{ scope.row.n1 }} / {{ scope.row.n2 }}</template>
          </el-table-column>
          <el-table-column label="组内平均距离" min-width="130">
            <template #default="scope">{{ fmtP(scope.row.mean_within_1) }} . {{ fmtP(scope.row.mean_within_2) }}</template>
          </el-table-column>
          <el-table-column label="组间平均距离" min-width="110">
            <template #default="scope">{{ fmtP(scope.row.mean_between) }}</template>
          </el-table-column>
          <el-table-column label="pseudo-F" min-width="100">
            <template #default="scope">{{ Number.isFinite(scope.row.F) ? fmtP(scope.row.F) : 'Inf' }}</template>
          </el-table-column>
          <el-table-column label="R²" min-width="90">
            <template #default="scope">{{ fmtP(scope.row.R2) }}</template>
          </el-table-column>
          <el-table-column label="p（置换）" min-width="100">
            <template #default="scope">{{ fmtP(scope.row.p) }}</template>
          </el-table-column>
          <el-table-column label="p（BH）" min-width="100">
            <template #default="scope">{{ fmtP(scope.row.p_bh) }}</template>
          </el-table-column>
          <el-table-column label="p（Bonferroni）" min-width="120">
            <template #default="scope">{{ fmtP(scope.row.p_bonferroni) }}</template>
          </el-table-column>
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

        <div class="posthoc-significance-hint" style="margin-top: 16px; line-height: 1.7;">
          <el-icon>
            <InfoFilled />
          </el-icon>
          <span>
            本次按列<strong>{{ posthocResult.groupVariable || '（引擎未回显）' }}</strong>分组 —— 分组项由 R 从公式首项推出（与主管道同一套拆法），前端不再自己拆字符串。<br />
            星号取自当前口径（本次为<strong>{{ posthocPrimaryLabel }}</strong>）那列 p：*** &lt; 0.001，** &lt; 0.01，* &lt; 0.05。<br />
            置换检验的 p 有分辨率下限：随机置换是 1/(次数+1)。p 报到底只能说明「至少这么小」，不能当作「绝对显著」。<br />
            BH 与 Bonferroni 两列永远并列：两者结论不同的对子最该被看见，不由软件替读者决定。
          </span>
        </div>

        <el-alert v-if="posthocResult.diagnostics && posthocResult.diagnostics.length" type="warning"
          title="诊断" :closable="false" show-icon style="margin-top: 12px;">
          <p v-for="(d, i) in posthocResult.diagnostics" :key="i">{{ d }}</p>
        </el-alert>
      </div>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="showPosthocResultDialog = false">关闭</el-button>
        <el-button type="primary" @click="exportPosthocResult">导出结果</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script>
import {
  checkR,
  runPERMANOVA,
  runPERMANOVAPosthoc
} from '@/api/r';

import ToolbarActions from '@/components/r-analysis/ToolbarActions.vue';
import ImportDialog from '@/components/r-analysis/ImportDialog.vue';
import ExportDialog from '@/components/r-analysis/ExportDialog.vue';
import { readWorkbook, mapWorkbook, previewFromFields, writeWorkbook, templateFilename, fileStamp } from '@/utils/sheetIo';
import { makeFormatters } from '@/utils/format';
import { pmPosthocSheets, pmPosthocFilename } from '@/utils/permanovaSheetSpec';

const FORMATTERS = makeFormatters();

/**
 * 剥掉三层无意义的包裹，只留用户看得懂的那句。实机反馈原文长这样：
 *   PERMANOVA 分析失败：Error invoking remote method 'controller/r/runPERMANOVA':
 *   Error: PERMANOVA 分析失败：Error in doTryCatch(return(expr), name, parentenv, handler):
 *   公式里的 ... 不在样本表里。
 * IPC 层、Electron 层、R 调用帧各加了一句壳，真正的原因排在第三层后面。
 */
function unwrapRError(err) {
  let msg = String((err && err.message) || (err && String(err)) || '');
  if (msg === 'Error' || msg === 'undefined') msg = '';
  const strip = [
    /Error invoking remote method '[^']*': ?/,          // IPC 层
    /Error in doTryCatch\(.*?\): ?/,                   // R 调用帧（里面有嵌套括号，必须非贪婪）
    /\[?(?:PERMANOVA|GMR4|Bayesian ERA|Non-random PERMANOVA|PERMANOVA\.R|\.R)\]? Error: ?/,
    /Error: ?/,                                          // Electron 转发层
    /^PERMANOVA 分析失败： ?/                             // 本视图自己加的
  ];
  // 一层层剥，直到不再变化（顺序无关，也不怕同一个前缀出现两次）
  for (let guard = 0; guard < 12; guard++) {
    const before = msg;
    for (const re of strip) msg = msg.replace(re, '');
    if (msg === before) break;
  }
  // 前缀被重复加过（控制器一次、视图一次）时只留最后一句实质内容
  const parts = msg.split('PERMANOVA 分析失败：');
  msg = parts[parts.length - 1];
  msg = msg.replace(/^\s*[:：]\s*/, '').trim();
  return msg || '未知错误（R 没有给出原因，请查看控制台与 error.txt）';
}

import {
  PM_IMPORT_SHEETS,
  PM_EXPORT_OPTIONS,
  pmToFormPatch,
  pmTemplateSheets,
  planExport
} from '@/utils/permanovaSheetSpec';

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
  Setting,
  VideoPlay
} from '@element-plus/icons-vue';
import { ElLoading } from 'element-plus';

// 导入模板数据和组件
import templateData from '@/data/permanova-templates.json';
import chartConfig from '@/data/permanova-charts.json';
import TemplateButton from '@/components/r-analysis/TemplateButton.vue';
import TemplateCategory from '@/components/r-analysis/TemplateCategory.vue';
import { hostWhenReady } from '@/utils/chartHost';

export default {
  name: 'PERMANOVA',
  components: {
  ToolbarActions,
  ImportDialog,
  ExportDialog,
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
    VideoPlay,
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
      importTabs: null,
      importFields: null,
      importIds: null,
      importWarnings: [],
      importError: '',

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
        // 默认值必须是下面三个 option 的 value 之一。上一版写的是 'fdr'：
        // 选项里没有它，于是下拉框显示为空（用户以为没选），而发给引擎的
        // primary='fdr' 全靠 R 把它归一为 bh 兑住 —— 界面上的默认状态是假的。
        method: 'bh',
        permutations: 999
      },

      permanovaParams: {
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
    // 口径回显取自 R 的结果（它自己把 fdr 归一为 bh）-- 视图不另推一套，
    // 否则引擎改了口径定义而这里还写着旧话，界面就开始说谎。
    posthocPrimaryLabel() {
      const r = this.posthocResult;
      if (!r) return 'BH (FDR)';
      return r.primary === 'bonferroni' ? 'Bonferroni'
        : r.primary === 'none' ? '未校正（原始置换 p）' : 'BH (FDR)';
    },
    importSheets() {
      return PM_IMPORT_SHEETS;
    },
    exportOptions2() {
      return PM_EXPORT_OPTIONS.map((o) => ({ key: o.key, label: o.label }));
    },
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
    },

    /** 引擎的硬提醒（整数编码被当趋势拟合、PCoA 没生成等）。旧版没有这个字段，按空处理 */
    diagnostics() {
      const d = this.analysisResult && this.analysisResult.diagnostics;
      return Array.isArray(d) ? d.filter((x) => x && String(x).trim()) : [];
    },

    /** permanova_result 行 → 表格行（字段名跨 vegan 版本不一样，这里已做兼容） */
    /** permanova_result 行 -> 表格行 */
    resultTerms() {
      const rows = (this.analysisResult && this.analysisResult.permanova_result) || [];
      // 行名用引擎给的 _row（adonis2 单术语时是 Model / Residual / Total）。
      // 不读 _row 就只能显示“顼 1 / 顼 2 / 顼 3”，用户分不清哪行是检验、哪行是残差。
      const NAME = { Model: '模型（公式项）', Residual: '残差', Total: '总计' };
      return rows.map((r, i) => ({
        term: NAME[r._row] || r._row || r.term || r.Variable || `顼 ${i + 1}`,
        Df: r.Df,
        SumOfSqs: r.SumOfSqs,
        R2: r.R2,
        F: r.F != null ? r.F : r.F_model,
        p: r.p_value != null ? r.p_value : r['Pr(>F)']
      }));
    },

    /** 样本表里能写进公式的列（去掉首列样本 ID） */
    sampleColumns() {
      const d = this.permanovaParams.sampleData;
      return d && typeof d === 'object' && !Array.isArray(d) ? Object.keys(d).slice(1) : [];
    },

    resultSignificant() {
      const p = this.analysisResult && this.analysisResult.p_value;
      return typeof p === 'number' && p < 0.05;
    },

    /**
     * 引擎带提醒时不能继续用绿色“显著”去总结。
     * 实机反馈就是这个形状：上面绿框 0.0070，下面一句“你检验的是斜率而不是组间差异”——
     * 颜色先回答了“有发现”，文字再说“这个问题问错了”，用户只会记住颜色。
     */
    headlineState() {
      if (this.diagnostics.length) return 'caveat';
      return this.resultSignificant ? 'sig' : 'nsig';
    },

    headlineCaption() {
      const n = this.analysisResult && this.analysisResult.permutations;
      if (this.diagnostics.length) {
        return `p 值（置换 ${n} 次）—— 显著性先别信，见下方提醒`;
      }
      return `p 值（置换 ${n} 次）`;
    },
  },

  watch: {
    // 与另两个模块同一个约定：数据到位就重画，而不是只靠 runPERMANOVA 里那一次性 nextTick。
    analysisResult(v) {
      if (v) this.$nextTick(() => this.renderCurrentChart(v));
    }
  },

  mounted() {
    console.log('[Toolbar] mounted, initial isToolbarExpanded:', this.isToolbarExpanded);
    this.checkRStatus();
    // 滚动到页面顶部
    window.scrollTo(0, 0);
  },

  methods: {
    fmt(v, d = 4) { return FORMATTERS.fmt(v, d); },
    fmtP(v) { return FORMATTERS.fmtP(v); },
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

    // validateDistanceMatrix / validateSampleData 原先在这里还各有一份定义：
    // 同一个 methods 对象里同名后者覆盖前者，那两份从来没被执行过，已删。
    // 生效的定义在文件后面（按名字搜索应当只命中一处）。

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

        console.log('[PERMANOVA] Running PERMANOVA with params:');
        console.log('[PERMANOVA]   matrixSize:', this.permanovaParams.distanceMatrix?.length);
        console.log('[PERMANOVA]   matrix type:', typeof this.permanovaParams.distanceMatrix);
        console.log('[PERMANOVA]   matrix is array:', Array.isArray(this.permanovaParams.distanceMatrix));
        console.log('[PERMANOVA]   matrix[0] type:', typeof this.permanovaParams.distanceMatrix?.[0]);
        console.log('[PERMANOVA]   matrix[0] is array:', Array.isArray(this.permanovaParams.distanceMatrix?.[0]));
        console.log('[PERMANOVA]   permutations:', this.permanovaParams.permutations);
        
        // 构建参数
        const params = this.buildRunParams();
        
        console.log('[PERMANOVA] Params to send to R:');
        console.log('[PERMANOVA]   matrix dimensions:', params.distanceMatrix?.length, 'x', params.distanceMatrix?.[0]?.length);
        console.log('[PERMANOVA]   matrix[0][0]:', params.distanceMatrix?.[0]?.[0], 'type:', typeof params.distanceMatrix?.[0]?.[0]);
        console.log('[PERMANOVA]   matrix[0]:', params.distanceMatrix?.[0]);
        console.log('[PERMANOVA]   full params:', JSON.stringify({
          matrixSize: params.distanceMatrix?.length,
          matrix0Size: params.distanceMatrix?.[0]?.length,
          matrix00: params.distanceMatrix?.[0]?.[0],
          permutations: params.permutations
        }, null, 2));

        // 样本数据与公式一律由 buildRunParams() 给（就是上面那个 params）。
        // 以这里还有一份“没公式就静默补 'Treatment'”的旧逻辑：同一个动作两处各写一遍，
        // 而 'Treatment' 这个凭空捏造的列名根本不在用户的表里（实机报回来的
        // “Df=8 / R²=1 / F=p=N/A” 就是这类默默降级造成的）。
        if (this.permanovaParams.sampleDataValid && !String(this.permanovaParams.formula || '').trim()) {
          loading.close();
          this.$message.error({
            message: '样本表已填，但「模型公式」是空的。空公式只能拿随机分组跑演示结果，'
                   + '那不是你这份数据的答案。可用列：' + (this.sampleColumns.join(', ') || '（样本表没解析出列）'),
            duration: 8000, showClose: true
          });
          return;
        }

        console.log('[PERMANOVA] Calling runPERMANOVA API...');
        const result = await runPERMANOVA(params);
        console.log('[PERMANOVA] PERMANOVA result:', result);

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
        console.error('[PERMANOVA] PERMANOVA error:', error);
        this.$message.error({
          message: 'PERMANOVA 分析失败：' + unwrapRError(error),
          duration: 5000,
          showClose: true
        });
      } finally {
        loadingInstance.close();
      }
    },

    // 处理文件导入
    openImport() {
      this.importTabs = null;
      this.importFields = null;
      this.importIds = null;
      this.importError = '';
      this.importWarnings = [];
      this.showImportDialog = true;
    },

    /**
     * 解析整个交给 sheetIo.mapWorkbook 按声明跑：表名走别名、缺必需表指名拒绝、
     * 样本一律按「距离矩阵」的样本 ID 对齐重排。
     * 以前这里按表的位置猜第一张是矩阵、按行号对齐样本数据 —— 用户在 Excel 里
     * 排一下序，Group/Age 就跟错了样本，图上一点异常都看不出来。
     */
    async handleFileChange(file) {
      this.importError = '';
      this.importWarnings = [];
      this.importTabs = null;
      this.importFields = null;
      this.importIds = null;
      let sheets;
      try {
        sheets = await readWorkbook(file);
      } catch (e) {
        this.importError = '这个文件读不出来：' + (e.message || e) + '（要 .xlsx / .xls / .csv）';
        return;
      }
      const res = mapWorkbook(sheets, PM_IMPORT_SHEETS, {
        primary: 'distance',
        sampleKey: 'sample',
        // 本模块不像 Non-random 那样只收因子：数值列会直接进 adonis2 当连续协变量。
        // 0/1 编码的分组会被当连续变量（这是 permanova.R 的已知欠账），所以这里说清后果而不是说“请分箱”
        sampleNumericHint: (cols) => `样本信息里这些列是数值：${cols.join(', ')}，将作为连续协变量进模型。` +
          '如果它们其实是分组（如 0/1 编码），请改成文本（如 A/B），否则检验按连续变量做、结果不可读'
      });
      this.importWarnings = res.warnings || [];
      if (!res.ok) {
        this.importError = res.error;
        return;
      }
      this.importFields = res.fields;
      this.importIds = res.ids;
      this.importTabs = previewFromFields(res.ids, res.fields.distance, res.fields, {});
    },

    /** 先看后填：用户点头才动表单 */
    applyImport() {
      if (!this.importFields) {
        // 已经报过的错优先（“距离矩阵不是方阵”比“先选一个文件”有用得多）
        if (!this.importError) this.importError = '先选一个文件';
        return;
      }
      const patch = pmToFormPatch(this.importFields, this.importIds);
      Object.assign(this.permanovaParams, patch);
      this.validateDistanceMatrix();
      this.validateSampleData();
      this.showImportDialog = false;
      this.$message.success({
        message: `已填入 ${this.importIds.length} 个样本${patch.formula ? '与模型公式' : ''}`,
        duration: 2500
      });
    },

    closeImportDialog() {
      this.showImportDialog = false;
      this.importTabs = null;
      this.importError = '';
      this.importWarnings = [];
    },

    /** 下载模板：表结构由 spec 声明，这里只负责写出 */
    async downloadTemplate() {
      try {
        await writeWorkbook(await this.xlsx(), pmTemplateSheets(), this.templateFileName());
      } catch (e) {
        this.$message.error('模板下载失败：' + (e.message || e));
      }
    },

    /** 文件名格式三个模块一致（见 sheetIo.templateFilename） */
    templateFileName() {
      return templateFilename('PERMANOVA', this.stamp());
    },

    /** 送给 R 的参数就一个来源：按钮可用性、运行、下载输入都用它，不再各拼一遍 */
    buildRunParams() {
      const p = this.permanovaParams;
      const params = { distanceMatrix: p.distanceMatrix, permutations: p.permutations };
      if (p.sampleDataValid && p.sampleData && p.formula) {
        params.sampleData = p.sampleData;
        params.formula = p.formula;
      }
      return params;
    },

    openExport() {
      this.exportError = '';
      this.showExportDialog = true;
    },

    /** 勾选 -> 任务表（内容与文件名全在 spec 里算，这里不拼） */
    exportJobs(keys) {
      return planExport(keys || this.exportOptions, { analysisResult: this.analysisResult, params: this.permanovaParams }, this.stamp());
    },

    async confirmExport() {
      this.exportError = '';
      if (!this.analysisResult) {
        this.exportError = '还没有分析结果可导出';
        return;
      }
      const jobs = this.exportJobs();
      try {
        for (const job of jobs) {
          if (job.type === 'xlsx') await writeWorkbook(await this.xlsx(), job.sheets, job.filename);
          else if (job.type === 'json') await this.saveJson(job.filename, job.data);
          else await this.exportPng(job.filename);
        }
        this.showExportDialog = false;
        this.$message.success(`已导出 ${jobs.length} 项`);
      } catch (e) {
        this.exportError = '导出失败：' + (e.message || e);
      }
    },

    async downloadInput() {
      try {
        await this.saveJson(`PERMANOVA 输入_${this.stamp()}.json`, this.buildRunParams());
      } catch (e) {
        this.$message.error('导出输入失败：' + (e.message || e));
      }
    },

    /** 时间戳统一由 sheetIo.fileStamp 给（三个模块的文件名要能对上） */
    stamp() {
      return fileStamp();
    },

    async xlsx() {
      // 动态 import 失败要说得出**可操作**的一句话。实机现象是
      // 「Failed to fetch dynamically imported module: .../.vite/deps/xlsx.js」：
      // dev 模式下那份依赖缓存与服务的内存元数据不一致（被我 rm 掉过，也被跑测试的
      // 进程改写过的历史）时，浏览器手里那个引用取不到文件。
      // 注意顺序：光刷新不一定够 —— 元数据与磁盘不一致时只有重启 dev 才重建。
      try {
        const m = await import('xlsx');
        const lib = m.utils ? m : m.default;
        if (!lib || !lib.utils) throw new Error('xlsx 模块没有预期导出');
        return lib;
      } catch (e) {
        throw new Error('Excel 组件加载失败：' + ((e && e.message) || e) +
          '。按顺序试：① 刷新页面（Ctrl+F5）再点一次；② 仍然失败就重启 npm run dev —— ' +
          '若 dev 服务内存里的依赖元数据与磁盘不一致（例如 node_modules/.vite 被删过），' +
          '只有重启才会重建，光刷新没有用。');
      }
    },

    async saveJson(filename, data) {
      // file-saver 也是动态 import，失败原因与 xlsx 同一个（dev 依赖缓存被改写）。
      // 在这里统一变成人话，四个调用点（下载输入 / 导出 JSON）就不用各写一遍。
      let saveAs;
      try {
        ({ saveAs } = await import('file-saver'));
      } catch (e) {
        throw new Error('保存组件加载失败：' + ((e && e.message) || e) +
          '。先刷新页面（Ctrl+F5）；仍然失败就重启 npm run dev —— 依赖元数据与磁盘不一致时只有重启会重建。');
      }
      if (typeof saveAs !== 'function') throw new Error('file-saver 没有导出 saveAs');
      saveAs(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
    },

    /** 只导得出正在看的那张图：其它 tab 还没实例化 */
    async exportPng(filename) {
      const el = this.$refs.pcoaChart;
      if (!el) throw new Error('图表还没渲染');
      const echarts = await import('echarts');
      const chart = echarts.getInstanceByDom(el);
      if (!chart) throw new Error('当前没有可导出的图表实例');
      const { saveAs } = await import('file-saver');
      const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
      const bytes = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
      saveAs(new Blob([bytes], { type: 'image/png' }), filename);
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
      // 旧写法：拿不到容器就 console.error + return——DOM 只晚一帧也会“初次不画、切 tab 才画”，
      // 而且用户看到的是空白而不是任何提示。现在先有界等几帧。
      const { el: chartContainer, waited } = await hostWhenReady(
        () => this.$refs.pcoaChart || null, this.$nextTick
      );
      if (!chartContainer) {
        console.warn('[Chart] 等了', waited, '帧仍没拿到可测量的容器');
        this.$message.warning('图表容器还没就绪（等了 ' + waited + ' 帧），切一下图表类型可重画');
        return;
      }

      const echarts = await import('echarts');

      let myChart = echarts.getInstanceByDom(chartContainer);
      if (!myChart) {
        myChart = echarts.init(chartContainer);
      }

      switch (this.activeChartType) {
        case 'scatter':
          this.renderScatterChart(result, myChart, echarts);
          break;
        case 'scree':
          this.renderScreeChart(result, myChart, echarts);
          break;
        case 'variance':
          this.renderVariancePieChart(result, myChart, echarts);
          break;
        case 'boxplot':
          this.renderBoxplotChart(result, myChart, echarts);
          break;
        case 'heatmap':
          this.renderHeatmapChart(result, myChart, echarts);
          break;
      }
      // 布局晚到（刚挂载 / 滚动 / 字体回流）时，这一帧后的 resize 能补上尺寸；
      // 与 utils/chartHost.js 里给另两个模块的保险保持同一个做法
      this.$nextTick(() => {
        try { myChart.resize(); } catch (e) { /* 已销毁就算了 */ }
        // 自己量一下：init 在 0 宽容器上不报错，只画个看不见的空图
        if (typeof myChart.getWidth === 'function' && myChart.getWidth() === 0) {
          this.$message.warning('图表已生成但宽度为 0（布局未完成），切一下图表类型可重画');
        }
      });
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
        this.permanovaParams.sampleDataValid;

      console.log('[Posthoc] checkCanRunPosthoc:', result, {
        hasAnalysisResult: !!this.analysisResult,
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
      if (!this.permanovaParams || !this.permanovaParams.sampleDataValid) {
        reasons.push('② 样本数据无效或与距离矩阵不匹配');
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

    // 导出事后检验结果：列与说明全部由 permanovaSheetSpec 给，视图不再手拼 workbook。
    // 以前这里把原始 p 写成「校正 p 值」导出 -- 拿到 xlsx 的人根本看不出那是假的。
    async exportPosthocResult() {
      if (!this.posthocResult || !this.posthocResult.comparisons) {
        this.$message.error('没有可导出的事后检验结果');
        return;
      }
      try {
        const XLSX = await this.xlsx();
        const sheets = pmPosthocSheets(this.posthocResult, {
          stampText: new Date().toLocaleString(),
          primaryLabel: this.posthocPrimaryLabel
        });
        await writeWorkbook(XLSX, sheets, pmPosthocFilename(this.stamp()));
        this.$message.success(`事后检验已导出：${this.posthocResult.comparisons.length} 个两两比较 + 口径说明`);
      } catch (error) {
        console.error('[Export] Export posthoc result error:', error);
        this.$message.error('导出失败：' + ((error && error.message) || error));
      }
    },

    // 运行事后检验
    async runPosthocTest() {
      console.log('[Posthoc] runPosthocTest called');

      if (!this.analysisResult || !this.permanovaParams.sampleData) {
        this.$message.error('请先运行 PERMANOVA 分析并确保样本数据有效');
        return;
      }

      // 一开跑就丢掉上一次的结果。上一版失败路径什么都不清，于是引擎当场拒单之后，
      // 界面仍然挂着**上一次的表**，导出按钮也还亮着 —— 那份数字属于另一次分析。
      this.posthocResult = null;
      this.posthocLoading = true;

      try {
        // 分组交给 R：视图把整张样本表与公式原样传过去
        const formula = String(this.permanovaParams.formula || '').trim();
        if (!formula) {
          this.$message.error({
            message: '事后检验需要从「模型公式」里取分组变量，但公式是空的。可用列：'
                   + (this.sampleColumns.join(', ') || '（样本表没解析出列）'),
            duration: 7000, showClose: true
          });
          this.posthocLoading = false;
          return;
        }

        // 分组项**不在前端挑**。以前这里写的是
        //     const firstVar = formula.split('+')[0].trim();
        //     const groups = sampleData[firstVar];
        // 于是主引擎完全接受的 `dist ~ as.factor(Group) + Age` 到了事后检验变成
        // 「变量 "as.factor(Group)" 不存在」—— 那是要求用户重写一个合法公式。
        // 现在把整张样本表与公式原样交给 R，由引擎决定分组项（与 permanova.R 同源），
        // 并且它会拒绝"取值逐样本唯一"的首项（那是标识列，不是分组）。
        // 视图也不在这里数分组个数：判断一次就够，重复的判断迟早和 R 漂移。

        const distanceMatrix = this.permanovaParams.distanceMatrix;
        if (!Array.isArray(distanceMatrix) || !distanceMatrix.length) {
          this.$message.error({
            message: '还没有距离矩阵。事后检验要在 PERMANOVA 那份两两距离上做，请先算出或导入距离矩阵。',
            duration: 8000, showClose: true
          });
          this.posthocLoading = false;
          return;
        }

        // 距离矩阵与公式同源检查：样本表行数必须与矩阵一致，否则引擎会拿
        // 半张表去配对子。这条留给引擎报也报得清，但在这里拦下更早、更省一次进程。
        const sampleData = this.permanovaParams.sampleData;
        const sampleN = sampleData && Object.keys(sampleData).length
          ? (sampleData[Object.keys(sampleData)[0]] || []).length : 0;
        if (sampleN !== distanceMatrix.length) {
          this.$message.error({
            message: `样本表有 ${sampleN} 行，距离矩阵是 ${distanceMatrix.length} 个样本：两者必须同序同数，`
                   + '否则事后检验会把分组贴到别的样本上。',
            duration: 8000, showClose: true
          });
          this.posthocLoading = false;
          return;
        }

        const res = await runPERMANOVAPosthoc({
          distanceMatrix,
          sampleData,
          formula: String(this.permanovaParams.formula || '').trim(),
          permutations: this.posthocParams.permutations,
          seed: this.permanovaParams.seed || 12345,
          primary: this.posthocParams.method
        });

        const arr = (x) => (Array.isArray(x) ? x : [x]);
        const pairs = arr(res.pairs);
        const c1 = arr(res.group1), c2 = arr(res.group2);
        const n1s = arr(res.n1), n2s = arr(res.n2);
        const mw1 = arr(res.mean_within_1), mw2 = arr(res.mean_within_2), mb = arr(res.mean_between);
        const fs = arr(res.pseudo_f), r2s = arr(res.r2);
        const praw = arr(res.p_raw), pbh = arr(res.p_bh), pbf = arr(res.p_bonferroni);
        const pprim = arr(res.p_primary), pfloor = arr(res.p_floor);
        const stars = arr(res.significance), exa = arr(res.exact_permutation), nps = arr(res.n_perm_used);

        const comparisons = pairs.map((nm, idx) => ({
          pair: nm,
          group1: c1[idx], group2: c2[idx], n1: n1s[idx], n2: n2s[idx],
          mean_within_1: mw1[idx], mean_within_2: mw2[idx], mean_between: mb[idx],
          F: fs[idx], R2: r2s[idx],
          p: praw[idx], p_bh: pbh[idx], p_bonferroni: pbf[idx], p_primary: pprim[idx],
          p_floor: pfloor[idx],
          significance: stars[idx],
          exact: String(exa[idx]) === 'TRUE',
          n_perm_used: nps[idx]
        }));

        this.posthocResult = {
          comparisons,
          groupVariable: res.group_variable,
          method: res.method,
          primary: res.primary,
          permutations: res.permutations,
          seed: res.seed,
          n_groups: res.n_groups,
          groups: arr(res.groups),
          diagnostics: arr(res.diagnostics),
          interpretation: res.interpretation,
          exactCount: comparisons.filter((c) => c.exact).length
        };

        // 打开结果对话框
        this.showPosthocResultDialog = true;
        const nsig = comparisons.filter((c) => c.p_primary < 0.05).length;
        this.$message.success(
          `事后检验完成：${comparisons.length} 个两两比较，其中 ${nsig} 个在校正后 p<0.05（口径 ${this.posthocPrimaryLabel}）`
        );
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

/* 数据输入区域样式 */
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
  margin-top: 8px;
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

.result-section {
  margin-top: 30px;
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

/* 结果概览：p/F/R² 一眼能读到，引擎提醒紧跟在后头。
   写在本视图自己的 scoped 里，不再往 Med 的 CSS 或 r-analysis.css 里搜（那个文件是生成产物）。 */
.result-summary {
  margin-bottom: 16px;
}
.rs-headline {
  display: flex;
  align-items: baseline;
  gap: 18px;
  padding: 14px 18px;
  border-radius: 6px;
  background: #f5f7fa;
  border-left: 5px solid #909399;
}
.rs-headline.sig { border-left-color: #67c23a; background: #f0f9eb; }
.rs-headline.nsig { border-left-color: #e6a23c; background: #fdf6ec; }
/* 引擎带提醒：橙底 + 左侧红条，既不报喜也不装死 */
.rs-headline.caveat { border-left-color: #f56c6c; background: #fdf6ec; }
.rs-headline.caveat .rs-p { color: #b8560f; }
.rs-p { font-size: 30px; font-weight: 700; line-height: 1.1; }
.rs-cap { font-size: 12px; color: #606266; }
.rs-nums { margin-left: auto; font-size: 13px; color: #303133; }
.rs-diagnostic { margin-top: 10px; }
.rs-diagnostic :deep(.el-alert__title) { font-size: 12px; line-height: 1.7; white-space: normal; }
.rs-note { margin: 10px 0 0; font-size: 12px; color: #606266; }
.rs-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
.rs-table th, .rs-table td { border: 1px solid #ebeef5; padding: 6px 10px; text-align: right; }
.rs-table th:first-child, .rs-table td:first-child { text-align: left; }
.rs-raw { margin-top: 8px; }

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

.formula-preview {
  padding: 16px;
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
  width: 100%;
  /* v-loading 的遮罩靠定位父级铺满；没有宽高就只会得到一条竖窄 */
  align-self: stretch;
  flex: 1 1 auto;
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
