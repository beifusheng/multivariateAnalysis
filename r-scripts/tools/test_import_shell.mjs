#!/usr/bin/env node
/**
 * L2 外壳 ImportDialog 的「选文件通道」回归
 * ---------------------------------------------------------------
 * 用户实机的“上传完模板后点填入表单没反应”就是这一环：
 * el-upload 配了 :limit="1" 而 auto-upload=false 时旧文件永远留在 fileList 里，
 * Element Plus 的 uploadFiles 是这么写的：
 *     if (limit && fileList.length + files.length > limit) { onExceed(files, fileList); return; }
 * ——第二次选文件**连 on-change 都不触发**，不接 on-exceed 就是彻底静默。
 *
 * 这里不靠浏览器：直接拿组件的 methods / watch 真跑，断言 emit 出来的东西。
 *   node r-scripts/tools/test_import_shell.mjs
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND = path.join(ROOT, 'frontend');

let pass = 0, fail = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (detail ? ` —— ${detail}` : '')); console.log('  ✗ ' + name + (detail ? `\n      ${detail}` : '')); }
};

const { createServer } = await import(pathToFileURL(path.join(FRONTEND, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({ root: FRONTEND, configFile: path.join(FRONTEND, 'vite.config.js'),
  // cacheDir 必须显式指定，默认值 node_modules/.vite 与开发者正在跑的 dev 服务是同一份缓存；
  // 跑测试会把它改写掉，浏览器里旧页面再动态 import('xlsx') 就 fetch 失败（导出报错的根因）。
  cacheDir: path.join(FRONTEND, 'node_modules', '.vite-test-cache'),
  server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const mod = await server.ssrLoadModule('/src/components/r-analysis/ImportDialog.vue');
const Comp = mod.default;

/** 造一个最小可运行的 vm：只喂组件自己用到的那几样 */
const makeVm = () => {
  const emitted = [];
  const cleared = [];
  const vm = {
    $refs: { uploadRef: { clearFiles() { cleared.push(1); } } },
    $emit(ev, payload) { emitted.push([ev, payload]); }
  };
  for (const [k, fn] of Object.entries(Comp.methods)) vm[k] = fn.bind(vm);
  vm.emitted = emitted;
  vm.cleared = cleared;
  return vm;
};

console.log('\n=== 1. 契约：外壳必须接住 limit 超限 ===');
{
  const tpl = Comp.render ? '' : '';
  const src = (await import('fs')).readFileSync(
    path.join(FRONTEND, 'src/components/r-analysis/ImportDialog.vue'), 'utf8');
  check('模板把 :on-change 接上了', /:on-change="onChange"/.test(src));
  check('模板把 :on-exceed 也接上了（不接就是静默无反应）', /:on-exceed="onExceed"/.test(src));
  check('onExceed 是 methods 里的真方法', typeof Comp.methods.onExceed === 'function');
  check('resetUpload 是 methods 里的真方法', typeof Comp.methods.resetUpload === 'function');
  check('watch 里在打开时清队列', /modelValue\(v\)\s*\{[\s\S]{0,80}resetUpload/.test(src), (src.match(/modelValue[\s\S]{0,90}/) || [''])[0]);
  check('limit 仍然是 1（一次只谈一个工作簿）', /:limit="1"/.test(src));
}

console.log('\n=== 2. 真跑：第一次选文件 ===');
{
  const vm = makeVm();
  const f1 = { name: 'a.xlsx' };
  vm.onChange({ raw: f1 });
  check('on-change 把 raw 递出去', vm.emitted.some(([e, p]) => e === 'file-change' && p === f1), JSON.stringify(vm.emitted));
  check('第一次不触发 clearFiles（没东西可清）', vm.cleared.length === 0, String(vm.cleared.length));
}

console.log('\n=== 3. 真跑：第二次选文件走 on-exceed ===');
{
  const vm = makeVm();
  const f1 = { name: 'a.xlsx' }, f2 = { name: 'b.xlsx' };
  vm.onChange({ raw: f1 });
  vm.onExceed([f2], [{ name: 'a.xlsx' }]);      // EP：limit 已满，只叫 onExceed
  check('on-exceed 里清了旧文件', vm.cleared.length >= 1, String(vm.cleared.length));
  const got = vm.emitted.filter(([e]) => e === 'file-change').map(([, p]) => p.name);
  check('on-exceed 把新文件照常递出去（后选覆盖先选）', got.join(',') === 'a.xlsx,b.xlsx', got.join(','));
  check('递出去的是 File 本身而不是包装对象',
    vm.emitted.every(([, p]) => p && p.name), JSON.stringify(vm.emitted.map(([, p]) => typeof p)));
  const single = vm.onExceed(f2, []);            // 传非数组也不能崩
  check('传单个文件（不是数组）也不抛异常', single === undefined);
}

console.log('\n=== 4. 真跑：重开对话框 ===');
{
  const vm = makeVm();
  Comp.watch.modelValue.call(vm, true);
  check('打开时清空上传队列', vm.cleared.length === 1, String(vm.cleared.length));
  const vm2 = makeVm();
  Comp.watch.modelValue.call(vm2, false);
  check('关闭时不做多余动作', vm2.cleared.length === 0, String(vm2.cleared.length));
  // 没有 uploadRef（比如替身渲染）时不能炸
  const vm3 = makeVm();
  vm3.$refs = {};
  let threw = null;
  try { vm3.resetUpload(); vm3.onExceed([{ name: 'c.xlsx' }]); } catch (e) { threw = e.message; }
  check('没有 uploadRef 时静默降级而不是抛异常', threw === null, threw || '');
  check('降级后仍然把文件递出去', vm3.emitted.some(([e, p]) => e === 'file-change' && p.name === 'c.xlsx'),
    JSON.stringify(vm3.emitted));
}

console.log(`\n──────── ${pass} 通过 / ${fail} 失败 ────────`);
if (fails.length) { console.log('失败项：'); fails.forEach((x) => console.log('  - ' + x)); }
await server.close();
process.exit(fails.length ? 1 : 0);
