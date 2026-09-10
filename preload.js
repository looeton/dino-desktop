/**
 * preload.js — 渲染进程与主进程之间的安全桥
 *
 * 渲染进程不直接访问 Node API，这里只暴露一组明确、有限的方法。
 * 数据持久化走同步 IPC，因此游戏侧代码可以像用 localStorage 一样同步读写。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dinoBridge', {
  /** @returns {string|null} */
  getItem: (key) => ipcRenderer.sendSync('dino-store-get', key),
  setItem: (key, value) => ipcRenderer.sendSync('dino-store-set', key, value),
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});
