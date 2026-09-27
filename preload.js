const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPet', {
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  getWorkArea: () => ipcRenderer.invoke('get-work-area'),
  onSetPaused: (cb) => ipcRenderer.on('set-paused', (_e, v) => cb(v)),
  onResetPosition: (cb) => ipcRenderer.on('reset-position', () => cb())
});
