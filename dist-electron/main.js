// src-electron/main.ts
import { app, BrowserWindow, dialog, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import electronUpdater from "electron-updater";
var { autoUpdater } = electronUpdater;
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var win = null;
var isDev = !app.isPackaged;
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
      webSecurity: true
    }
  });
  win.once("ready-to-show", () => {
    win?.show();
  });
  const url = isDev ? "http://localhost:8080" : `file://${path.join(__dirname, "../dist/index.html")}`;
  win.loadURL(url);
  if (isDev) {
    win.webContents.openDevTools();
  }
  win.webContents.setWindowOpenHandler(({ url: url2 }) => {
    shell.openExternal(url2);
    return { action: "deny" };
  });
  win.on("closed", () => {
    win = null;
  });
}
function createTray() {
  const trayIconPath = path.join(__dirname, "assets/tray.png");
}
app.whenReady().then(() => {
  createWindow();
  createTray();
  if (!isDev) {
    autoUpdater.checkForUpdates();
  }
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
autoUpdater.autoDownload = false;
autoUpdater.setFeedURL({
  provider: "github",
  owner: "ahmedshamim",
  repo: "devtools"
});
autoUpdater.on("update-available", () => {
  dialog.showMessageBox({
    type: "info",
    title: "Update available",
    message: "A new version of DevTools is available. Update now?",
    buttons: ["Update", "Later"]
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });
});
autoUpdater.on("update-not-available", () => {
});
autoUpdater.on("update-downloaded", () => {
  dialog.showMessageBox({
    type: "info",
    title: "Update ready",
    message: "Restart to install update?",
    buttons: ["Restart", "Later"]
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});
autoUpdater.on("error", (error) => {
  console.error("Auto-updater error:", error);
});
