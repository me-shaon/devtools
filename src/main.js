const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

const isDev = process.argv.includes('--dev');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile('src/renderer/index.html');

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            createWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'JSON Viewer', click: () => mainWindow.webContents.send('navigate-to', 'json-viewer') },
        { label: 'Text Compare', click: () => mainWindow.webContents.send('navigate-to', 'text-compare') },
        { label: 'Case Converter', click: () => mainWindow.webContents.send('navigate-to', 'case-converter') },
        { label: 'UUID Generator', click: () => mainWindow.webContents.send('navigate-to', 'uuid-generator') },
        { label: 'Base64 Converter', click: () => mainWindow.webContents.send('navigate-to', 'base64-converter') },
        { label: 'JWT Decoder', click: () => mainWindow.webContents.send('navigate-to', 'jwt-decoder') },
        { type: 'separator' },
        { label: 'SQL Formatter', click: () => mainWindow.webContents.send('navigate-to', 'sql-formatter') },
        { label: 'Markdown Editor', click: () => mainWindow.webContents.send('navigate-to', 'markdown-editor') },
        { label: 'Code Playground', click: () => mainWindow.webContents.send('navigate-to', 'code-playground') },
        { type: 'separator' },
        { label: 'Hash Generator', click: () => mainWindow.webContents.send('navigate-to', 'hash-generator') },
        { label: 'QR Code Generator', click: () => mainWindow.webContents.send('navigate-to', 'qr-generator') }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            shell.openExternal('https://github.com');
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('save-file', async (event, data) => {
  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: data.filters || []
  });

  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, data.content);
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Save cancelled' };
});

ipcMain.handle('open-file', async (event, filters) => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: filters || [],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf8');
      return { success: true, content, path: result.filePaths[0] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Open cancelled' };
});