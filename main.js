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
const { autoUpdater } = require('electron-updater');

let win = null;
let tray = null;
let paused = false;

// Prevent multiple Amit instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {

  // --------------------------------
  // Prevent Multiple Instances
  // --------------------------------

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) {
        win.restore();
      }

      win.show();
      win.focus();
    }
  });

  // --------------------------------
  // Create Main Window
  // --------------------------------

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

    // Keep Amit always on top
    win.setAlwaysOnTop(true, 'screen-saver');

    // Show on all workspaces/desktops
    win.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    });

    // Load renderer
    win.loadFile(
      path.join(
        __dirname,
        'renderer',
        'index.html'
      )
    );

    // Start fully click-through
    win.setIgnoreMouseEvents(true, {
      forward: true
    });

    win.on('closed', () => {
      win = null;
    });
  }

  // --------------------------------
  // Mouse Events
  // --------------------------------

  ipcMain.on(
    'set-ignore-mouse',
    (_event, ignore) => {
      if (!win) return;

      win.setIgnoreMouseEvents(ignore, {
        forward: true
      });
    }
  );

  // --------------------------------
  // Work Area
  // --------------------------------

  ipcMain.handle(
    'get-work-area',
    () => {
      const { width, height } =
        screen.getPrimaryDisplay().workAreaSize;

      return {
        width,
        height
      };
    }
  );

  // --------------------------------
  // Auto Update
  // --------------------------------

  function setupAutoUpdater() {

    // Do not check for updates during development
    if (!app.isPackaged) {
      console.log(
        'Auto update disabled in development mode.'
      );
      return;
    }

    // Automatically download available updates
    autoUpdater.autoDownload = true;

    // Install downloaded update when app quits
    autoUpdater.autoInstallOnAppQuit = true;

    // --------------------------------
    // Checking for Update
    // --------------------------------

    autoUpdater.on(
      'checking-for-update',
      () => {
        console.log(
          'Checking for updates...'
        );
      }
    );

    // --------------------------------
    // Update Available
    // --------------------------------

    autoUpdater.on(
      'update-available',
      (info) => {
        console.log(
          `Update available: ${info.version}`
        );
      }
    );

    // --------------------------------
    // No Update
    // --------------------------------

    autoUpdater.on(
      'update-not-available',
      () => {
        console.log(
          'Amit is already up to date.'
        );
      }
    );

    // --------------------------------
    // Download Progress
    // --------------------------------

    autoUpdater.on(
      'download-progress',
      (progress) => {
        console.log(
          `Downloading update: ${Math.round(
            progress.percent
          )}%`
        );
      }
    );

    // --------------------------------
    // Update Downloaded
    // --------------------------------

    autoUpdater.on(
      'update-downloaded',
      (info) => {
        console.log(
          `Update downloaded: ${info.version}`
        );

        /*
          Automatically quit Amit,
          install the new version,
          and restart the application.
        */

        autoUpdater.quitAndInstall(
          false,
          true
        );
      }
    );

    // --------------------------------
    // Update Error
    // --------------------------------

    autoUpdater.on(
      'error',
      (error) => {
        console.error(
          'Auto update error:',
          error
        );
      }
    );

    // --------------------------------
    // Check for Updates
    // --------------------------------

    autoUpdater
      .checkForUpdates()
      .catch((error) => {
        console.error(
          'Update check failed:',
          error
        );
      });
  }

  // --------------------------------
  // System Tray
  // --------------------------------

  function createTray() {

    const iconPath = path.join(
      __dirname,
      'assets',
      'icon.ico'
    );

    const icon =
      nativeImage.createFromPath(
        iconPath
      );

    tray = new Tray(icon);

    tray.setToolTip('Amit');

    const menu =
      Menu.buildFromTemplate([
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

    // Double click tray icon
    tray.on(
      'double-click',
      () => {
        if (!win) return;

        if (win.isMinimized()) {
          win.restore();
        }

        win.show();
        win.focus();
      }
    );
  }

  // --------------------------------
  // App Ready
  // --------------------------------

  app.whenReady().then(() => {

    /*
      Startup is enabled ONLY for the
      installed/packaged Amit application.

      npm start / development mode
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

    // Create Amit window
    createWindow();

    // Create system tray
    try {
      createTray();
    } catch (error) {
      console.error(
        'Tray creation failed:',
        error
      );
    }

    // Start auto-update system
    setupAutoUpdater();

    // macOS application activation
    app.on(
      'activate',
      () => {
        if (
          BrowserWindow.getAllWindows()
            .length === 0
        ) {
          createWindow();
        }
      }
    );
  });

  // --------------------------------
  // Clean Exit
  // --------------------------------

  app.on(
    'before-quit',
    () => {
      if (tray) {
        tray.destroy();
        tray = null;
      }
    }
  );

  // --------------------------------
  // Window Closed
  // --------------------------------

  app.on(
    'window-all-closed',
    () => {
      /*
        macOS applications normally stay
        active even when all windows close.
      */

      if (
        process.platform !== 'darwin'
      ) {
        app.quit();
      }
    }
  );
}