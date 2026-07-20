const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const { uIOhook, UiohookKey } = require('uiohook-napi');

const APP_CONFIG = {
  'iTerm':       { application: 'iTerm',              bundleId: 'com.googlecode.iterm2', processNames: ['iTerm2', 'iTerm'] },
  'VS Code':     { application: 'Visual Studio Code', bundleId: 'com.microsoft.VSCode', processNames: ['Code', 'Visual Studio Code'] },
  'Spotify':     { application: 'Spotify',            bundleId: 'com.spotify.client', processNames: ['Spotify'] },
  'Zen Browser': {
    application: 'Zen',
    bundleId: 'app.zen-browser.zen',
    processNames: ['Zen', 'Zen Browser', 'zen'],
  },
  'Finder':      { application: 'Finder',              bundleId: 'com.apple.finder', processNames: ['Finder'] },
};

function getFrontmostLauncherApp(callback) {
  execFile('osascript', [
    '-e', 'tell application "System Events"',
    '-e', '  set frontmostProcess to first process whose frontmost is true',
    '-e', '  return (name of frontmostProcess) & linefeed & (bundle identifier of frontmostProcess)',
    '-e', 'end tell',
  ], { timeout: 3_000 }, (err, stdout) => {
    if (err) {
      callback(null, null);
      return;
    }

    const [processName, bundleId] = stdout.trim().split(/\r?\n/);
    const matchedApp = Object.entries(APP_CONFIG).find(([, config]) =>
      (config.bundleId && config.bundleId === bundleId) || config.processNames.includes(processName),
    );
    callback(matchedApp ? matchedApp[0] : null, processName);
  });
}

function getRunningLauncherApps(callback) {
  execFile('osascript', [
    '-e', 'tell application "System Events"',
    '-e', '  return bundle identifier of every process',
    '-e', 'end tell',
  ], { timeout: 3_000 }, (err, stdout) => {
    if (err) {
      callback([]);
      return;
    }

    const runningBundleIds = new Set(stdout.trim().split(/,\s*/));
    const runningApps = Object.entries(APP_CONFIG)
      .filter(([, config]) => runningBundleIds.has(config.bundleId))
      .map(([appName]) => appName);
    callback(runningApps);
  });
}

function launchOrMinimize(appName) {
  const config = APP_CONFIG[appName];
  if (!config) return;

  // Make the action decision at release time, rather than relying on a stale
  // renderer value. This also keeps the visual hint and release action aligned.
  getFrontmostLauncherApp((frontmostApp, processName) => {
    if (frontmostApp === appName) {
      execFile('osascript', [
        '-e', 'tell application "System Events"',
        '-e', `  set visible of process "${processName}" to false`,
        '-e', 'end tell',
      ], (err) => {
        if (err) console.error('Launch/minimize failed:', err.message);
      });
      return;
    }

    execFile('open', ['-a', config.application], (err) => {
      if (err) console.error('Launch/minimize failed:', err.message);
    });
  });
}

let win = null;
let tray = null;
let wheelVisible = false;
let keyIsDown = false;
let currentHoveredApp = null;

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '/../assets', 'trayIconTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Wheel Launcher');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Hold ⌃ Control to open wheel', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function createWindow() {
  win = new BrowserWindow({
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    type: 'panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, 'screen-saver');
}

function showWheel() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);

  win.setBounds(display.bounds);

  const localX = cursor.x - display.bounds.x;
  const localY = cursor.y - display.bounds.y;

  win.showInactive();
  win.webContents.send('show-wheel', { x: localX, y: localY });
  wheelVisible = true;
}

function hideWheel() {
  if (!wheelVisible) return;
  wheelVisible = false;
  const appToLaunch = currentHoveredApp;
  currentHoveredApp = null;

  win.webContents.send('hide-wheel');
  win.hide();

  if (appToLaunch) launchOrMinimize(appToLaunch);
}

function startHook() {
  uIOhook.on('keydown', (e) => {
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) {
      if (!keyIsDown) {
        keyIsDown = true;
        showWheel();
      }
    }
    if (e.keycode === UiohookKey.Escape && wheelVisible) {
      keyIsDown = false;
      hideWheel();
    }
  });

  uIOhook.on('keyup', (e) => {
    if (e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight) {
      keyIsDown = false;
      hideWheel();
    }
  });

  uIOhook.start();
}

ipcMain.on('hover-update', (_event, appName) => {
  currentHoveredApp = appName;
});

ipcMain.handle('get-frontmost-launcher-app', () => new Promise((resolve) => {
  getFrontmostLauncherApp((appName) => resolve(appName));
}));

ipcMain.handle('get-running-launcher-apps', () => new Promise((resolve) => {
  getRunningLauncherApps(resolve);
}));

ipcMain.on('set-ignore-mouse-events', (_event, ignore) => {
  if (win) {
    win.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

app.whenReady().then(() => {
  app.dock.hide();

  const { systemPreferences, dialog } = require('electron');
  if (!systemPreferences.isTrustedAccessibilityClient(false)) {
    systemPreferences.isTrustedAccessibilityClient(true);
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Accessibility Permission Required',
      message: 'WheelLauncher needs Accessibility access to detect key presses.',
      detail: 'Go to System Settings → Privacy & Security → Accessibility and enable WheelLauncher, then relaunch the app.',
      buttons: ['Quit'],
    });
    app.quit();
    return;
  }

  createWindow();
  createTray();
  startHook();

  // Hot reload (development only). Keep the native keyboard hook in a stable
  // main process: restarting it from a file watcher can crash uiohook-napi.
  if (process.env.NODE_ENV === 'development') {
    const { rendererReloader } = require('electron-hot-reload');

    // Renderer edits still reload the BrowserWindow automatically. Restart
    // `npm start` after changing main.js or preload.js.
    rendererReloader(
      path.join(__dirname, 'renderer'),
      undefined,
      (error, filePath) => { if (filePath) console.log('[hot-reload] renderer changed:', filePath); }
    );
  }
});

app.on('before-quit', () => {
  uIOhook.stop();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});
