/**
 * 在 Node 里加载 frontend/src/utils 下的 ESM 模块
 * ---------------------------------------------------------------
 * 为什么需要这个 helper：
 *   frontend/package.json 没有 "type": "module"，所以那些 .js 文件在 Node 眼里是 CJS；
 *   早先的做法是把文件复制成 .mjs 再 import。但一旦模块之间有相对导入
 *   （比如 medTemplates.js -> rng.js），复制成 .mjs 就断了：Node 既不认无扩展名的
 *   相对导入，也没人把 rng.js 一起搬过去。
 *
 * 现在的做法：建一个临时目录，写一份 {"type":"module"} 的 package.json，把需要的
 * 源文件**按原名**复制进去，于是
 *   - .js 被当作 ESM；
 *   - `import './rng.js'` 这类显式扩展名的相对导入正常解析；
 *   - 复制的是仓库里的原文件，测的就是浏览器里跑的同一份代码。
 *
 * 用法：
 *   const { mt, rng } = await loadFrontendUtils(['medTemplates', 'rng']);
 *   // 名字对应 frontend/src/utils/<name>.js
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const UTILS = path.join(ROOT, 'frontend', 'src', 'utils');

export async function loadFrontendUtils(names, opts = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-utils-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }, null, 2));

  // 复制请求的模块 + 它们彼此之间的相对依赖（扫 import 语句递归补齐）
  const toCopy = new Set();
  const queue = [...names];
  while (queue.length) {
    const name = queue.shift();
    if (toCopy.has(name)) continue;
    const file = path.join(UTILS, name + '.js');
    if (!fs.existsSync(file)) throw new Error(`找不到前端模块: frontend/src/utils/${name}.js`);
    toCopy.add(name);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*import[^'"]*['"]\.\/([A-Za-z0-9_-]+)(?:\.js)?['"]/gm)) {
      if (!toCopy.has(m[1])) queue.push(m[1]);
    }
  }
  for (const name of toCopy) {
    fs.copyFileSync(path.join(UTILS, name + '.js'), path.join(tmp, name + '.js'));
  }

  const out = {};
  for (const name of names) {
    out[name] = await import(pathToFileURL(path.join(tmp, name + '.js')).href);
  }
  if (opts.keepDir) out.__dir = tmp;
  return out;
}

/** 让调用方自己决定复制哪些文件时用（例如需要往临时目录塞额外桩文件） */
export function makeEsmSandbox() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-sandbox-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }, null, 2));
  return {
    dir: tmp,
    copyFromUtils(name) {
      const rel = name.endsWith('.js') ? name : name + '.js';
      const src = path.join(UTILS, rel);
      if (!fs.existsSync(src)) throw new Error(`找不到前端模块: frontend/src/utils/${rel}`);
      const dest = path.join(tmp, path.basename(rel));
      fs.copyFileSync(src, dest);
      return dest;
    },
    copy(absPath, asName) {
      const dest = path.join(tmp, asName || path.basename(absPath));
      fs.copyFileSync(absPath, dest);
      return dest;
    },
    write(name, content) {
      const dest = path.join(tmp, name);
      fs.writeFileSync(dest, content, 'utf8');
      return dest;
    },
    import(destPath) {
      return import(pathToFileURL(destPath).href);
    },
    url(destPath) {
      return pathToFileURL(destPath).href;
    }
  };
}

// 直接运行本文件时的自检：确认新模板模块能在 Node 侧加载
if (process.argv[1] && /load_frontend_utils\.mjs$/.test(process.argv[1])) {
  const { nonrandomTemplates: nrt } = await loadFrontendUtils(['nonrandomTemplates']);
  console.log(`[ok] nonrandomTemplates 加载：${nrt.NR_TEMPLATE_COUNT} 个模板，` +
    `首个设计 = ${nrt.buildNonrandomTemplateData(nrt.NR_TEMPLATE_GROUPS[0].items[0].spec).design}`);
}
