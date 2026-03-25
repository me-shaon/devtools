import { app, BrowserWindow, dialog, shell } from "electron";
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

const isDev = !app.isPackaged;

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

// Auto Update UX
autoUpdater.autoDownload = false;
autoUpdater.setFeedURL({
  provider: "github",
  owner: "me-shaon",
  repo: "devtools",
});

autoUpdater.on("update-available", () => {
  dialog
    .showMessageBox({
      type: "info",
      title: "Update available",
      message: `A new version of ${appName} is available. Update now?`,
      buttons: ["Update", "Later"],
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
});

autoUpdater.on("update-not-available", () => {
  // No update available - silent
});

autoUpdater.on("update-downloaded", () => {
  dialog
    .showMessageBox({
      type: "info",
      title: "Update ready",
      message: "Restart to install update?",
      buttons: ["Restart", "Later"],
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
});

autoUpdater.on("error", (error) => {
  console.error("Auto-updater error:", error);
});
