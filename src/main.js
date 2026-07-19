const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const { exec, execFile } = require('child_process');
const path = require('path');
const { uIOhook, UiohookKey } = require('uiohook-napi');

const APP_CONFIG = {
  'iTerm':       { cmd: 'open -a iTerm',                process: 'iTerm2'  },
  'VS Code':     { cmd: 'open -a "Visual Studio Code"', process: 'Code'    },
  'Spotify':     { cmd: 'open -a Spotify',              process: 'Spotify' },
  'Zen Browser': { cmd: 'open -a Zen',                  process: 'Zen'     },
  'Finder':      { cmd: 'open -a Finder',               process: 'Finder'  },
};

function launchOrMinimize(appName) {
  const config = APP_CONFIG[appName];
  if (!config) return;

  // Use osascript to check if the app is currently frontmost.
  // If it is, hide (minimize) it. Otherwise open/focus it.
  execFile('osascript', [
    '-e', `tell application "System Events"`,
    '-e', `  if exists (first process whose name is "${config.process}") then`,
    '-e', `    set proc to first process whose name is "${config.process}"`,
    '-e', `    if frontmost of proc is true then`,
    '-e', `      set visible of proc to false`,
    '-e', `      return`,
    '-e', `    end if`,
    '-e', `  end if`,
    '-e', `end tell`,
    '-e', `do shell script "${config.cmd}"`,
  ], (err) => {
    if (err) console.error('Launch/minimize failed:', err.message);
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
    { label: 'Hold ⌥ Option to open wheel', enabled: false },
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
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) {
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
    if (e.keycode === UiohookKey.Alt || e.keycode === UiohookKey.AltRight) {
      keyIsDown = false;
      hideWheel();
    }
  });

  uIOhook.start();
}

ipcMain.on('hover-update', (_event, appName) => {
  currentHoveredApp = appName;
});

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

  // Hot reload (development only)
  // API: reloader(paths, ignored, handler, options)
  if (process.env.NODE_ENV === 'development') {
    const { mainReloader, rendererReloader } = require('electron-hot-reload');

    // Watch main.js + preload.js → relaunches the whole app
    mainReloader(
      [path.join(__dirname, 'main.js'), path.join(__dirname, 'preload.js')],
      undefined,
      (error, filePath) => { if (filePath) console.log('[hot-reload] main changed:', filePath); }
    );

    // Watch entire renderer folder → reloads the BrowserWindow
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


