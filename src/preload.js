const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
  onShowWheel: (cb) => ipcRenderer.on('show-wheel', (_e, data) => cb(data)),
  onHideWheel: (cb) => ipcRenderer.on('hide-wheel', () => cb()),
  updateHover:  (appName, action = 'activate') => ipcRenderer.send('hover-update', appName, action),
  getFrontmostLauncherApp: () => ipcRenderer.invoke('get-frontmost-launcher-app'),
  getRunningLauncherApps: () => ipcRenderer.invoke('get-running-launcher-apps'),
  iconsPath: path.join(__dirname, '..', 'assets', 'icons'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
});
