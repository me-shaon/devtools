import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appName = app.getName();

let win: BrowserWindow | null = null;
let updateCheckTimeout: NodeJS.Timeout | null = null;
let updateState: {
  status:
    | "idle"
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error"
    | "unsupported";
  version?: string;
  progress?: number;
  message?: string;
} = {
  status: isDev ? "unsupported" : "idle",
};

const isDev = !app.isPackaged;

function sendUpdateState() {
  if (!win || win.isDestroyed()) {
    return;
  }

  win.webContents.send("update-status", updateState);
}

function scheduleUpdateCheck() {
  if (isDev || updateCheckTimeout) {
    return;
  }

  // Let the renderer settle before starting network/update work.
  updateCheckTimeout = setTimeout(() => {
    updateCheckTimeout = null;
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("Auto-updater check failed:", error);
    });
  }, 15000);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#191919",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Show window when ready to prevent visual flash
  win.once("ready-to-show", () => {
    win?.show();
    sendUpdateState();
    scheduleUpdateCheck();
  });

  const url = isDev
    ? "http://localhost:8080"
    : `file://${path.join(__dirname, "../dist/index.html")}`;

  win.loadURL(url);

  // Open Chromium devtools in development
  if (isDev) {
    win.webContents.openDevTools();
  }

  // Handle external links
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => {
    win = null;
  });
}

function createTray() {
  // Placeholder for future tray support.
  // tray = new Tray(trayIconPath);
  // tray.setToolTip("DevTools");
  // tray.on("click", () => {
  //   if (win) {
  //     if (win.isMinimized()) {
  //       win.restore();
  //     } else {
  //       win.focus();
  //     }
  //   } else {
  //     createWindow();
  //   }
  // });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  if (updateCheckTimeout) {
    clearTimeout(updateCheckTimeout);
    updateCheckTimeout = null;
  }
});

ipcMain.handle("app-version", () => app.getVersion());

ipcMain.handle("update-status", () => ({
  ...updateState,
  currentVersion: app.getVersion(),
}));

ipcMain.handle("check-for-updates", async () => {
  if (isDev) {
    updateState = {
      status: "unsupported",
      message: "Update checks are disabled in development builds.",
    };
    sendUpdateState();
    return { ...updateState, currentVersion: app.getVersion() };
  }

  updateState = {
    status: "checking",
  };
  sendUpdateState();

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    updateState = {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to check for updates.",
    };
    sendUpdateState();
  }

  return { ...updateState, currentVersion: app.getVersion() };
});

ipcMain.handle("download-update", async () => {
  if (isDev) {
    updateState = {
      status: "unsupported",
      message: "Updates are disabled in development builds.",
    };
    sendUpdateState();
    return false;
  }

  updateState = {
    ...updateState,
    status: "downloading",
    progress: updateState.progress ?? 0,
  };
  sendUpdateState();
  await autoUpdater.downloadUpdate();
  return true;
});

ipcMain.handle("install-update", () => {
  if (!isDev) {
    autoUpdater.quitAndInstall();
  }

  return true;
});

// Auto Update UX
autoUpdater.autoDownload = false;
autoUpdater.setFeedURL({
  provider: "github",
  owner: "me-shaon",
  repo: "devtools",
});

autoUpdater.on("checking-for-update", () => {
  updateState = {
    status: "checking",
  };
  sendUpdateState();
});

autoUpdater.on("update-available", (info) => {
  updateState = {
    status: "available",
    version: info.version,
  };
  sendUpdateState();
});

autoUpdater.on("update-not-available", () => {
  updateState = {
    status: "not-available",
  };
  sendUpdateState();
});

autoUpdater.on("download-progress", (progress) => {
  updateState = {
    ...updateState,
    status: "downloading",
    progress: progress.percent,
  };
  sendUpdateState();
});

autoUpdater.on("update-downloaded", (info) => {
  updateState = {
    status: "downloaded",
    version: info.version,
    progress: 100,
  };
  sendUpdateState();
});

autoUpdater.on("error", (error) => {
  console.error("Auto-updater error:", error);
  updateState = {
    status: "error",
    message: error.message,
  };
  sendUpdateState();
});
