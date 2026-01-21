import { contextBridge, ipcRenderer } from "electron";

/**
 * Expose a safe API to the renderer process via contextBridge
 * This provides a secure way for the renderer to communicate with the main process
 */
contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (channel: string, ...args: unknown[]) => {
    // Whitelist allowed channels
    const validChannels = ["app-version", "get-path"];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel ${channel} is not allowed`));
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    // Whitelist allowed channels
    const validChannels = ["update-available", "update-downloaded"];
    if (validChannels.includes(channel)) {
      const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
        callback(...args);
      ipcRenderer.on(channel, subscription);

      // Return unsubscribe function
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
    return () => {};
  },
  platform: process.platform,
  version: process.versions.electron,
});

// TypeScript type declarations for the exposed API
export interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  platform: string;
  version: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
