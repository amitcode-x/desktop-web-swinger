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
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const APP_ID = 'com.amit.hangingcharacter';
const APP_NAME = 'Amit';

let win = null;
let tray = null;
let paused = false;

let cursorTimer = null;
let lastCursor = null;

// null means the initial state has not yet been applied.
let ignoreMouse = null;

// ------------------------------------------------------------
// Linux compatibility
// ------------------------------------------------------------
//
// This app needs global cursor coordinates for mouse interaction.
// Native Wayland does not expose the required cursor API reliably.
//
// Therefore Linux builds are forced to X11/XWayland.
//

if (process.platform === 'linux') {
  app.commandLine.appendSwitch(
    'ozone-platform',
    'x11'
  );
}

// ------------------------------------------------------------
// Prevent multiple Amit instances
// ------------------------------------------------------------

const gotTheLock =
  app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {

  app.on(
    'second-instance',
    () => {
      if (!win) return;

      if (win.isMinimized()) {
        win.restore();
      }

      win.showInactive();
    }
  );

  // ----------------------------------------------------------
  // Linux startup / autostart
  // ----------------------------------------------------------

  function setupLinuxAutostart() {
    if (
      process.platform !== 'linux' ||
      !app.isPackaged
    ) {
      return;
    }

    try {
      const configDir =
        app.getPath('appData');

      const autostartDir =
        path.join(
          configDir,
          'autostart'
        );

      fs.mkdirSync(
        autostartDir,
        {
          recursive: true
        }
      );

      const desktopFile =
        path.join(
          autostartDir,
          `${APP_ID}.desktop`
        );

      // For AppImage, process.execPath can point to the
      // temporary mounted AppImage location.
      //
      // APPIMAGE contains the actual persistent AppImage path.
      // For .deb installations, process.execPath is correct.
      const executable =
        (
          process.env.APPIMAGE ||
          process.execPath
        )
          .replace(
            /\\/g,
            '\\\\'
          )
          .replace(
            /"/g,
            '\\"'
          );

      const desktopEntry = [
        '[Desktop Entry]',
        'Type=Application',
        `Name=${APP_NAME}`,
        `Comment=${APP_NAME} desktop companion`,
        `Exec="${executable}"`,
        'Terminal=false',
        'Hidden=false',
        'NoDisplay=true',
        'X-GNOME-Autostart-enabled=true',
        'X-KDE-autostart-after=panel',
        'X-Autostart-Application=true'
      ].join('\n') + '\n';

      fs.writeFileSync(
        desktopFile,
        desktopEntry,
        'utf8'
      );

      console.log(
        'Linux autostart enabled:',
        desktopFile
      );

    } catch (error) {
      console.error(
        'Linux autostart setup failed:',
        error
      );
    }
  }

  // ----------------------------------------------------------
  // Create main window
  // ----------------------------------------------------------

  function createWindow() {
    const {
      width,
      height
    } =
      screen
        .getPrimaryDisplay()
        .workAreaSize;

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

      // Windows/macOS:
      // hide from normal taskbar/dock.
      //
      // Electron 31 removed Linux skipTaskbar support,
      // so Linux is intentionally excluded here.
      skipTaskbar:
        process.platform !== 'linux',

      hasShadow: false,
      focusable: true,

      backgroundColor:
        '#00000000',

      webPreferences: {
        preload:
          path.join(
            __dirname,
            'preload.js'
          ),

        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // Keep Amit above normal application windows.
    win.setAlwaysOnTop(
      true,
      'screen-saver'
    );

    // Keep visible on all workspaces.
    if (
      process.platform === 'linux' ||
      process.platform === 'darwin'
    ) {
      win.setVisibleOnAllWorkspaces(
        true,
        {
          visibleOnFullScreen: true
        }
      );
    }

    // --------------------------------------------------------
    // Linux desktop identity
    // --------------------------------------------------------

    if (
      process.platform === 'linux' &&
      typeof app.setDesktopName === 'function'
    ) {
      try {
        app.setDesktopName(
          `${APP_ID}.desktop`
        );
      } catch (error) {
        console.warn(
          'Could not set Linux desktop name:',
          error
        );
      }
    }

    // --------------------------------------------------------
    // Window icon
    // --------------------------------------------------------

    const windowIcon =
      process.platform === 'linux'
        ? path.join(
            __dirname,
            'assets',
            'icon.png'
          )
        : process.platform === 'darwin'
          ? path.join(
              __dirname,
              'assets',
              'icon.icns'
            )
          : path.join(
              __dirname,
              'assets',
              'icon.ico'
            );

    try {
      win.setIcon(
        nativeImage.createFromPath(
          windowIcon
        )
      );
    } catch (error) {
      console.warn(
        'Could not set window icon:',
        error
      );
    }

    // --------------------------------------------------------
    // Load renderer
    // --------------------------------------------------------

    win.loadFile(
      path.join(
        __dirname,
        'renderer',
        'index.html'
      )
    );

    // --------------------------------------------------------
    // Start click-through
    // --------------------------------------------------------

    setIgnoreMouse(true);

    // --------------------------------------------------------
    // Initial cursor position
    // --------------------------------------------------------
    //
    // The renderer might not be ready when createWindow()
    // finishes. Send the first cursor position only after
    // the page has loaded.
    //

    win.webContents.once(
      'did-finish-load',
      () => {
        lastCursor = null;
        sendGlobalCursor();
      }
    );

    win.on(
      'closed',
      () => {
        win = null;
      }
    );
  }

  // ----------------------------------------------------------
  // Mouse interaction
  // ----------------------------------------------------------

  function setIgnoreMouse(ignore) {
    if (
      !win ||
      win.isDestroyed()
    ) {
      return;
    }

    if (
      ignoreMouse === ignore
    ) {
      return;
    }

    ignoreMouse = ignore;

    try {
      win.setIgnoreMouseEvents(
        ignore,
        {
          // Windows/macOS can forward ignored mouse movement.
          //
          // Linux cannot, so Linux uses global cursor polling.
          forward:
            process.platform !== 'linux'
        }
      );
    } catch (error) {
      console.error(
        'setIgnoreMouseEvents failed:',
        error
      );
    }
  }

  ipcMain.on(
    'set-ignore-mouse',
    (_event, ignore) => {
      setIgnoreMouse(
        Boolean(ignore)
      );
    }
  );

  // ----------------------------------------------------------
  // Global cursor polling
  // ----------------------------------------------------------
  //
  // This fixes Linux dragging.
  //
  // When the window is click-through, Chromium cannot receive
  // mousemove events. Electron main process reads the absolute
  // cursor position and sends local coordinates to renderer.
  //

  function sendGlobalCursor() {
    if (
      !win ||
      win.isDestroyed()
    ) {
      return;
    }

    try {
      const point =
        screen.getCursorScreenPoint();

      const bounds =
        win.getBounds();

      const local = {
        x:
          point.x -
          bounds.x,

        y:
          point.y -
          bounds.y
      };

      if (
        !lastCursor ||
        Math.abs(
          lastCursor.x -
          local.x
        ) > 0.25 ||
        Math.abs(
          lastCursor.y -
          local.y
        ) > 0.25
      ) {
        lastCursor = local;

        win.webContents.send(
          'global-cursor',
          local
        );
      }

    } catch (error) {
      // Native Wayland does not expose the required global
      // cursor API. Linux is forced to X11 above.
    }
  }

  function startCursorTracking() {
    if (cursorTimer) {
      clearInterval(
        cursorTimer
      );
    }

    cursorTimer =
      setInterval(
        sendGlobalCursor,
        16
      );
  }

  function stopCursorTracking() {
    if (cursorTimer) {
      clearInterval(
        cursorTimer
      );

      cursorTimer = null;
    }
  }

  // ----------------------------------------------------------
  // Work area
  // ----------------------------------------------------------

  ipcMain.handle(
    'get-work-area',
    () => {
      const {
        width,
        height
      } =
        screen
          .getPrimaryDisplay()
          .workAreaSize;

      return {
        width,
        height
      };
    }
  );

  // ----------------------------------------------------------
  // Auto update
  // ----------------------------------------------------------

  function setupAutoUpdater() {
    // Do not update during npm start / development.
    if (!app.isPackaged) {
      console.log(
        'Auto update disabled in development mode.'
      );

      return;
    }

    // Automatically download available update.
    autoUpdater.autoDownload = true;

    // Install update when app quits.
    autoUpdater.autoInstallOnAppQuit = true;

    // --------------------------------------------------------
    // Checking
    // --------------------------------------------------------

    autoUpdater.on(
      'checking-for-update',
      () => {
        console.log(
          'Checking for updates...'
        );
      }
    );

    // --------------------------------------------------------
    // Update available
    // --------------------------------------------------------

    autoUpdater.on(
      'update-available',
      (info) => {
        console.log(
          `Update available: ${info.version}`
        );
      }
    );

    // --------------------------------------------------------
    // No update
    // --------------------------------------------------------

    autoUpdater.on(
      'update-not-available',
      () => {
        console.log(
          'Amit is already up to date.'
        );
      }
    );

    // --------------------------------------------------------
    // Download progress
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // Update downloaded
    // --------------------------------------------------------

    autoUpdater.on(
      'update-downloaded',
      (info) => {
        console.log(
          `Update downloaded: ${info.version}`
        );

        autoUpdater.quitAndInstall(
          false,
          true
        );
      }
    );

    // --------------------------------------------------------
    // Update error
    // --------------------------------------------------------

    autoUpdater.on(
      'error',
      (error) => {
        console.error(
          'Auto update error:',
          error
        );
      }
    );

    // --------------------------------------------------------
    // Check for updates
    // --------------------------------------------------------

    autoUpdater
      .checkForUpdates()
      .catch(
        (error) => {
          console.error(
            'Update check failed:',
            error
          );
        }
      );
  }

  // ----------------------------------------------------------
  // System tray
  // ----------------------------------------------------------

  function createTray() {
    const iconPath =
      process.platform === 'linux'
        ? path.join(
            __dirname,
            'assets',
            'icon.png'
          )
        : process.platform === 'darwin'
          ? path.join(
              __dirname,
              'assets',
              'icon.icns'
            )
          : path.join(
              __dirname,
              'assets',
              'icon.ico'
            );

    const icon =
      nativeImage.createFromPath(
        iconPath
      );

    tray =
      new Tray(icon);

    tray.setToolTip(
      APP_NAME
    );

    const menu =
      Menu.buildFromTemplate([
        {
          label: 'Pause swinging',
          type: 'checkbox',
          checked: false,

          click: (item) => {
            paused =
              item.checked;

            if (win) {
              win.webContents.send(
                'set-paused',
                paused
              );
            }
          }
        },

        {
          label: 'Reset position',

          click: () => {
            if (win) {
              win.webContents.send(
                'reset-position'
              );
            }
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

    tray.setContextMenu(
      menu
    );

    // Double-click tray icon.
    tray.on(
      'double-click',
      () => {
        if (!win) return;

        if (win.isMinimized()) {
          win.restore();
        }

        win.showInactive();
      }
    );
  }

  // ----------------------------------------------------------
  // App ready
  // ----------------------------------------------------------

  app.whenReady().then(() => {

    // --------------------------------------------------------
    // Windows startup
    // --------------------------------------------------------

    if (
      process.platform === 'win32' &&
      app.isPackaged
    ) {
      app.setLoginItemSettings({
        openAtLogin: true
      });
    }

    // --------------------------------------------------------
    // macOS startup
    // --------------------------------------------------------

    if (
      process.platform === 'darwin' &&
      app.isPackaged &&
      typeof app.setLoginItemSettings === 'function'
    ) {
      try {
        app.setLoginItemSettings({
          openAtLogin: true
        });
      } catch (error) {
        console.warn(
          'macOS login item setup failed:',
          error
        );
      }

      // Keep utility app out of normal Dock when supported.
      if (
        typeof app.setActivationPolicy === 'function'
      ) {
        try {
          app.setActivationPolicy(
            'accessory'
          );
        } catch (error) {
          console.warn(
            'macOS activation policy failed:',
            error
          );
        }
      }
    }

    // --------------------------------------------------------
    // Linux startup
    // --------------------------------------------------------

    setupLinuxAutostart();

    // --------------------------------------------------------
    // Create app
    // --------------------------------------------------------

    createWindow();

    // --------------------------------------------------------
    // Create tray
    // --------------------------------------------------------

    try {
      createTray();
    } catch (error) {
      console.error(
        'Tray creation failed:',
        error
      );
    }

    // --------------------------------------------------------
    // Start global cursor tracking
    // --------------------------------------------------------

    startCursorTracking();

    // --------------------------------------------------------
    // Start auto updater
    // --------------------------------------------------------

    setupAutoUpdater();

    // --------------------------------------------------------
    // macOS activation
    // --------------------------------------------------------

    app.on(
      'activate',
      () => {
        if (
          BrowserWindow
            .getAllWindows()
            .length === 0
        ) {
          createWindow();
        }
      }
    );
  });

  // ----------------------------------------------------------
  // Clean exit
  // ----------------------------------------------------------

  app.on(
    'before-quit',
    () => {
      stopCursorTracking();

      if (tray) {
        tray.destroy();
        tray = null;
      }
    }
  );

  // ----------------------------------------------------------
  // Window closed
  // ----------------------------------------------------------

  app.on(
    'window-all-closed',
    () => {
      if (
        process.platform !== 'darwin'
      ) {
        app.quit();
      }
    }
  );
}