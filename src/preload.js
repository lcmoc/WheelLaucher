const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
  onShowWheel: (cb) => ipcRenderer.on('show-wheel', (_e, data) => cb(data)),
  onHideWheel: (cb) => ipcRenderer.on('hide-wheel', () => cb()),
  updateHover:  (appName) => ipcRenderer.send('hover-update', appName),
  getFrontmostLauncherApp: () => ipcRenderer.invoke('get-frontmost-launcher-app'),
  iconsPath: path.join(__dirname, '..', 'assets', 'icons'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
});
