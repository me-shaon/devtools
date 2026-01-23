// src-electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (channel, ...args) => {
    const validChannels = ["app-version", "get-path"];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel ${channel} is not allowed`));
  },
  on: (channel, callback) => {
    const validChannels = ["update-available", "update-downloaded"];
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
    return () => {
    };
  },
  platform: process.platform,
  version: process.versions.electron
});
