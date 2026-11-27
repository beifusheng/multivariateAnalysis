import { ElectronEgg } from 'ee-core';
import { Lifecycle } from './preload/lifecycle';
import { preload } from './preload';

/**
 * 关于自动更新：**不做**（2026-11 用户确认）。
 * cmd/builder*.json 里的 publish 只是占位；electron/ 下不得出现 autoUpdater 调用。
 * 决定写在这里是因为：只有文档与判据两边都在，后来人才不会把它当成漏接的功能去补。
 * 对应检查：r-scripts/tools/test_repo_hygiene.mjs 的「自动更新」一节。
 */

// new app
const app = new ElectronEgg();

// register lifecycle
const life = new Lifecycle();
app.register("ready", life.ready);
app.register("electron-app-ready", life.electronAppReady);
app.register("window-ready", life.windowReady);
app.register("before-close", life.beforeClose);

// register preload
app.register("preload", preload);

// run
app.run();
