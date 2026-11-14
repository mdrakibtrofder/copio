const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('node:path');

let win = null;
let timer = null;
let last = null; // null = next read becomes the baseline (not captured)

function poll() {
  const text = clipboard.readText();
  if (last === null) {
    last = text;
    return;
  }
  if (text !== last) {
    last = text;
    if (win && !win.isDestroyed()) win.webContents.send('clipboard:text', text);
  }
}

function startPolling(ms) {
  stopPolling();
  last = null;
  poll();
  timer = setInterval(poll, Math.min(3000, Math.max(200, Number(ms) || 500)));
}

function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

ipcMain.on('clipboard:start', (_e, ms) => startPolling(ms));
ipcMain.on('clipboard:stop', () => stopPolling());
ipcMain.on('clipboard:write', (_e, text) => {
  last = String(text); // don't capture our own copy
  clipboard.writeText(last);
});
ipcMain.on('window:pin', (_e, pinned) => {
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(!!pinned, 'floating');
});

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 560,
    title: 'Copio',
    backgroundColor: '#d9fbe6',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  const devUrl = process.env.COPIO_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'copio', 'browser', 'index.html'));

  win.on('closed', () => {
    win = null;
    stopPolling();
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopPolling();
  app.quit();
});
