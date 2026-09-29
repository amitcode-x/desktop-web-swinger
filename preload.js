const {
  contextBridge,
  ipcRenderer
} = require('electron');

contextBridge.exposeInMainWorld(
  'desktopPet',
  {
    // Enable / disable native mouse hit-testing.
    setIgnoreMouse: (ignore) =>
      ipcRenderer.send(
        'set-ignore-mouse',
        Boolean(ignore)
      ),

    // Work-area information.
    getWorkArea: () =>
      ipcRenderer.invoke(
        'get-work-area'
      ),

    // ----------------------------------------------------------
    // Global cursor position
    // ----------------------------------------------------------
    //
    // Linux does not forward mouse movement to Chromium while
    // the transparent window is click-through.
    //
    // Main process sends the global cursor position here.
    //

    onGlobalCursor: (cb) => {
      const handler =
        (_event, point) => {
          cb(point);
        };

      ipcRenderer.on(
        'global-cursor',
        handler
      );

      // Cleanup function.
      return () => {
        ipcRenderer.removeListener(
          'global-cursor',
          handler
        );
      };
    },

    // ----------------------------------------------------------
    // Tray: pause / resume
    // ----------------------------------------------------------

    onSetPaused: (cb) => {
      const handler =
        (_event, value) => {
          cb(value);
        };

      ipcRenderer.on(
        'set-paused',
        handler
      );

      return () => {
        ipcRenderer.removeListener(
          'set-paused',
          handler
        );
      };
    },

    // ----------------------------------------------------------
    // Tray: reset position
    // ----------------------------------------------------------

    onResetPosition: (cb) => {
      const handler =
        () => {
          cb();
        };

      ipcRenderer.on(
        'reset-position',
        handler
      );

      return () => {
        ipcRenderer.removeListener(
          'reset-position',
          handler
        );
      };
    }
  }
);