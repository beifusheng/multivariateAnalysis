/**
 * R 运行时与脚本目录的路径解析（纯函数，不 import electron，因此可被测试直接调用）。
 *
 * 为什么要抽出来：原来这两处逻辑分别写死在 rPortableService 与 rService 里，
 * 其中一处还把开发机的绝对路径硬编码进代码
 * （const projectRoot = 'C:\\Custom\\CodeRepository\\Demo\\electron-egg'），
 * 换一台机器就永远命中不了。抽成纯函数后，dev / 打包 / extraResources
 * 三种情形都能用假输入真跑一遍断言。
 */

export interface PathContext {
  /** app.getAppPath()：dev 是项目根，打包后是 .../resources/app.asar */
  appPath: string;
  /** process.resourcesPath：打包后是 .../resources；dev 时可能为空 */
  resourcesPath?: string;
  /** process.cwd()：npm run dev 时通常就是项目根 */
  cwd?: string;
  /** 环境变量（用户级 R-Portable 兜底用） */
  env?: Record<string, string | undefined>;
}

/** 是否在 asar 归档里（或本身就是归档）。
 *  必须连"路径正好是 app.asar"也算：打包后 app.getAppPath() 就长这样，
 *  而 rScriptsCandidates 靠它区分 dev / 打包两条分支 —— 上一版只认
 *  "app.asar/" 前缀，于是打包态被当成开发态，返回了归档内路径。*/
export function isInsideAsar(p: string): boolean {
  const sep = String.fromCharCode(92);
  if (p.indexOf('app.asar/') >= 0) return true;
  if (p.indexOf(sep + 'app.asar' + sep) >= 0) return true;
  return p.endsWith('/app.asar') || p.endsWith(sep + 'app.asar');
}

/** 把 asar 路径改写成解包后的真实路径。
 *  R 进程走的是真实文件系统，看不到 app.asar 里的东西 —— 传进去只会得到
 *  "cannot open file"，而且错误信息里连 asar 两个字都不会出现，极难定位。
 *
 * 三种形状都得管（第一版只处理了第一种，于是打包后返回的是未改写的归档内路径）：
 *   1) <...>/app.asar/r-scripts/a.R
 *   2) <...>/app.asar              <- app.getAppPath() 在打包后正好长这样
 *   3) 反斜杠分隔的 Windows 路径
 * 而 `app.asarrc` 这种同前缀但非目录边界的不能误改。
 */
export function toUnpacked(p: string): string {
  const marker = 'app.asar';
  const i = p.lastIndexOf(marker);
  if (i < 0) return p;
  const after = p.slice(i + marker.length);
  const sep = String.fromCharCode(92); // 反斜杠，不用字面量以免转义层吃掉
  if (after === '') return p + '.unpacked';
  if (after.charAt(0) === '/' || after.charAt(0) === sep) {
    return p.slice(0, i + marker.length) + '.unpacked' + after;
  }
  return p;
}

/** 便携版 R 的候选位置（按优先级）。第一个存在且含 bin/Rscript 的胜出。 */
export function rPortableCandidates(ctx: PathContext): string[] {
  const out: string[] = [];
  const push = (base?: string, sub?: string) => {
    if (!base) return;
    const p = sub ? `${base.replace(/[\\/]$/, '')}/${sub}` : base;
    if (!out.includes(p)) out.push(p);
  };

  // 1) 开发态：项目根下的 r-portable（cwd 与 appPath 在 dev 下通常同义，都试）
  push(ctx.cwd, 'r-portable');
  push(isInsideAsar(ctx.appPath) ? toUnpacked(ctx.appPath) : ctx.appPath, 'r-portable');

  // 2) 打包态：electron-builder 的 extraResources 真实落点是
  //    <install>/resources/extraResources/<to>，不是 app.asar 里面。
  //    原实现搜的是 appPath + '/resources/r-portable'，那个路径在安装包里不存在。
  push(ctx.resourcesPath, 'extraResources/r-portable');
  push(ctx.resourcesPath, 'r-portable');
  push(isInsideAsar(ctx.appPath) ? toUnpacked(ctx.appPath) : ctx.appPath, 'resources/r-portable');

  // 3) 历史布局与用户级兜底
  push(ctx.appPath, 'r');
  push(ctx.env && ctx.env.LOCALAPPDATA, 'R-Portable');
  push(ctx.env && ctx.env.USERPROFILE, 'R-Portable');

  return out;
}

/** R 脚本目录的候选位置（按优先级）。 */
export function rScriptsCandidates(ctx: PathContext): string[] {
  const out: string[] = [];
  const push = (p?: string) => {
    if (!p) return;
    const clean = p.replace(/[\\/]$/, '');
    if (!out.includes(clean)) out.push(clean);
  };

  // dev：appPath 就是项目根，r-scripts 直接在旁边
  if (!isInsideAsar(ctx.appPath)) {
    push(`${ctx.appPath}/r-scripts`);
    if (ctx.cwd) push(`${ctx.cwd}/r-scripts`);
  } else {
    // 打包：必须在 asarUnpack 里带上 r-scripts，然后在 app.asar.unpacked 下取真实路径
    push(`${toUnpacked(ctx.appPath)}/r-scripts`);
  }
  // 备用：随 extraResources 分发（体积大或不想进 asar 时用这条）
  if (ctx.resourcesPath) push(`${ctx.resourcesPath}/extraResources/r-scripts`);
  if (ctx.cwd && isInsideAsar(ctx.appPath)) push(`${ctx.cwd}/r-scripts`);

  return out;
}

/** 在候选里挑第一个「目录存在」的；exists 注入便于测试。 */
export function pickFirst(candidates: string[], exists: (p: string) => boolean): string | null {
  for (const c of candidates) if (exists(c)) return c;
  return null;
}

/** 找不到 R 时说人话：把搜过的位置全列出来，用户才知道该往哪放 / 该装什么。 */
export function describeSearchFailure(candidates: string[], extra?: string): string {
  const lines = [
    '没有找到可用的 R 运行时。已按顺序搜索这些位置：',
    ...candidates.map((c, i) => `  ${i + 1}) ${c}`),
    extra || '',
    '修复方式任选其一：装到项目根的 r-portable/（开发）、把 r-portable 放进 build/extraResources/（打包分发）、' +
      '或安装系统 R 并确保 Rscript 在 PATH 中。'
  ].filter((l) => l !== '');
  return lines.join('\n');
}
