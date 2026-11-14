const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('copioBridge', {
  isDesktop: true,
  start: (ms) => ipcRenderer.send('clipboard:start', ms),
  stop: () => ipcRenderer.send('clipboard:stop'),
  writeText: (text) => ipcRenderer.send('clipboard:write', text),
  setPinned: (pinned) => ipcRenderer.send('window:pin', !!pinned),
  onText: (cb) => {
    const handler = (_e, text) => cb(text);
    ipcRenderer.on('clipboard:text', handler);
    return () => ipcRenderer.removeListener('clipboard:text', handler);
  },
});
