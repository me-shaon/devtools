"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src-electron/preload.ts
var preload_exports = {};
module.exports = __toCommonJS(preload_exports);
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (channel, ...args) => {
    const validChannels = ["app-version", "get-path"];
    if (validChannels.includes(channel)) {
      return import_electron.ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel ${channel} is not allowed`));
  },
  on: (channel, callback) => {
    const validChannels = ["update-available", "update-downloaded"];
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      import_electron.ipcRenderer.on(channel, subscription);
      return () => {
        import_electron.ipcRenderer.removeListener(channel, subscription);
      };
    }
    return () => {
    };
  },
  platform: process.platform,
  version: process.versions.electron
});
