"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const path_2 = require("path");
const electron_updater_1 = __importDefault(require("electron-updater"));
const { autoUpdater } = electron_updater_1.default;
const __filename = (0, url_1.fileURLToPath)(import.meta.url);
const __dirname = (0, path_2.dirname)(__filename);
let win = null;
let tray = null;
const isDev = !electron_1.app.isPackaged;
function createWindow() {
    win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: "#191919",
        show: false,
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.mjs"),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
        },
    });
    // Show window when ready to prevent visual flash
    win.once("ready-to-show", () => {
        win?.show();
    });
    const url = isDev
        ? "http://localhost:8080"
        : `file://${path_1.default.join(__dirname, "../dist/index.html")}`;
    win.loadURL(url);
    // Open DevTools in development
    if (isDev) {
        win.webContents.openDevTools();
    }
    // Handle external links
    win.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: "deny" };
    });
    win.on("closed", () => {
        win = null;
    });
}
function createTray() {
    // Note: You'll need to add a tray icon at src-electron/assets/tray.png
    // For now, we'll skip tray creation if the icon doesn't exist
    const trayIconPath = path_1.default.join(__dirname, "assets/tray.png");
    // Only create tray if icon exists (we can add this later)
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
electron_1.app.whenReady().then(() => {
    createWindow();
    createTray();
    if (!isDev) {
        autoUpdater.checkForUpdates();
    }
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
electron_1.app.on("activate", () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
// Auto Update UX
autoUpdater.autoDownload = false;
autoUpdater.setFeedURL({
    provider: "github",
    owner: "ahmedshamim",
    repo: "devtools",
});
autoUpdater.on("update-available", () => {
    electron_1.dialog
        .showMessageBox({
        type: "info",
        title: "Update available",
        message: "A new version of DevTools is available. Update now?",
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
    electron_1.dialog
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
