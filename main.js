/**
 * main.js — Electron 主进程
 *
 * 职责：创建窗口、提供持久化存储 IPC、管理应用生命周期。
 * 游戏本体在渲染进程（src/），两者不共享任何 Node 权限。
 */

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const STORE_FILE = 'save.json';

/** 读取存档 JSON；文件不存在或损坏时返回空对象 */
function readStore() {
  const file = path.join(app.getPath('userData'), STORE_FILE);
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return {};
  }
}

/** 写回存档 JSON */
function writeStore(data) {
  const file = path.join(app.getPath('userData'), STORE_FILE);
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    // 写盘失败不影响游戏本身
  }
}

ipcMain.on('dino-store-get', (event, key) => {
  const value = readStore()[key];
  event.returnValue = value === undefined ? null : String(value);
});

ipcMain.on('dino-store-set', (event, key, value) => {
  const data = readStore();
  data[key] = value;
  writeStore(data);
  event.returnValue = true;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 420,
    minWidth: 640,
    minHeight: 320,
    title: 'Dino Runner',
    backgroundColor: '#f7f7f7',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  // 移除默认菜单栏（保留 F11 全屏与开发者工具的快捷方式）
  Menu.setApplicationMenu(null);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
