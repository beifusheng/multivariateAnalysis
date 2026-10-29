<template>
  <div class="home-container">
    <!-- 头部区域 -->
    <header class="hero-section">
      <div class="hero-content">
        <h1 class="app-title">
          <span class="gradient-text">🧬 统计分析平台</span>
        </h1>
        <p class="app-subtitle">基于 Electron + R 的本地统计分析桌面应用</p>
      </div>
    </header>

    <!-- R 环境状态卡片 -->
    <section class="status-section">
      <el-card class="r-status-card" shadow="always">
        <template #header>
          <div class="card-header">
            <div class="card-title-wrapper">
              <span class="card-icon">🔧</span>
              <span class="card-title">R 环境状态</span>
            </div>
            <el-button 
              size="small" 
              @click="checkRStatus" 
              :loading="checkingStatus"
              type="primary"
              round
            >
              <el-icon><Refresh /></el-icon>
              {{ checkingStatus ? '检测中...' : '刷新状态' }}
            </el-button>
          </div>
        </template>
        
        <div class="status-content">
          <div v-if="rAvailable" class="status-success">
            <div class="status-result">
              <div class="status-icon-large success">✅</div>
              <h3 class="status-title">R 环境就绪</h3>
              <p class="status-subtitle">可以开始使用所有分析功能</p>
              <div class="status-info-box">
                <el-tag type="success" effect="dark" size="large">
                  <el-icon><Check /></el-icon>
                  可用
                </el-tag>
                <div class="status-info-row">
                  <span class="info-label">📍 R 路径:</span>
                  <span class="info-value">{{ rPath }}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div v-else class="status-warning">
            <div class="status-result">
              <div class="status-icon-large warning">⚠️</div>
              <h3 class="status-title">R 环境未就绪</h3>
              <p class="status-subtitle">请确保 R 已正确安装到指定目录</p>
              <div class="status-info-box">
                <el-tag type="danger" effect="dark" size="large">
                  <el-icon><Close /></el-icon>
                  不可用
                </el-tag>
                <div class="status-info-row">
                  <span class="info-label">📍 检测路径:</span>
                  <code class="r-path">{{ rPath || 'C:\\Custom\\CodeRepository\\Demo\\electron-egg\\r-portable\\bin\\Rscript.exe' }}</code>
                </div>
                <el-button type="primary" @click="showInstallGuide" size="default">
                  📖 查看 R 安装指南
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </el-card>
    </section>

    <!-- 分析方法选择 -->
    <section class="methods-section">
      <h2 class="section-title">
        <span class="title-icon">📊</span>
        <span>选择分析方法</span>
      </h2>
      
      <div class="method-cards">
        <!-- PERMANOVA -->
        <el-card 
          class="method-card available-card" 
          shadow="hover"
          @click="navigateTo('/r-analysis/permanova')"
        >
          <div class="method-card-content">
            <div class="method-icon">🔬</div>
            <h3 class="method-name">PERMANOVA</h3>
            <p class="method-desc">基于距离矩阵的置换多元方差分析</p>
            <div class="method-tags">
              <el-tag size="small" type="success" effect="dark">✅ 可用</el-tag>
              <el-tag size="small" effect="plain">群落结构</el-tag>
              <el-tag size="small" effect="plain">差异检验</el-tag>
            </div>
          </div>
          <div class="card-action">
            <el-button type="primary" size="small" round>立即使用 →</el-button>
          </div>
        </el-card>

        <!-- PERMANOVA-med -->
        <el-card 
          class="method-card" 
          shadow="hover"
          @click="$router.push('/r-analysis/permanova-med')"
        >
          <div class="method-card-content">
            <div class="method-icon">🧬</div>
            <h3 class="method-name">PERMANOVA-med</h3>
            <p class="method-desc">PERMANOVA 扩展 - 中介分析</p>
            <div class="method-tags">
              <el-tag size="small" type="success" effect="dark">✅ 可用</el-tag>
            </div>
          </div>
        </el-card>

        <!-- GMR⁴ -->
        <el-card 
          class="method-card coming-soon-card" 
          shadow="hover"
          @click="showComingSoon('GMR⁴')"
        >
          <div class="method-card-content">
            <div class="method-icon">📈</div>
            <h3 class="method-name">GMR⁴</h3>
            <p class="method-desc">广义多水平回归模型</p>
            <div class="method-tags">
              <el-tag size="small" type="info" effect="dark">🚧 开发中</el-tag>
            </div>
          </div>
          <div class="ribbon">开发中</div>
        </el-card>

        <!-- Bayesian ERA -->
        <el-card 
          class="method-card coming-soon-card" 
          shadow="hover"
          @click="showComingSoon('Bayesian ERA')"
        >
          <div class="method-card-content">
            <div class="method-icon">🎯</div>
            <h3 class="method-name">Bayesian ERA</h3>
            <p class="method-desc">贝叶斯生态群落分析（含中介）</p>
            <div class="method-tags">
              <el-tag size="small" type="info" effect="dark">🚧 开发中</el-tag>
            </div>
          </div>
          <div class="ribbon">开发中</div>
        </el-card>

        <!-- Non-random PERMANOVA -->
        <el-card 
          class="method-card coming-soon-card" 
          shadow="hover"
          @click="showComingSoon('Non-random PERMANOVA')"
        >
          <div class="method-card-content">
            <div class="method-icon">🎲</div>
            <h3 class="method-name">Non-random PERMANOVA</h3>
            <p class="method-desc">非随机 PERMANOVA 扩展</p>
            <div class="method-tags">
              <el-tag size="small" type="info" effect="dark">🚧 开发中</el-tag>
            </div>
          </div>
          <div class="ribbon">开发中</div>
        </el-card>
      </div>
    </section>

    <!-- 快速指南 -->
    <section class="guide-section">
      <el-card shadow="never" class="guide-card">
        <template #header>
          <span class="guide-title">🚀 快速开始</span>
        </template>
        <el-steps :active="1" finish-status="success" align-center>
          <el-step title="检查 R 环境" description="确保 R 服务状态为可用" />
          <el-step title="选择分析方法" description="点击上方的分析方法卡片" />
          <el-step title="输入数据" description="填写距离矩阵和样本数据" />
          <el-step title="运行分析" description="查看分析结果和可视化图表" />
        </el-steps>
      </el-card>
    </section>
  </div>
</template>

<script>
import { Check, Close, Refresh } from '@element-plus/icons-vue';

export default {
  name: 'Home',
  
  components: {
    Check,
    Close,
    Refresh
  },
  
  data() {
    return {
      rAvailable: false,
      rPath: '',
      rVersion: '',
      checkingStatus: false
    };
  },
  
  mounted() {
    this.checkRStatus();
  },
  
  methods: {
    async checkRStatus() {
      this.checkingStatus = true;
      try {
        console.log('开始检测 R 状态...');
        const result = await window.electron.ipcRenderer.invoke('controller/r/checkR');
        console.log('✅ R 状态检测结果:', result);
        this.rAvailable = result.available;
        this.rPath = result.rPath || 'C:\\Custom\\CodeRepository\\Demo\\electron-egg\\r-portable\\bin\\Rscript.exe';
        this.rVersion = result.message || '';
        
        // 显示提示
        if (result.available) {
          this.$message({
            message: 'R 环境检测成功！可以开始使用分析功能',
            type: 'success',
            duration: 3000
          });
        } else {
          this.$message({
            message: 'R 环境不可用，请检查安装',
            type: 'warning',
            duration: 5000
          });
        }
      } catch (error) {
        console.error('❌ 检查 R 状态失败:', error);
        this.rAvailable = false;
        this.rPath = '检测失败：' + error.message;
        this.$message({
          message: 'R 状态检测失败：' + error.message,
          type: 'error',
          duration: 5000
        });
      } finally {
        this.checkingStatus = false;
      }
    },
    
    navigateTo(path) {
      console.log('导航到:', path);
      this.$router.push(path).catch(err => {
        console.error('导航失败:', err);
        this.$message({
          message: '导航失败：' + err.message,
          type: 'error',
          duration: 3000
        });
      });
    },
    
    showComingSoon(methodName) {
      this.$message({
        message: `${methodName} 功能开发中，敬请期待！`,
        type: 'info',
        duration: 3000,
        showClose: true
      });
    },
    
    showInstallGuide() {
      this.$alert(`
        <div class="install-guide">
          <h3>🔧 R 安装指南</h3>
          
          <div class="guide-step">
            <h4>1️⃣ 下载 R 可移植版本</h4>
            <p>下载地址：<a href="https://cran.r-project.org/bin/windows/base/" target="_blank">CRAN R for Windows</a></p>
          </div>
          
          <div class="guide-step">
            <h4>2️⃣ 安装到指定目录</h4>
            <p>将 R 安装或复制到：</p>
            <code class="r-path">C:\\Custom\\CodeRepository\\Demo\\electron-egg\\r-portable</code>
          </div>
          
          <div class="guide-step">
            <h4>3️⃣ 重启应用</h4>
            <p>安装完成后重启本应用，R 环境将自动检测</p>
          </div>
          
          <div class="guide-tip">
            💡 <strong>提示：</strong>使用可移植版本无需管理员权限，不修改系统环境变量
          </div>
        </div>
      `, 'R 安装指南', {
        dangerouslyUseHTMLString: true,
        confirmButtonText: '我知道了',
        customClass: 'install-guide-dialog'
      });
    }
  }
};
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
}

/* 英雄区域 */
.hero-section {
  text-align: center;
  margin-bottom: 40px;
}

.hero-content {
  max-width: 800px;
  margin: 0 auto;
}

.app-title {
  font-size: 48px;
  font-weight: 800;
  margin: 0 0 16px 0;
  letter-spacing: -1px;
  color: white;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.2);
}

.gradient-text {
  background: linear-gradient(135deg, #fff 0%, #f0f0f0 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.app-subtitle {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
  font-weight: 300;
}

/* 状态卡片 */
.status-section {
  max-width: 1000px;
  margin: 0 auto 50px;
}

.r-status-card {
  border-radius: 20px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-bottom: 2px solid #dee2e6;
}

.card-title-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-icon {
  font-size: 24px;
}

.card-title {
  font-size: 18px;
  font-weight: 700;
  color: #2d3748;
}

.status-content {
  padding: 50px 32px;
  background: linear-gradient(135deg, #ffffff 0%, #fafbfc 100%);
}

.status-success,
.status-warning {
  padding: 0;
}

.status-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.status-icon-large {
  font-size: 72px;
  margin-bottom: 20px;
  line-height: 1;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

.status-icon-large.success {
  text-shadow: 0 8px 24px rgba(102, 194, 58, 0.4);
  filter: drop-shadow(0 4px 12px rgba(102, 194, 58, 0.3));
}

.status-icon-large.warning {
  text-shadow: 0 8px 24px rgba(230, 162, 60, 0.4);
  filter: drop-shadow(0 4px 12px rgba(230, 162, 60, 0.3));
}

.status-title {
  font-size: 32px;
  font-weight: 800;
  margin: 0 0 10px 0;
  color: #1a202c;
  letter-spacing: -0.5px;
}

.status-subtitle {
  font-size: 17px;
  color: #718096;
  margin: 0 0 32px 0;
  font-weight: 400;
  line-height: 1.6;
}

.status-info-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 32px 40px;
  background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
  border-radius: 20px;
  border: 2px solid #e9ecef;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  min-width: 450px;
  max-width: 700px;
}

.status-info-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
  text-align: left;
  margin-top: 8px;
}

.info-label {
  font-weight: 600;
  color: #4a5568;
  white-space: nowrap;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 18px;
  line-height: 1;
}

.info-value {
  color: #2d3748;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.6;
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
  padding: 12px 18px;
  border-radius: 12px;
  word-break: break-all;
  flex: 1;
  border: 2px solid #e2e8f0;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.03);
  transition: all 0.3s ease;
}

.info-value:hover {
  border-color: #409EFF;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
}

.r-path {
  display: inline-block;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  padding: 14px 20px;
  border-radius: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #0369a1;
  border: 2px solid #bae6fd;
  width: 100%;
  box-sizing: border-box;
  box-shadow: 0 2px 8px rgba(3, 105, 161, 0.1);
  transition: all 0.3s ease;
}

.r-path:hover {
  border-color: #0284c7;
  box-shadow: 0 4px 16px rgba(3, 105, 161, 0.2);
}

/* 美化状态标签 */
:deep(.status-info-box .el-tag) {
  padding: 10px 24px;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  box-shadow: 0 4px 12px rgba(102, 194, 58, 0.3);
  transition: all 0.3s ease;
}

:deep(.status-info-box .el-tag:hover) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 194, 58, 0.4);
}

:deep(.status-info-box .el-tag--success) {
  background: linear-gradient(135deg, #67c23a 0%, #529b2e 100%);
}

:deep(.status-info-box .el-tag--danger) {
  background: linear-gradient(135deg, #f56c6c 0%, #e03e3e 100%);
  box-shadow: 0 4px 12px rgba(245, 108, 108, 0.3);
}

:deep(.status-info-box .el-tag .el-icon) {
  margin-right: 6px;
  font-size: 16px;
}

/* 方法选择区域 */
.methods-section {
  max-width: 1400px;
  margin: 0 auto 40px;
}

.section-title {
  font-size: 32px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 40px;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.title-icon {
  font-size: 36px;
}

.method-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 28px;
  justify-content: center;
}

/* 让卡片居中显示 */
.method-cards:has(.coming-soon-card:last-child) {
  grid-template-columns: repeat(3, 1fr);
  max-width: 1100px;
  margin: 0 auto;
}

.method-card {
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid transparent;
  position: relative;
  overflow: visible;
}

.method-card:hover {
  transform: translateY(-12px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.available-card:hover {
  border-color: #67c23a;
}

.method-card-content {
  padding: 8px;
  text-align: center;
}

.method-icon {
  font-size: 56px;
  margin-bottom: 20px;
  text-align: center;
  line-height: 1;
}

.method-name {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 12px 0;
  color: #2d3748;
}

.method-desc {
  font-size: 14px;
  color: #718096;
  text-align: center;
  margin-bottom: 20px;
  line-height: 1.6;
  min-height: 42px;
}

.method-tags {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.card-action {
  text-align: center;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

/* 可用卡片 */
.available-card {
  background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
}

/* 开发中卡片 */
.coming-soon-card {
  opacity: 0.85;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
}

.coming-soon-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 10px,
    rgba(0, 0, 0, 0.02) 10px,
    rgba(0, 0, 0, 0.02) 20px
  );
  pointer-events: none;
}

.ribbon {
  position: absolute;
  top: 18px;
  right: -35px;
  background: linear-gradient(135deg, #909399 0%, #606266 100%);
  color: white;
  padding: 6px 45px;
  transform: rotate(45deg);
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 1;
}

/* 示例卡片 */
.example-card {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
}

/* 指南区域 */
.guide-section {
  max-width: 1100px;
  margin: 0 auto;
}

.guide-card {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
}

.guide-title {
  font-size: 18px;
  font-weight: 600;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .app-title {
    font-size: 32px;
  }
  
  .method-cards {
    grid-template-columns: 1fr;
  }
  
  .section-title {
    font-size: 24px;
  }
  
  .status-info-row {
    flex-direction: column;
    align-items: flex-start;
  }
}

/* 安装指南样式 */
:deep(.install-guide) {
  text-align: left;
  padding: 10px;
}

:deep(.guide-step) {
  margin: 20px 0;
}

:deep(.guide-step h4) {
  color: #409EFF;
  margin-bottom: 8px;
}

:deep(.guide-tip) {
  background: #f0f9ff;
  padding: 12px 16px;
  border-radius: 8px;
  border-left: 4px solid #409EFF;
  margin-top: 20px;
}
</style>
