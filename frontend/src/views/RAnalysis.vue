<template>
  <div class="r-analysis-container">
    <h1>🧬 统计分析模块</h1>
    
    <!-- R 环境检测 -->
    <div class="r-status-card">
      <h2>R 环境状态</h2>
      <div class="status-info">
        <span v-if="rAvailable" class="status-available">✅ R 环境就绪</span>
        <span v-else class="status-unavailable">❌ R 未安装</span>
      </div>
      <button @click="checkRStatus" class="btn-check">重新检测</button>
      <div v-if="!rAvailable" class="r-install-guide">
        <p>请安装 R 从：<a href="https://cran.r-project.org/" target="_blank">https://cran.r-project.org/</a></p>
        <p>安装后确保 Rscript 在系统 PATH 中</p>
      </div>
    </div>

    <!-- 分析方法选择 -->
    <div class="analysis-methods">
      <h2>选择分析方法</h2>
      <div class="method-grid">
        <button 
          v-for="method in methods" 
          :key="method.id"
          @click="selectMethod(method.id)"
          :class="['method-card', { active: selectedMethod === method.id }]"
        >
          <h3>{{ method.name }}</h3>
          <p>{{ method.description }}</p>
        </button>
      </div>
    </div>

    <!-- 参数配置区域 -->
    <div v-if="selectedMethod" class="method-config">
      <h2>配置参数 - {{ currentMethod.name }}</h2>
      
      <!-- 示例：PERMANOVA 配置 -->
      <div v-if="selectedMethod === 'permanova'" class="config-form">
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
          <textarea 
            v-model="permanovaParams.distanceMatrixStr" 
            rows="16" 
            placeholder='[[0, 0.2, 0.3], [0.2, 0, 0.25], [0.3, 0.25, 0]]'
            @input="onDistanceMatrixChangeAndValidate"
          ></textarea>
          <div v-if="permanovaParams.matrixError" class="error-msg">{{ permanovaParams.matrixError }}</div>
          <div v-if="permanovaParams.matrixValid" class="success-msg">
            ✅ 有效矩阵：{{ permanovaParams.matrixSize }} 个样本
          </div>
        </div>

        <!-- 高级模式：样本数据 -->
        <div v-if="permanovaParams.mode === 'advanced'" class="advanced-section">
          <!-- 当前选择的公式 -->
          <el-alert
            v-if="permanovaParams.selectedTemplate"
            title="📌 当前选择的模板"
            type="info"
            show-icon
            closable
            @close="clearSelectedTemplate"
            style="margin-bottom: 16px;"
          >
            <template #default>
              <div style="margin-top: 8px;">
                <div><strong>模板：</strong>{{ getTemplateName(permanovaParams.selectedTemplate) }}</div>
                <div><strong>公式：</strong><code style="background: #f5f7fa; padding: 4px 8px; border-radius: 4px;">{{ getTemplateFormula(permanovaParams.selectedTemplate) }}</code></div>
                <div style="margin-top: 6px; color: #666; font-size: 13px;">
                  💡 提示：修改下方公式或数据将自动清除模板选择
                </div>
              </div>
            </template>
          </el-alert>
          
          <!-- 常用公式模板 -->
          <div class="form-group">
            <div class="template-header">
              <div class="template-header-title">
                <span class="template-icon">📋</span>
                <span class="template-label">常用公式模板</span>
              </div>
              <el-button 
                class="template-toggle-btn"
                @click="toggleTemplateCollapse"
              >
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
              <button 
                type="button"
                @click="loadTemplate('singleFactor')" 
                :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'singleFactor' }]"
                title="单因素 PERMANOVA，检验分组效应">
                🧪 单因素分析
              </button>
              <button 
                type="button"
                @click="loadTemplate('multiFactor')" 
                :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'multiFactor' }]"
                title="多因素 PERMANOVA，同时检验多个变量">
                📊 多因素分析
              </button>
              <button 
                type="button"
                @click="loadTemplate('interaction')" 
                :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'interaction' }]"
                title="检验两个变量的交互作用">
                🔀 交互作用
              </button>
              <button 
                type="button"
                @click="loadTemplate('ancova')" 
                :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'ancova' }]"
                title="控制协变量后检验处理效应">
                📈 协变量分析
              </button>
              <button 
                type="button"
                @click="loadTemplate('nested')" 
                :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'nested' }]"
                title="嵌套设计，Site 内的 Treatment 效应">
                🗂️ 嵌套设计
              </button>
              <button 
                type="button"
                @click="loadTemplate('fullModel')" 
                :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'fullModel' }]"
                title="完全模型：主效应 + 交互 + 区组">
                🎯 完全模型
              </button>
              <button 
                type="button"
                @click="loadTemplate('microbiome')" 
                :class="['btn-template', { selected: permanovaParams.selectedTemplate === 'microbiome' }]"
                title="微生物组研究常用设计">
                🦠 微生物组
              </button>
            </div>
            
            <!-- 物理/环境科学方向 -->
            <div class="template-section-title">🌍 物理/环境科学方向</div>
            <div class="template-buttons">
              <button 
                type="button"
                @click="loadTemplate('timeSeries')" 
                class="btn-template"
                title="时间序列分析，纵向数据">
                ⏱️ 时间序列
              </button>
              <button 
                type="button"
                @click="loadTemplate('spatial')" 
                class="btn-template"
                title="空间分布分析">
                🌍 空间分析
              </button>
              <button 
                type="button"
                @click="loadTemplate('temperatureGradient')" 
                class="btn-template"
                title="温度梯度分析">
                🌡️ 温度梯度
              </button>
              <button 
                type="button"
                @click="loadTemplate('doseResponse')" 
                class="btn-template"
                title="剂量反应分析">
                💊 剂量反应
              </button>
              <button 
                type="button"
                @click="loadTemplate('repeatedMeasures')" 
                class="btn-template"
                title="重复测量设计">
                🔄 重复测量
              </button>
              <button 
                type="button"
                @click="loadTemplate('blockDesign')" 
                class="btn-template"
                title="区组设计，控制批次效应">
                📦 区组设计
              </button>
              <button 
                type="button"
                @click="loadTemplate('environmental')" 
                class="btn-template"
                title="多环境因子综合分析">
                🌊 环境因子
              </button>
            </div>
            
            <!-- 农业/林业/生态方向 -->
            <div class="template-section-title">🌾 农业/林业/生态方向</div>
            <div class="template-buttons">
              <button 
                type="button"
                @click="loadTemplate('cropVariety')" 
                class="btn-template"
                title="作物品种与栽培管理">
                🌾 作物品种
              </button>
              <button 
                type="button"
                @click="loadTemplate('soilType')" 
                class="btn-template"
                title="土壤类型与理化性质">
                🟤 土壤分析
              </button>
              <button 
                type="button"
                @click="loadTemplate('plantCommunity')" 
                class="btn-template"
                title="植物群落调查">
                🌿 植物群落
              </button>
              <button 
                type="button"
                @click="loadTemplate('invasiveSpecies')" 
                class="btn-template"
                title="入侵物种影响评估">
                🌾 入侵物种
              </button>
              <button 
                type="button"
                @click="loadTemplate('forestCommunity')" 
                class="btn-template"
                title="森林群落结构">
                🌲 森林群落
              </button>
              <button 
                type="button"
                @click="loadTemplate('landUse')" 
                class="btn-template"
                title="土地利用变化">
                🏞️ 土地利用
              </button>
              <button 
                type="button"
                @click="loadTemplate('protectedArea')" 
                class="btn-template"
                title="保护区评估">
                🛡️ 保护区
              </button>
              <button 
                type="button"
                @click="loadTemplate('climateChange')" 
                class="btn-template"
                title="气候变化响应">
                🌡️ 气候变化
              </button>
            </div>
            
            <!-- 海洋/昆虫方向 -->
            <div class="template-section-title">🐟 海洋/昆虫方向</div>
            <div class="template-buttons">
              <button 
                type="button"
                @click="loadTemplate('fishCommunity')" 
                class="btn-template"
                title="鱼类群落分析">
                🐟 鱼类群落
              </button>
              <button 
                type="button"
                @click="loadTemplate('plankton')" 
                class="btn-template"
                title="浮游生物研究">
                🦠 浮游生物
              </button>
              <button 
                type="button"
                @click="loadTemplate('insectCommunity')" 
                class="btn-template"
                title="昆虫群落调查">
                🦋 昆虫群落
              </button>
            </div>
            
            <!-- 基因组学/医学方向 -->
            <div class="template-section-title">🧬 基因组学/医学方向</div>
            <div class="template-buttons">
              <button 
                type="button"
                @click="loadTemplate('geneExpression')" 
                class="btn-template"
                title="基因表达谱分析">
                🧬 基因表达
              </button>
              <button 
                type="button"
                @click="loadTemplate('singleCell')" 
                class="btn-template"
                title="单细胞转录组分析">
                🔬 单细胞分析
              </button>
              <button 
                type="button"
                @click="loadTemplate('diseaseSubtype')" 
                class="btn-template"
                title="疾病亚型分类">
                🏥 疾病亚型
              </button>
              <button 
                type="button"
                @click="loadTemplate('treatmentEffect')" 
                class="btn-template"
                title="治疗效果评估">
                💊 治疗效果
              </button>
              <button 
                type="button"
                @click="loadTemplate('brainConnectivity')" 
                class="btn-template"
                title="脑区连接分析">
                🧠 脑连接
              </button>
            </div>
            
            <!-- 食品科学方向 -->
            <div class="template-section-title">🍽️ 食品科学方向</div>
            <div class="template-buttons">
              <button 
                type="button"
                @click="loadTemplate('fermentation')" 
                class="btn-template"
                title="发酵过程监控">
                🍶 发酵监控
              </button>
              <button 
                type="button"
                @click="loadTemplate('foodOrigin')" 
                class="btn-template"
                title="食品产地溯源">
                🍷 产地溯源
              </button>
            </div>
            </div>
            </el-collapse-transition>
          </div>

          <div class="form-group">
            <label>样本数据 (JSON 格式):</label>
            <textarea 
              v-model="permanovaParams.sampleDataStr" 
              rows="16" 
              placeholder='{"Treatment": ["A", "A", "B", "B"], "pH": [6.5, 6.8, 7.2, 7.0]}'
              @input="onSampleDataChangeAndValidate"
            ></textarea>
            <div v-if="permanovaParams.sampleDataError" class="error-msg">{{ permanovaParams.sampleDataError }}</div>
            <div v-if="permanovaParams.sampleDataValid" class="success-msg">
              ✅ 有效数据：{{ permanovaParams.sampleDataRows }} 行，{{ permanovaParams.sampleDataCols }} 个变量
            </div>
            <div class="hint">键是变量名，值是数组（长度 = 样本数，需与距离矩阵匹配）</div>
          </div>

          <div class="form-group">
            <label>模型公式:</label>
            <input 
              v-model="permanovaParams.formula" 
              @input="onFormulaChange"
              type="text" 
              placeholder="Treatment" 
            />
            <div class="hint">输入样本数据中的变量名，用 + 连接多个变量，用 * 表示交互作用</div>
          </div>
        </div>

        <!-- 简单模式提示 -->
        <div v-if="permanovaParams.mode === 'simple'" class="simple-hint">
          <div class="hint">
            ℹ️ 简单模式会自动创建分组进行演示分析。
            <br/>如需真实分析，请切换到高级模式并提供样本数据。
          </div>
        </div>

        <div class="form-group">
          <label>置换次数:</label>
          <input v-model.number="permanovaParams.permutations" type="number" min="99" max="9999" />
        </div>

        <button @click="runPERMANOVA" class="btn-run" :disabled="!permanovaParams.matrixValid">
          运行分析
        </button>
      </div>

      <!-- 示例：GMR⁴ 配置 -->
      <div v-else-if="selectedMethod === 'gmr4'" class="config-form">
        <div class="form-group">
          <label>预测变量 X (JSON 矩阵):</label>
          <textarea v-model="gmr4Params.X" rows="4" placeholder='[[1, 2], [3, 4], [5, 6]]'></textarea>
        </div>
        <div class="form-group">
          <label>响应变量 Y (JSON 矩阵):</label>
          <textarea v-model="gmr4Params.Y" rows="4" placeholder='[[0.5], [0.7], [0.9]]'></textarea>
        </div>
        <div class="form-group">
          <label>秩 (rank):</label>
          <input v-model.number="gmr4Params.rank" type="number" min="1" max="10" />
        </div>
        <div class="form-group">
          <label>正则化参数 (lambda):</label>
          <input v-model.number="gmr4Params.lambda" type="number" step="0.01" min="0" />
        </div>
        <button @click="runGMR4" class="btn-run">运行分析</button>
      </div>

      <!-- 其他方法类似配置... -->
      <div v-else class="config-placeholder">
        <p>该方法的配置界面开发中...</p>
      </div>
    </div>

    <!-- 结果展示 -->
    <div v-if="analysisResult" class="result-section">
      <h2>分析结果</h2>
      <div class="result-content">
        <pre>{{ JSON.stringify(analysisResult, null, 2) }}</pre>
      </div>
      
      <!-- 图表展示区域（如果使用 ECharts） -->
      <div v-if="analysisResult.permanova_result" class="result-chart">
        <h3>PCoA 图</h3>
        <div ref="pcoaChart" style="width: 600px; height: 400px;"></div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在运行 R 分析，请稍候...</p>
      <p class="loading-hint">复杂模型可能需要几分钟</p>
    </div>
  </div>
</template>

<script>
import { 
  checkR, 
  runPERMANOVA, 
  runGMR4,
  runPERMANOVA_Med,
  runBayesianERA_Mediation,
  runNonRandomPERMANOVA
} from '@/api/r';

export default {
  name: 'RAnalysis',
  data() {
    return {
      rAvailable: false,
      selectedMethod: null,
      loading: false,
      analysisResult: null,
      
      methods: [
        { id: 'permanova', name: 'PERMANOVA', description: '置换多元方差分析' },
        { id: 'permanova_med', name: 'PERMANOVA-med', description: 'PERMANOVA 中介分析' },
        { id: 'gmr4', name: 'GMR⁴', description: '广义混合正则化降秩回归' },
        { id: 'bayesian_era', name: 'Bayesian ERA', description: '贝叶斯扩展冗余分析' },
        { id: 'nonrandom_permanova', name: 'Non-random PERMANOVA', description: '非随机 PERMANOVA 扩展' }
      ],
      
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
      },
      
      gmr4Params: {
        X: [],
        Y: [],
        rank: 2,
        lambda: 0.1
      }
    };
  },
  
  computed: {
    currentMethod() {
      return this.methods.find(m => m.id === this.selectedMethod) || {};
    }
  },
  
  mounted() {
    this.checkRStatus();
  },
  
  methods: {
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
    
    selectMethod(methodId) {
      this.selectedMethod = methodId;
      this.analysisResult = null;
    },
    
    validateDistanceMatrix() {
      try {
        const matrix = JSON.parse(this.permanovaParams.distanceMatrixStr);
        if (!Array.isArray(matrix) || matrix.length < 3) {
          this.permanovaParams.matrixValid = false;
          this.permanovaParams.matrixError = '至少需要 3 个样本';
          this.permanovaParams.matrixSize = 0;
          return;
        }
        
        // 验证是否为方阵
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
    
    loadTemplate(templateName) {
      const templates = {
        // ==================== 生物/医学方向 ====================
        
        // 单因素分析
        singleFactor: {
          formula: 'Treatment',
          sampleData: {
            Treatment: ['Control', 'Control', 'Control', 'Control', 'Control', 
                       'Drug', 'Drug', 'Drug', 'Drug', 'Drug']
          },
          distanceMatrix: [
            [0, 0.15, 0.18, 0.22, 0.25, 0.55, 0.58, 0.62, 0.65, 0.68],
            [0.15, 0, 0.12, 0.18, 0.20, 0.52, 0.55, 0.58, 0.62, 0.65],
            [0.18, 0.12, 0, 0.15, 0.22, 0.58, 0.60, 0.63, 0.66, 0.68],
            [0.22, 0.18, 0.15, 0, 0.17, 0.54, 0.57, 0.60, 0.63, 0.66],
            [0.25, 0.20, 0.22, 0.17, 0, 0.56, 0.59, 0.62, 0.65, 0.67],
            [0.55, 0.52, 0.58, 0.54, 0.56, 0, 0.14, 0.18, 0.22, 0.25],
            [0.58, 0.55, 0.60, 0.57, 0.59, 0.14, 0, 0.16, 0.20, 0.23],
            [0.62, 0.58, 0.63, 0.60, 0.62, 0.18, 0.16, 0, 0.15, 0.19],
            [0.65, 0.62, 0.66, 0.63, 0.65, 0.22, 0.20, 0.15, 0, 0.17],
            [0.68, 0.65, 0.68, 0.66, 0.67, 0.25, 0.23, 0.19, 0.17, 0]
          ],
          desc: '🧪 单因素 PERMANOVA - 检验 Treatment 分组对群落结构的影响'
        },
        
        // 多因素分析
        multiFactor: {
          formula: 'Treatment + Age + BMI',
          sampleData: {
            Treatment: ['Control', 'Control', 'Control', 'Control', 'Control', 
                       'Drug', 'Drug', 'Drug', 'Drug', 'Drug'],
            Age: [25, 30, 35, 28, 32, 27, 33, 29, 31, 34],
            BMI: [22.5, 24.0, 26.5, 23.0, 25.5, 23.5, 25.0, 27.0, 24.5, 26.0]
          },
          distanceMatrix: [
            [0, 0.15, 0.18, 0.22, 0.25, 0.55, 0.58, 0.62, 0.65, 0.68],
            [0.15, 0, 0.12, 0.18, 0.20, 0.52, 0.55, 0.58, 0.62, 0.65],
            [0.18, 0.12, 0, 0.15, 0.22, 0.58, 0.60, 0.63, 0.66, 0.68],
            [0.22, 0.18, 0.15, 0, 0.17, 0.54, 0.57, 0.60, 0.63, 0.66],
            [0.25, 0.20, 0.22, 0.17, 0, 0.56, 0.59, 0.62, 0.65, 0.67],
            [0.55, 0.52, 0.58, 0.54, 0.56, 0, 0.14, 0.18, 0.22, 0.25],
            [0.58, 0.55, 0.60, 0.57, 0.59, 0.14, 0, 0.16, 0.20, 0.23],
            [0.62, 0.58, 0.63, 0.60, 0.62, 0.18, 0.16, 0, 0.15, 0.19],
            [0.65, 0.62, 0.66, 0.63, 0.65, 0.22, 0.20, 0.15, 0, 0.17],
            [0.68, 0.65, 0.68, 0.66, 0.67, 0.25, 0.23, 0.19, 0.17, 0]
          ],
          desc: '📊 多因素 PERMANOVA - 同时检验 Treatment、Age、BMI 的独立效应'
        },
        
        // 交互作用
        interaction: {
          formula: 'Treatment * pH',
          sampleData: {
            Treatment: ['Control', 'Control', 'Control', 'Control', 'Drug', 'Drug', 'Drug', 'Drug'],
            pH: [6.5, 6.8, 7.2, 7.5, 6.6, 6.9, 7.3, 7.6]
          },
          distanceMatrix: [
            [0, 0.12, 0.18, 0.25, 0.55, 0.58, 0.65, 0.68],
            [0.12, 0, 0.15, 0.22, 0.52, 0.55, 0.62, 0.65],
            [0.18, 0.15, 0, 0.20, 0.58, 0.60, 0.63, 0.66],
            [0.25, 0.22, 0.20, 0, 0.54, 0.57, 0.60, 0.63],
            [0.55, 0.52, 0.58, 0.54, 0, 0.14, 0.22, 0.25],
            [0.58, 0.55, 0.60, 0.57, 0.14, 0, 0.20, 0.23],
            [0.65, 0.62, 0.63, 0.60, 0.22, 0.20, 0, 0.17],
            [0.68, 0.65, 0.66, 0.63, 0.25, 0.23, 0.17, 0]
          ],
          desc: '🔀 交互作用 - 检验 Treatment 和 pH 的交互效应（Treatment 效应是否依赖 pH 水平）'
        },
        
        // 协变量分析
        ancova: {
          formula: 'Treatment + pH',
          sampleData: {
            Treatment: ['Control', 'Control', 'Control', 'Drug', 'Drug', 'Drug'],
            pH: [6.5, 7.0, 7.2, 6.8, 7.3, 7.5]
          },
          distanceMatrix: [
            [0, 0.15, 0.20, 0.55, 0.58, 0.62],
            [0.15, 0, 0.18, 0.52, 0.55, 0.60],
            [0.20, 0.18, 0, 0.54, 0.57, 0.61],
            [0.55, 0.52, 0.54, 0, 0.16, 0.20],
            [0.58, 0.55, 0.57, 0.16, 0, 0.18],
            [0.62, 0.60, 0.61, 0.20, 0.18, 0]
          ],
          desc: '📈 协变量分析 - 控制 pH 后检验 Treatment 效应（排除 pH 的混杂影响）'
        },
        
        // 嵌套设计
        nested: {
          formula: 'Site + Site:Treatment',
          sampleData: {
            Site: ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'C'],
            Treatment: ['Control', 'Drug', 'Control', 'Drug', 'Control', 'Drug', 'Control', 'Drug', 'Control', 'Drug', 'Control', 'Drug']
          },
          distanceMatrix: [
            [0, 0.35, 0.15, 0.38, 0.55, 0.58, 0.60, 0.62, 0.70, 0.72, 0.74, 0.75],
            [0.35, 0, 0.36, 0.18, 0.56, 0.59, 0.61, 0.63, 0.71, 0.73, 0.75, 0.76],
            [0.15, 0.36, 0, 0.37, 0.54, 0.57, 0.59, 0.61, 0.69, 0.71, 0.73, 0.74],
            [0.38, 0.18, 0.37, 0, 0.57, 0.60, 0.62, 0.64, 0.72, 0.74, 0.76, 0.77],
            [0.55, 0.56, 0.54, 0.57, 0, 0.32, 0.14, 0.35, 0.58, 0.60, 0.62, 0.63],
            [0.58, 0.59, 0.57, 0.60, 0.32, 0, 0.33, 0.16, 0.59, 0.61, 0.63, 0.64],
            [0.60, 0.61, 0.59, 0.62, 0.14, 0.33, 0, 0.34, 0.57, 0.59, 0.61, 0.62],
            [0.62, 0.63, 0.61, 0.64, 0.35, 0.16, 0.34, 0, 0.58, 0.60, 0.62, 0.63],
            [0.70, 0.71, 0.69, 0.72, 0.58, 0.59, 0.57, 0.58, 0, 0.30, 0.13, 0.32],
            [0.72, 0.73, 0.71, 0.74, 0.60, 0.61, 0.59, 0.60, 0.30, 0, 0.31, 0.15],
            [0.74, 0.75, 0.73, 0.76, 0.62, 0.63, 0.61, 0.62, 0.13, 0.31, 0, 0.33],
            [0.75, 0.76, 0.74, 0.77, 0.63, 0.64, 0.62, 0.63, 0.32, 0.15, 0.33, 0]
          ],
          desc: '🗂️ 嵌套设计 - Site 内的 Treatment 效应（Treatment 嵌套在 Site 中）'
        },
        
        // 完全模型
        fullModel: {
          formula: 'Treatment * pH + Site',
          sampleData: {
            Treatment: ['Control', 'Control', 'Drug', 'Drug', 'Control', 'Control', 'Drug', 'Drug'],
            pH: [6.5, 7.5, 6.5, 7.5, 6.5, 7.5, 6.5, 7.5],
            Site: ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B']
          },
          distanceMatrix: [
            [0, 0.15, 0.45, 0.50, 0.55, 0.58, 0.62, 0.65],
            [0.15, 0, 0.48, 0.52, 0.56, 0.59, 0.63, 0.66],
            [0.45, 0.48, 0, 0.18, 0.58, 0.60, 0.64, 0.67],
            [0.50, 0.52, 0.18, 0, 0.59, 0.61, 0.65, 0.68],
            [0.55, 0.56, 0.58, 0.59, 0, 0.16, 0.46, 0.51],
            [0.58, 0.59, 0.60, 0.61, 0.16, 0, 0.48, 0.53],
            [0.62, 0.63, 0.64, 0.65, 0.46, 0.48, 0, 0.19],
            [0.65, 0.66, 0.67, 0.68, 0.51, 0.53, 0.19, 0]
          ],
          desc: '🎯 完全模型 - 主效应 + 交互效应 + 区组效应（最全面的分析）'
        },
        
        // 微生物组研究
        microbiome: {
          formula: 'Disease + Age + BMI + Gender',
          sampleData: {
            Disease: ['Healthy', 'Healthy', 'Healthy', 'Healthy', 'Patient', 'Patient', 'Patient', 'Patient'],
            Age: [25, 30, 28, 32, 35, 40, 38, 42],
            BMI: [22, 24, 23, 25, 28, 30, 29, 31],
            Gender: ['M', 'F', 'M', 'F', 'M', 'F', 'M', 'F']
          },
          distanceMatrix: [
            [0, 0.12, 0.15, 0.18, 0.55, 0.58, 0.60, 0.62],
            [0.12, 0, 0.14, 0.16, 0.52, 0.55, 0.58, 0.60],
            [0.15, 0.14, 0, 0.17, 0.54, 0.57, 0.59, 0.61],
            [0.18, 0.16, 0.17, 0, 0.56, 0.58, 0.60, 0.63],
            [0.55, 0.52, 0.54, 0.56, 0, 0.15, 0.18, 0.20],
            [0.58, 0.55, 0.57, 0.58, 0.15, 0, 0.16, 0.19],
            [0.60, 0.58, 0.59, 0.60, 0.18, 0.16, 0, 0.17],
            [0.62, 0.60, 0.61, 0.63, 0.20, 0.19, 0.17, 0]
          ],
          desc: '🦠 微生物组研究 - 检验疾病状态对肠道菌群的影响（控制年龄、BMI、性别）'
        },
        
        // ==================== 农业科学方向 ====================
        
        // 作物品种比较
        cropVariety: {
          formula: 'Variety + Fertilizer + Irrigation',
          sampleData: {
            Variety: ['V1', 'V1', 'V2', 'V2', 'V3', 'V3'],
            Fertilizer: ['Low', 'High', 'Low', 'High', 'Low', 'High'],
            Irrigation: [100, 150, 100, 150, 100, 150]
          },
          distanceMatrix: [
            [0, 0.18, 0.35, 0.40, 0.52, 0.58],
            [0.18, 0, 0.38, 0.42, 0.55, 0.60],
            [0.35, 0.38, 0, 0.20, 0.45, 0.50],
            [0.40, 0.42, 0.20, 0, 0.48, 0.52],
            [0.52, 0.55, 0.45, 0.48, 0, 0.22],
            [0.58, 0.60, 0.50, 0.52, 0.22, 0]
          ],
          desc: '🌾 作物品种比较 - 检验品种、施肥、灌溉对土壤微生物群落的影响'
        },
        
        // 土壤类型分析
        soilType: {
          formula: 'SoilType + pH',
          sampleData: {
            SoilType: ['Clay', 'Clay', 'Clay', 'Clay', 'Sand', 'Sand', 'Sand', 'Sand', 'Loam', 'Loam', 'Loam', 'Loam'],
            pH: [6.5, 6.8, 6.6, 6.9, 7.2, 7.5, 7.3, 7.6, 6.9, 7.1, 7.0, 7.2]
          },
          distanceMatrix: [
            [0, 0.12, 0.15, 0.18, 0.45, 0.48, 0.50, 0.52, 0.35, 0.38, 0.40, 0.42],
            [0.12, 0, 0.14, 0.16, 0.46, 0.49, 0.51, 0.53, 0.36, 0.39, 0.41, 0.43],
            [0.15, 0.14, 0, 0.13, 0.47, 0.50, 0.52, 0.54, 0.37, 0.40, 0.42, 0.44],
            [0.18, 0.16, 0.13, 0, 0.48, 0.51, 0.53, 0.55, 0.38, 0.41, 0.43, 0.45],
            [0.45, 0.46, 0.47, 0.48, 0, 0.14, 0.16, 0.18, 0.50, 0.52, 0.54, 0.56],
            [0.48, 0.49, 0.50, 0.51, 0.14, 0, 0.15, 0.17, 0.51, 0.53, 0.55, 0.57],
            [0.50, 0.51, 0.52, 0.53, 0.16, 0.15, 0, 0.14, 0.52, 0.54, 0.56, 0.58],
            [0.52, 0.53, 0.54, 0.55, 0.18, 0.17, 0.14, 0, 0.53, 0.55, 0.57, 0.59],
            [0.35, 0.36, 0.37, 0.38, 0.50, 0.51, 0.52, 0.53, 0, 0.13, 0.15, 0.17],
            [0.38, 0.39, 0.40, 0.41, 0.52, 0.53, 0.54, 0.55, 0.13, 0, 0.14, 0.16],
            [0.40, 0.41, 0.42, 0.43, 0.54, 0.55, 0.56, 0.57, 0.15, 0.14, 0, 0.13],
            [0.42, 0.43, 0.44, 0.45, 0.56, 0.57, 0.58, 0.59, 0.17, 0.16, 0.13, 0]
          ],
          desc: '🟤 土壤类型分析 - 检验土壤类型、pH 对微生物群落的影响（12 样本，2 变量）'
        },
        
        // ==================== 海洋/渔业科学方向 ====================
        
        // 鱼类群落分析
        fishCommunity: {
          formula: 'Station + Depth + Temperature + Salinity',
          sampleData: {
            Station: ['A', 'A', 'B', 'B', 'C', 'C'],
            Depth: [10, 50, 10, 50, 10, 50],
            Temperature: [22, 18, 23, 19, 21, 17],
            Salinity: [32, 34, 33, 35, 31, 33]
          },
          distanceMatrix: [
            [0, 0.25, 0.40, 0.48, 0.35, 0.42],
            [0.25, 0, 0.45, 0.52, 0.40, 0.47],
            [0.40, 0.45, 0, 0.28, 0.48, 0.55],
            [0.48, 0.52, 0.28, 0, 0.52, 0.58],
            [0.35, 0.40, 0.48, 0.52, 0, 0.30],
            [0.42, 0.47, 0.55, 0.58, 0.30, 0]
          ],
          desc: '🐟 鱼类群落分析 - 检验站位、水深、环境因子对鱼类群落结构的影响'
        },
        
        // 浮游生物研究
        plankton: {
          formula: 'Season',
          sampleData: {
            Season: ['Spring', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Autumn']
          },
          distanceMatrix: [
            [0, 0.12, 0.15, 0.18, 0.45, 0.48, 0.50, 0.52, 0.35, 0.38, 0.40, 0.42],
            [0.12, 0, 0.14, 0.16, 0.46, 0.49, 0.51, 0.53, 0.36, 0.39, 0.41, 0.43],
            [0.15, 0.14, 0, 0.13, 0.47, 0.50, 0.52, 0.54, 0.37, 0.40, 0.42, 0.44],
            [0.18, 0.16, 0.13, 0, 0.48, 0.51, 0.53, 0.55, 0.38, 0.41, 0.43, 0.45],
            [0.45, 0.46, 0.47, 0.48, 0, 0.14, 0.16, 0.18, 0.50, 0.52, 0.54, 0.56],
            [0.48, 0.49, 0.50, 0.51, 0.14, 0, 0.15, 0.17, 0.51, 0.53, 0.55, 0.57],
            [0.50, 0.51, 0.52, 0.53, 0.16, 0.15, 0, 0.14, 0.52, 0.54, 0.56, 0.58],
            [0.52, 0.53, 0.54, 0.55, 0.18, 0.17, 0.14, 0, 0.53, 0.55, 0.57, 0.59],
            [0.35, 0.36, 0.37, 0.38, 0.50, 0.51, 0.52, 0.53, 0, 0.13, 0.15, 0.17],
            [0.38, 0.39, 0.40, 0.41, 0.52, 0.53, 0.54, 0.55, 0.13, 0, 0.14, 0.16],
            [0.40, 0.41, 0.42, 0.43, 0.54, 0.55, 0.56, 0.57, 0.15, 0.14, 0, 0.13],
            [0.42, 0.43, 0.44, 0.45, 0.56, 0.57, 0.58, 0.59, 0.17, 0.16, 0.13, 0]
          ],
          desc: '🦠 浮游生物研究 - 检验季节对浮游生物群落的影响（12 样本，1 变量）'
        },
        
        // ==================== 植物科学方向 ====================
        
        // 植物群落调查
        plantCommunity: {
          formula: 'Habitat',
          sampleData: {
            Habitat: ['Forest', 'Forest', 'Forest', 'Forest', 'Grassland', 'Grassland', 'Grassland', 'Grassland', 'Wetland', 'Wetland', 'Wetland', 'Wetland']
          },
          distanceMatrix: [
            [0, 0.12, 0.15, 0.18, 0.48, 0.50, 0.52, 0.54, 0.35, 0.38, 0.40, 0.42],
            [0.12, 0, 0.14, 0.16, 0.49, 0.51, 0.53, 0.55, 0.36, 0.39, 0.41, 0.43],
            [0.15, 0.14, 0, 0.13, 0.50, 0.52, 0.54, 0.56, 0.37, 0.40, 0.42, 0.44],
            [0.18, 0.16, 0.13, 0, 0.51, 0.53, 0.55, 0.57, 0.38, 0.41, 0.43, 0.45],
            [0.48, 0.49, 0.50, 0.51, 0, 0.14, 0.16, 0.18, 0.52, 0.54, 0.56, 0.58],
            [0.49, 0.51, 0.52, 0.53, 0.14, 0, 0.15, 0.17, 0.53, 0.55, 0.57, 0.59],
            [0.50, 0.52, 0.53, 0.54, 0.15, 0.16, 0, 0.14, 0.54, 0.56, 0.58, 0.60],
            [0.51, 0.53, 0.54, 0.55, 0.17, 0.15, 0.14, 0, 0.55, 0.57, 0.59, 0.61],
            [0.35, 0.36, 0.37, 0.38, 0.52, 0.53, 0.54, 0.55, 0, 0.13, 0.15, 0.17],
            [0.38, 0.39, 0.40, 0.41, 0.54, 0.55, 0.56, 0.57, 0.13, 0, 0.14, 0.16],
            [0.40, 0.41, 0.42, 0.43, 0.56, 0.57, 0.58, 0.59, 0.15, 0.14, 0, 0.13],
            [0.42, 0.43, 0.44, 0.45, 0.58, 0.59, 0.60, 0.61, 0.17, 0.16, 0.13, 0]
          ],
          desc: '🌿 植物群落调查 - 检验生境对植物群落组成的影响（12 样本，1 变量）'
        },
        
        // 入侵物种影响
        invasiveSpecies: {
          formula: 'InvasionLevel + NativeDiversity + Disturbance',
          sampleData: {
            InvasionLevel: ['Low', 'Medium', 'High', 'Low', 'Medium', 'High'],
            NativeDiversity: [25, 18, 10, 28, 20, 12],
            Disturbance: [1, 3, 5, 2, 4, 5]
          },
          distanceMatrix: [
            [0, 0.28, 0.55, 0.15, 0.30, 0.58],
            [0.28, 0, 0.45, 0.30, 0.18, 0.50],
            [0.55, 0.45, 0, 0.58, 0.52, 0.35],
            [0.15, 0.30, 0.58, 0, 0.32, 0.60],
            [0.30, 0.18, 0.52, 0.32, 0, 0.48],
            [0.58, 0.50, 0.35, 0.60, 0.48, 0]
          ],
          desc: '🌾 入侵物种影响 - 检验入侵程度、本地多样性、干扰对群落的影响'
        },
        
        // ==================== 基因组学/转录组学方向 ====================
        
        // 基因表达谱
        geneExpression: {
          formula: 'Tissue + Treatment + Time',
          sampleData: {
            Tissue: ['Liver', 'Liver', 'Kidney', 'Kidney', 'Heart', 'Heart'],
            Treatment: ['Control', 'Drug', 'Control', 'Drug', 'Control', 'Drug'],
            Time: [6, 6, 12, 12, 24, 24]
          },
          distanceMatrix: [
            [0, 0.35, 0.55, 0.58, 0.60, 0.62],
            [0.35, 0, 0.58, 0.60, 0.62, 0.64],
            [0.55, 0.58, 0, 0.32, 0.58, 0.60],
            [0.58, 0.60, 0.32, 0, 0.60, 0.62],
            [0.60, 0.62, 0.58, 0.60, 0, 0.30],
            [0.62, 0.64, 0.60, 0.62, 0.30, 0]
          ],
          desc: '🧬 基因表达谱 - 检验组织类型、处理、时间对基因表达模式的影响'
        },
        
        // 单细胞分析
        singleCell: {
          formula: 'CellType + Batch + Donor',
          sampleData: {
            CellType: ['T_cell', 'B_cell', 'T_cell', 'B_cell', 'NK_cell', 'NK_cell'],
            Batch: ['Batch1', 'Batch1', 'Batch2', 'Batch2', 'Batch1', 'Batch2'],
            Donor: ['D1', 'D1', 'D2', 'D2', 'D1', 'D2']
          },
          distanceMatrix: [
            [0, 0.40, 0.25, 0.45, 0.50, 0.52],
            [0.40, 0, 0.48, 0.28, 0.55, 0.57],
            [0.25, 0.48, 0, 0.50, 0.52, 0.55],
            [0.45, 0.28, 0.50, 0, 0.57, 0.58],
            [0.50, 0.55, 0.52, 0.57, 0, 0.30],
            [0.52, 0.57, 0.55, 0.58, 0.30, 0]
          ],
          desc: '🔬 单细胞分析 - 检验细胞类型、批次、供体对转录组的影响（批次效应校正）'
        },
        
        // ==================== 食品科学方向 ====================
        
        // 发酵过程监控
        fermentation: {
          formula: 'TimePoint',
          sampleData: {
            TimePoint: ['Day0', 'Day0', 'Day0', 'Day0', 'Day7', 'Day7', 'Day7', 'Day7', 'Day14', 'Day14', 'Day14', 'Day14']
          },
          distanceMatrix: [
            [0, 0.12, 0.15, 0.18, 0.35, 0.38, 0.40, 0.42, 0.55, 0.58, 0.60, 0.62],
            [0.12, 0, 0.14, 0.16, 0.36, 0.39, 0.41, 0.43, 0.56, 0.59, 0.61, 0.63],
            [0.15, 0.14, 0, 0.13, 0.37, 0.40, 0.42, 0.44, 0.57, 0.60, 0.62, 0.64],
            [0.18, 0.16, 0.13, 0, 0.38, 0.41, 0.43, 0.45, 0.58, 0.61, 0.63, 0.65],
            [0.35, 0.36, 0.37, 0.38, 0, 0.14, 0.16, 0.18, 0.50, 0.52, 0.54, 0.56],
            [0.38, 0.39, 0.40, 0.41, 0.14, 0, 0.15, 0.17, 0.51, 0.53, 0.55, 0.57],
            [0.40, 0.41, 0.42, 0.43, 0.16, 0.15, 0, 0.14, 0.52, 0.54, 0.56, 0.58],
            [0.42, 0.43, 0.44, 0.45, 0.18, 0.17, 0.14, 0, 0.53, 0.55, 0.57, 0.59],
            [0.55, 0.56, 0.57, 0.58, 0.50, 0.51, 0.52, 0.53, 0, 0.13, 0.15, 0.17],
            [0.58, 0.59, 0.60, 0.61, 0.52, 0.53, 0.54, 0.55, 0.13, 0, 0.14, 0.16],
            [0.60, 0.61, 0.62, 0.63, 0.54, 0.55, 0.56, 0.57, 0.15, 0.14, 0, 0.13],
            [0.62, 0.63, 0.64, 0.65, 0.56, 0.57, 0.58, 0.59, 0.17, 0.16, 0.13, 0]
          ],
          desc: '🍶 发酵过程监控 - 检验时间点对微生物群落演替的影响（12 样本，1 变量）'
        },
        
        // 食品产地溯源
        foodOrigin: {
          formula: 'Origin + Variety + HarvestYear',
          sampleData: {
            Origin: ['Region_A', 'Region_A', 'Region_B', 'Region_B', 'Region_C', 'Region_C'],
            Variety: ['V1', 'V2', 'V1', 'V2', 'V1', 'V2'],
            HarvestYear: [2022, 2022, 2023, 2023, 2022, 2023]
          },
          distanceMatrix: [
            [0, 0.25, 0.45, 0.48, 0.55, 0.58],
            [0.25, 0, 0.48, 0.50, 0.58, 0.60],
            [0.45, 0.48, 0, 0.22, 0.50, 0.52],
            [0.48, 0.50, 0.22, 0, 0.52, 0.55],
            [0.55, 0.58, 0.50, 0.52, 0, 0.28],
            [0.58, 0.60, 0.52, 0.55, 0.28, 0]
          ],
          desc: '🍷 食品产地溯源 - 检验产地、品种、年份对微生物/代谢物谱的影响'
        },
        
        // ==================== 临床医学方向 ====================
        
        // 疾病亚型分类
        diseaseSubtype: {
          formula: 'DiseaseType + Stage + Age + Gender',
          sampleData: {
            DiseaseType: ['TypeA', 'TypeA', 'TypeB', 'TypeB', 'TypeC', 'TypeC'],
            Stage: ['Early', 'Late', 'Early', 'Late', 'Early', 'Late'],
            Age: [45, 58, 52, 65, 48, 60],
            Gender: ['M', 'F', 'M', 'F', 'M', 'F']
          },
          distanceMatrix: [
            [0, 0.28, 0.50, 0.55, 0.52, 0.58],
            [0.28, 0, 0.52, 0.58, 0.55, 0.60],
            [0.50, 0.52, 0, 0.30, 0.55, 0.60],
            [0.55, 0.58, 0.30, 0, 0.58, 0.62],
            [0.52, 0.55, 0.55, 0.58, 0, 0.32],
            [0.58, 0.60, 0.60, 0.62, 0.32, 0]
          ],
          desc: '🏥 疾病亚型分类 - 检验疾病类型、分期、人口学特征对生物标志物的影响'
        },
        
        // 治疗效果评估
        treatmentEffect: {
          formula: 'Group + TimePoint + Baseline',
          sampleData: {
            Group: ['Placebo', 'Placebo', 'LowDose', 'LowDose', 'HighDose', 'HighDose'],
            TimePoint: ['Week0', 'Week12', 'Week0', 'Week12', 'Week0', 'Week12'],
            Baseline: [100, 100, 105, 105, 98, 98]
          },
          distanceMatrix: [
            [0, 0.15, 0.35, 0.45, 0.40, 0.50],
            [0.15, 0, 0.38, 0.48, 0.42, 0.52],
            [0.35, 0.38, 0, 0.20, 0.45, 0.55],
            [0.45, 0.48, 0.20, 0, 0.48, 0.58],
            [0.40, 0.42, 0.45, 0.48, 0, 0.25],
            [0.50, 0.52, 0.55, 0.58, 0.25, 0]
          ],
          desc: '💊 治疗效果评估 - 检验处理组、时间点、基线值对疗效指标的影响'
        },
        
        // ==================== 神经科学方向 ====================
        
        // 脑区连接分析
        brainConnectivity: {
          formula: 'Region + Task + AgeGroup',
          sampleData: {
            Region: ['Frontal', 'Parietal', 'Temporal', 'Occipital', 'Frontal', 'Parietal'],
            Task: ['Rest', 'Rest', 'Rest', 'Rest', 'Task', 'Task'],
            AgeGroup: ['Young', 'Young', 'Young', 'Young', 'Old', 'Old']
          },
          distanceMatrix: [
            [0, 0.25, 0.30, 0.35, 0.45, 0.48],
            [0.25, 0, 0.28, 0.32, 0.48, 0.50],
            [0.30, 0.28, 0, 0.30, 0.50, 0.52],
            [0.35, 0.32, 0.30, 0, 0.52, 0.55],
            [0.45, 0.48, 0.50, 0.52, 0, 0.28],
            [0.48, 0.50, 0.52, 0.55, 0.28, 0]
          ],
          desc: '🧠 脑区连接分析 - 检验脑区、任务状态、年龄组对功能连接的影响'
        },
        
        // ==================== 林业科学方向 ====================
        
        // 森林群落结构
        forestCommunity: {
          formula: 'ForestType + Age + DBH + CanopyCover',
          sampleData: {
            ForestType: ['Conifer', 'Conifer', 'Broadleaf', 'Broadleaf', 'Mixed', 'Mixed'],
            Age: [50, 80, 50, 80, 50, 80],
            DBH: [25, 40, 30, 45, 28, 42],
            CanopyCover: [70, 85, 75, 90, 72, 88]
          },
          distanceMatrix: [
            [0, 0.22, 0.42, 0.48, 0.38, 0.45],
            [0.22, 0, 0.45, 0.50, 0.42, 0.48],
            [0.42, 0.45, 0, 0.25, 0.48, 0.52],
            [0.48, 0.50, 0.25, 0, 0.50, 0.55],
            [0.38, 0.42, 0.48, 0.50, 0, 0.28],
            [0.45, 0.48, 0.52, 0.55, 0.28, 0]
          ],
          desc: '🌲 森林群落结构 - 检验林型、树龄、胸径、郁闭度对林下植物群落的影响'
        },
        
        // ==================== 昆虫学方向 ====================
        
        // 昆虫群落调查
        insectCommunity: {
          formula: 'Habitat + Month + Temperature + Humidity',
          sampleData: {
            Habitat: ['Forest', 'Meadow', 'Forest', 'Meadow', 'Wetland', 'Wetland'],
            Month: [5, 5, 6, 6, 5, 6],
            Temperature: [20, 22, 25, 27, 21, 26],
            Humidity: [65, 55, 70, 60, 75, 80]
          },
          distanceMatrix: [
            [0, 0.38, 0.25, 0.42, 0.45, 0.50],
            [0.38, 0, 0.45, 0.28, 0.52, 0.55],
            [0.25, 0.45, 0, 0.40, 0.42, 0.48],
            [0.42, 0.28, 0.40, 0, 0.50, 0.52],
            [0.45, 0.52, 0.42, 0.50, 0, 0.30],
            [0.50, 0.55, 0.48, 0.52, 0.30, 0]
          ],
          desc: '🦋 昆虫群落调查 - 检验生境、月份、气象因子对昆虫群落组成的影响'
        },
        
        // ==================== 景观生态学方向 ====================
        
        // 土地利用变化
        landUse: {
          formula: 'LandUseType + Fragmentation + EdgeDensity',
          sampleData: {
            LandUseType: ['Urban', 'Agricultural', 'Forest', 'Urban', 'Agricultural', 'Forest'],
            Fragmentation: [0.8, 0.6, 0.3, 0.75, 0.65, 0.35],
            EdgeDensity: [150, 100, 50, 140, 110, 55]
          },
          distanceMatrix: [
            [0, 0.35, 0.55, 0.18, 0.38, 0.58],
            [0.35, 0, 0.58, 0.40, 0.20, 0.60],
            [0.55, 0.58, 0, 0.58, 0.60, 0.25],
            [0.18, 0.40, 0.58, 0, 0.42, 0.60],
            [0.38, 0.20, 0.60, 0.42, 0, 0.62],
            [0.58, 0.60, 0.25, 0.60, 0.62, 0]
          ],
          desc: '🏞️ 土地利用变化 - 检验土地利用类型、破碎化、边缘密度对生物群落的影响'
        },
        
        // ==================== 保护生物学方向 ====================
        
        // 保护区评估
        protectedArea: {
          formula: 'ProtectionLevel',
          sampleData: {
            ProtectionLevel: ['High', 'High', 'High', 'High', 'Medium', 'Medium', 'Medium', 'Medium', 'Low', 'Low', 'Low', 'Low']
          },
          distanceMatrix: [
            [0, 0.12, 0.15, 0.18, 0.35, 0.38, 0.40, 0.42, 0.55, 0.58, 0.60, 0.62],
            [0.12, 0, 0.14, 0.16, 0.36, 0.39, 0.41, 0.43, 0.56, 0.59, 0.61, 0.63],
            [0.15, 0.14, 0, 0.13, 0.37, 0.40, 0.42, 0.44, 0.57, 0.60, 0.62, 0.64],
            [0.18, 0.16, 0.13, 0, 0.38, 0.41, 0.43, 0.45, 0.58, 0.61, 0.63, 0.65],
            [0.35, 0.36, 0.37, 0.38, 0, 0.14, 0.16, 0.18, 0.50, 0.52, 0.54, 0.56],
            [0.38, 0.39, 0.40, 0.41, 0.14, 0, 0.15, 0.17, 0.51, 0.53, 0.55, 0.57],
            [0.40, 0.41, 0.42, 0.43, 0.16, 0.15, 0, 0.14, 0.52, 0.54, 0.56, 0.58],
            [0.42, 0.43, 0.44, 0.45, 0.18, 0.17, 0.14, 0, 0.53, 0.55, 0.57, 0.59],
            [0.55, 0.56, 0.57, 0.58, 0.50, 0.51, 0.52, 0.53, 0, 0.13, 0.15, 0.17],
            [0.58, 0.59, 0.60, 0.61, 0.52, 0.53, 0.54, 0.55, 0.13, 0, 0.14, 0.16],
            [0.60, 0.61, 0.62, 0.63, 0.54, 0.55, 0.56, 0.57, 0.15, 0.14, 0, 0.13],
            [0.62, 0.63, 0.64, 0.65, 0.56, 0.57, 0.58, 0.59, 0.17, 0.16, 0.13, 0]
          ],
          desc: '🛡️ 保护区评估 - 检验保护级别对物种多样性的影响（12 样本，1 变量）'
        },
        
        // ==================== 气候变化研究方向 ====================
        
        // 气候变化响应
        climateChange: {
          formula: 'Treatment + Year + CO2 + Temperature',
          sampleData: {
            Treatment: ['Control', 'Warming', 'CO2_enrichment', 'Combined', 'Control', 'Warming'],
            Year: [2020, 2020, 2020, 2020, 2021, 2021],
            CO2: [400, 400, 550, 550, 410, 410],
            Temperature: [20, 23, 20, 23, 20, 23]
          },
          distanceMatrix: [
            [0, 0.30, 0.35, 0.50, 0.15, 0.32],
            [0.30, 0, 0.45, 0.55, 0.35, 0.18],
            [0.35, 0.45, 0, 0.40, 0.38, 0.48],
            [0.50, 0.55, 0.40, 0, 0.55, 0.60],
            [0.15, 0.35, 0.38, 0.55, 0, 0.35],
            [0.32, 0.18, 0.48, 0.60, 0.35, 0]
          ],
          desc: '🌡️ 气候变化响应 - 检验增温、CO2 富集及其交互作用对生态系统的影响'
        }
      };
      
      const template = templates[templateName];
      if (!template) {
        alert('模板不存在：' + templateName);
        return;
      }
      
      // 填充数据
      this.permanovaParams.formula = template.formula;
      this.permanovaParams.sampleDataStr = JSON.stringify(template.sampleData, null, 2);
      this.permanovaParams.distanceMatrixStr = JSON.stringify(template.distanceMatrix, null, 2);
      
      // 触发验证
      this.validateDistanceMatrix();
      
      // 设置当前选中的模板
      this.permanovaParams.selectedTemplate = templateName;
      
      // 显示提示信息
      this.showMessage('success', template.desc);
    },
    
    async runPERMANOVA() {
      this.loading = true;
      this.analysisResult = null;
      
      try {
        // 验证距离矩阵
        this.validateDistanceMatrix();
        if (!this.permanovaParams.matrixValid) {
          alert('距离矩阵无效，请检查输入');
          this.loading = false;
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
            alert('样本数据无效，请检查输入\n' + (this.permanovaParams.sampleDataError || ''));
            this.loading = false;
            return;
          }
          params.sampleData = this.permanovaParams.sampleData;
          params.formula = this.permanovaParams.formula || 'Treatment';
        }
        
        console.log('[RAnalysis] Calling runPERMANOVA API...');
        const result = await runPERMANOVA(params);
        console.log('[RAnalysis] PERMANOVA result:', result);
        
        this.analysisResult = result;
        
        // 如果有结果，绘制图表
        if (result.permanova_result) {
          this.$nextTick(() => {
            this.renderPCoAChart(result);
          });
        }
      } catch (error) {
        console.error('[RAnalysis] PERMANOVA error:', error);
        alert('PERMANOVA 分析失败：' + error.message + '\n\n请查看控制台日志 (F12) 获取详细信息');
      } finally {
        this.loading = false;
      }
    },
    
    async runGMR4() {
      this.loading = true;
      this.analysisResult = null;
      
      try {
        const params = {
          ...this.gmr4Params,
          X: JSON.parse(this.gmr4Params.X),
          Y: JSON.parse(this.gmr4Params.Y)
        };
        
        const result = await runGMR4(params);
        this.analysisResult = result;
      } catch (error) {
        alert('GMR⁴ 分析失败：' + error.message);
      } finally {
        this.loading = false;
      }
    },
    
    async renderPCoAChart(result) {
      // 使用 ECharts 绘制 PCoA 图
      const chartContainer = this.$refs.pcoaChart;
      if (!chartContainer) return;
      
      // 动态导入 ECharts
      const echarts = await import('echarts');
      const myChart = echarts.init(chartContainer);
      
      // 从 PERMANOVA 结果中提取数据
      // 注意：实际的 PCoA 需要从距离矩阵进行坐标转换
      // 这里使用示例数据展示图表框架
      
      try {
        // 如果有距离矩阵，可以进行 PCoA 计算
        // 这里先展示一个简单的结果可视化
        const permanovaData = result.permanova_result || [];
        const modelData = permanovaData.find(row => row._row === 'Model');
        const residualData = permanovaData.find(row => row._row === 'Residual');
        
        // 创建柱状图展示方差分解
        const option = {
          title: {
            text: 'PERMANOVA 方差分解',
            left: 'center'
          },
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'shadow'
            }
          },
          legend: {
            data: ['SumOfSqs', 'R²'],
            top: '10%'
          },
          grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            data: ['Model', 'Residual', 'Total'],
            name: '来源'
          },
          yAxis: {
            type: 'value',
            name: '值'
          },
          series: [
            {
              name: 'SumOfSqs',
              type: 'bar',
              data: [
                modelData ? modelData.SumOfSqs : 0,
                residualData ? residualData.SumOfSqs : 0,
                permanovaData.find(r => r._row === 'Total')?.SumOfSqs || 0
              ],
              itemStyle: {
                color: '#5470c6'
              }
            },
            {
              name: 'R²',
              type: 'bar',
              data: [
                modelData ? modelData.R2 : 0,
                residualData ? residualData.R2 : 0,
                permanovaData.find(r => r._row === 'Total')?.R2 || 0
              ],
              itemStyle: {
                color: '#91cc75'
              }
            }
          ]
        };
        
        myChart.setOption(option);
        
        // 窗口大小改变时重新调整图表
        window.addEventListener('resize', () => {
          myChart.resize();
        });
        
      } catch (error) {
        console.error('PCoA 图表绘制失败:', error);
      }
    },
    
    // 切换模板折叠状态
    toggleTemplateCollapse() {
      this.permanovaParams.templateCollapsed = !this.permanovaParams.templateCollapsed;
    },
    
    // 清除选中的模板
    clearSelectedTemplate() {
      this.permanovaParams.selectedTemplate = '';
    },
    
    // 获取模板名称
    getTemplateName(templateName) {
      const names = {
        singleFactor: '单因素分析',
        multiFactor: '多因素分析',
        interaction: '交互作用',
        ancova: '协变量分析',
        nested: '嵌套设计',
        fullModel: '完全模型',
        microbiome: '微生物组',
        timeSeries: '时间序列',
        spatial: '空间分析',
        temperatureGradient: '温度梯度',
        doseResponse: '剂量反应',
        repeatedMeasures: '重复测量',
        blockDesign: '区组设计',
        environmental: '环境因子',
        cropVariety: '作物品种',
        soilType: '土壤分析',
        plantCommunity: '植物群落',
        invasiveSpecies: '入侵物种',
        forestCommunity: '森林群落',
        landUse: '土地利用',
        protectedArea: '保护区评估',
        climateChange: '气候变化',
        fishCommunity: '鱼类群落',
        plankton: '浮游生物',
        insectCommunity: '昆虫群落',
        geneExpression: '基因表达',
        singleCell: '单细胞分析',
        diseaseSubtype: '疾病亚型',
        treatmentEffect: '治疗效果',
        brainConnectivity: '脑连接',
        fermentation: '发酵监控',
        foodOrigin: '产地溯源'
      };
      return names[templateName] || templateName;
    },
    
    // 获取模板公式
    getTemplateFormula(templateName) {
      const template = this.getTemplateByName(templateName);
      return template ? template.formula : '';
    },
    
    // 根据名称获取模板
    getTemplateByName(templateName) {
      const templates = {
        singleFactor: { formula: 'Treatment' },
        multiFactor: { formula: 'Treatment + Age + BMI' },
        interaction: { formula: 'Treatment * pH' },
        ancova: { formula: 'Treatment + pH' },
        nested: { formula: 'Site + Site:Treatment' },
        fullModel: { formula: 'Treatment * pH + Site' },
        microbiome: { formula: 'Disease + Age + BMI + Gender' },
        timeSeries: { formula: 'Time + Treatment' },
        spatial: { formula: 'Location + Depth + Temperature' },
        temperatureGradient: { formula: 'Temperature + pH + Conductivity' },
        doseResponse: { formula: 'Dose' },
        repeatedMeasures: { formula: 'Subject + Time + Treatment' },
        blockDesign: { formula: 'Block + Treatment' },
        environmental: { formula: 'Salinity + DO + Turbidity + Nutrients' },
        cropVariety: { formula: 'Variety + Fertilizer + Irrigation' },
        soilType: { formula: 'SoilType + pH' },
        plantCommunity: { formula: 'Habitat' },
        invasiveSpecies: { formula: 'InvasionLevel + NativeDiversity + Disturbance' },
        forestCommunity: { formula: 'ForestType + Age + DBH + CanopyCover' },
        landUse: { formula: 'LandUseType + Fragmentation + EdgeDensity' },
        protectedArea: { formula: 'ProtectionLevel' },
        climateChange: { formula: 'Treatment + Year + CO2 + Temperature' },
        fishCommunity: { formula: 'Station + Depth + Temperature + Salinity' },
        plankton: { formula: 'Season' },
        insectCommunity: { formula: 'Habitat + Month + Temperature + Humidity' },
        geneExpression: { formula: 'Tissue + Treatment + Time' },
        singleCell: { formula: 'CellType + Batch + Donor' },
        diseaseSubtype: { formula: 'DiseaseType + Stage + Age + Gender' },
        treatmentEffect: { formula: 'Group + TimePoint + Baseline' },
        brainConnectivity: { formula: 'Region + Task + AgeGroup' },
        fermentation: { formula: 'TimePoint' },
        foodOrigin: { formula: 'Origin + Variety + HarvestYear' }
      };
      return templates[templateName] || null;
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
    }
  }
};
</script>

<style scoped>
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
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
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

.btn-run:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

.btn-run {
  background: #1890ff;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

.btn-run:hover {
  background: #40a9ff;
}

.result-section {
  margin-top: 30px;
  padding: 20px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 8px;
}

.result-content {
  background: white;
  padding: 16px;
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
  padding: 20px;
  background: white;
  border-radius: 8px;
  border: 1px solid #d9d9d9;
}

.result-chart h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: #333;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: white;
}
</style>
