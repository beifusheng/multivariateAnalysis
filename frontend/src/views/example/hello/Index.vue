<template>
  <section id="hero">
    <h1 class="tagline">
      <span class="accent">Electron-Egg</span>
    </h1>
    <p class="description">
      A fast, desktop software development framework
    </p>
    <p class="actions">
      <a class="setup" href="https://www.kaka996.com/" target="_blank">Get Started</a>
      <router-link class="setup" to="/r-analysis" style="margin-left: 16px;">
        🧬 R 统计分析
      </router-link>
    </p>
    
    <!-- 快捷功能卡片 -->
    <div class="feature-cards">
      <div class="card" @click="$router.push('/r-analysis')">
        <h3>🧬 R 统计分析</h3>
        <p>PERMANOVA / GMR⁴ / Bayesian ERA</p>
      </div>
      <div class="card example-card">
        <h3>📚 示例页面</h3>
        <p>Electron-Egg 基础功能演示</p>
      </div>
    </div>
  </section>
</template>
<script setup>
console.log("hello")
</script>
<style scoped>
section {
  padding: 42px 32px;
}

#hero {
  padding: 150px 32px;
  text-align: center;
  height: 100%;
}

.tagline {
  font-size: 52px;
  line-height: 1.25;
  font-weight: bold;
  letter-spacing: -1.5px;
  max-width: 960px;
  margin: 0px auto;
}
html:not(.dark) .accent,
.dark .tagline {
  background: -webkit-linear-gradient(315deg, #42d392 25%, #647eff);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.description {
  max-width: 960px;
  line-height: 1.5;
  color: var(--vt-c-text-2);
  transition: color 0.5s;
  font-size: 22px;
  margin: 24px auto 40px;
}
.actions a {
  font-size: 16px;
  display: inline-block;
  background-color: var(--vt-c-bg-mute);
  padding: 8px 18px;
  font-weight: 500;
  border-radius: 8px;
  transition: background-color 0.5s, color 0.5s;
  text-decoration:none;
}
.actions .setup {
  color: var(--vt-c-text-code);
  background: -webkit-linear-gradient(315deg, #42d392 25%, #647eff);
}
.actions .setup:hover {
  background-color: var(--vt-c-gray-light-4);
  transition-duration: 0.2s;
}

.feature-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  max-width: 960px;
  margin: 48px auto 0;
  padding: 0 32px;
}

.card {
  background: var(--vt-c-bg-mute);
  padding: 32px 24px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  border: 2px solid transparent;
}

.card:hover {
  transform: translateY(-4px);
  border-color: #42d392;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.card h3 {
  margin: 0 0 12px;
  font-size: 20px;
  color: var(--vt-c-text-1);
}

.card p {
  margin: 0;
  color: var(--vt-c-text-2);
  font-size: 14px;
}

.example-card {
  border-color: #647eff;
}
</style>
  