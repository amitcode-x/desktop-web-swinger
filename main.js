const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  Tray,
  Menu,
  nativeImage
} = require('electron');

const path = require('path');

let win = null;
let tray = null;
let paused = false;

// Prevent multiple Amit instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
    }
  });

  function createWindow() {
    const { width, height } =
      screen.getPrimaryDisplay().workAreaSize;

    win = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,

      transparent: true,
      frame: false,

      alwaysOnTop: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: true,

      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    win.setAlwaysOnTop(true, 'screen-saver');

    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    });

    win.loadFile(
      path.join(__dirname, 'renderer', 'index.html')
    );

    // Start fully click-through.
    win.setIgnoreMouseEvents(true, {
      forward: true
    });

    win.on('closed', () => {
      win = null;
    });
  }

  ipcMain.on('set-ignore-mouse', (_event, ignore) => {
    if (!win) return;

    win.setIgnoreMouseEvents(ignore, {
      forward: true
    });
  });

  ipcMain.handle('get-work-area', () => {
    const { width, height } =
      screen.getPrimaryDisplay().workAreaSize;

    return {
      width,
      height
    };
  });

  // -----------------------------
  // Tray
  // -----------------------------

  function createTray() {
    const iconPath = path.join(
      __dirname,
      'assets',
      'icon.ico'
    );

    const icon = nativeImage.createFromPath(iconPath);

    tray = new Tray(icon);

    tray.setToolTip('Amit');

    const menu = Menu.buildFromTemplate([
      {
        label: 'Pause swinging',
        type: 'checkbox',
        checked: false,

        click: (item) => {
          paused = item.checked;

          win?.webContents.send(
            'set-paused',
            paused
          );
        }
      },

      {
        label: 'Reset position',

        click: () => {
          win?.webContents.send(
            'reset-position'
          );
        }
      },

      {
        type: 'separator'
      },

      {
        label: 'Quit / Exit Amit',

        click: () => {
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(menu);

    tray.on('double-click', () => {
      if (!win) return;

      if (win.isMinimized()) {
        win.restore();
      }

      win.show();
    });
  }

  // -----------------------------
  // App Ready
  // -----------------------------

  app.whenReady().then(() => {

    /*
      IMPORTANT:

      Startup is enabled ONLY for the
      installed/packaged Amit app.

      `npm start` / development Electron
      will NOT create a Windows startup entry.
    */

    if (
      process.platform === 'win32' &&
      app.isPackaged
    ) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: false
      });
    }

    createWindow();

    try {
      createTray();
    } catch (error) {
      console.error(
        'Tray creation failed:',
        error
      );
    }

    app.on('activate', () => {
      if (
        BrowserWindow.getAllWindows().length === 0
      ) {
        createWindow();
      }
    });
  });

  // -----------------------------
  // Clean exit
  // -----------------------------

  app.on('before-quit', () => {
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}