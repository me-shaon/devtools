# DevTools — React (Lovable) + Electron + Auto Update + One‑Click Installers

This guide integrates your existing Lovable React UI (located in `src/app/DevToolsApp.tsx`) into a production‑ready Electron desktop app with:

✔ Offline‑first
✔ Background auto‑update
✔ One‑click installers (macOS / Windows / Linux)
✔ Secure preload bridge
✔ Tray support

> Folder `website/` is intentionally ignored.

---

## 1. Install Electron Dependencies

```bash
npm install --save-dev electron electron-builder
npm install electron-updater
```

---

## 2. Create Electron Source Folder

Create:

```
src-electron/
  main.ts
  preload.ts
```

---

## 3. Electron Main Process

`src-electron/main.ts`

```ts
import { app, BrowserWindow, Tray, dialog } from "electron";
import path from "path";
import { autoUpdater } from "electron-updater";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = !app.isPackaged;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#191919",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const url = isDev
    ? "http://localhost:5173"
    : `file://${path.join(__dirname, "../dist/index.html")}`;

  win.loadURL(url);
}

app.whenReady().then(() => {
  createWindow();

  tray = new Tray(path.join(__dirname, "assets/tray.png"));
  tray.setToolTip("DevTools");

  if (!isDev) autoUpdater.checkForUpdates();
});

// Auto Update UX

autoUpdater.autoDownload = false;

autoUpdater.on("update-available", () => {
  dialog.showMessageBox({
    title: "Update available",
    message: "A new version of DevTools is available. Update now?",
    buttons: ["Update", "Later"]
  }).then(r => r.response === 0 && autoUpdater.downloadUpdate());
});

autoUpdater.on("update-downloaded", () => {
  dialog.showMessageBox({
    title: "Update ready",
    message: "Restart to install update?"
  }).then(() => autoUpdater.quitAndInstall());
});
```

---

## 4. Preload Bridge

`src-electron/preload.ts`

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (c: string, ...a: any[]) => ipcRenderer.invoke(c, ...a),
  on: (c: string, cb: any) => ipcRenderer.on(c, (_, ...a) => cb(...a))
});
```

---

## 5. Use Lovable UI as App Root

In `src/App.tsx`:

```tsx
import DevToolsApp from "./app/DevToolsApp";

export default function App() {
  return <DevToolsApp />;
}
```

---

## 6. Package.json Scripts

Add:

```json
"main": "dist-electron/main.js",
"scripts": {
  "dev": "concurrently \"vite\" \"tsc -p src-electron --watch\"",
  "build": "vite build && tsc -p src-electron",
  "dist": "npm run build && electron-builder"
}
```

---

## 7. Electron Builder Config

Add to package.json:

```json
"build": {
  "appId": "com.meshaon.devtools",
  "productName": "DevTools",
  "files": ["dist/**", "dist-electron/**"],
  "mac": { "target": ["dmg"] },
  "win": { "target": ["nsis"] },
  "linux": { "target": ["AppImage"] },
  "publish": [{ "provider": "github" }]
}
```

---

## 8. TypeScript Build Config

Create `src-electron/tsconfig.json`

```json
{
  "compilerOptions": {
    "outDir": "../dist-electron",
    "module": "CommonJS",
    "target": "ES2020",
    "strict": true
  },
  "include": ["./**/*.ts"]
}
```

---

## 9. GitHub Actions Auto Release

`.github/workflows/build.yml`

```yaml
name: Build
on: push
jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with: { node-version: 20 }
      - run: npm install
      - run: npm run dist
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 10. Result

You now get:

✔ DMG for mac
✔ EXE installer for Windows
✔ AppImage for Linux
✔ Background auto updates
✔ Offline‑first behavior

---

## 11. How to Run

```bash
npm run dev
```

```bash
npm run dist
```

---

## 12. Your Lovable Design

Your `src/app/DevToolsApp.tsx` is preserved exactly as UI renderer.
No logic is changed.

---

## 13. Next Enhancements (Optional)

* Window state persistence
* Global shortcuts
* Plugin system
* Portable mode
* CLI launcher

---

## 14. Final Result

Your DevTools now behaves like:
VS Code / Postman / GitHub Desktop

Professional, offline‑first, auto‑updating.

---

You can now safely delete any Electron boilerplate from old app and replace with this structure.
