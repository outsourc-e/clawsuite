"use strict";
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  hideQuickChat: () => ipcRenderer.send('quick-chat:hide'),
});
