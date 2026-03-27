/**
 * ClawSuite Electron Preload Script
 * Exposes safe IPC bridge to renderer
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('clawsuite', {
  // Gateway management
  gateway: {
    check: () => ipcRenderer.invoke('gateway:check'),
    install: () => ipcRenderer.invoke('gateway:install'),
    start: () => ipcRenderer.invoke('gateway:start'),
    restart: () => ipcRenderer.invoke('gateway:restart'),
    connect: (url: string) => ipcRenderer.invoke('gateway:connect', url),
  },

  // Onboarding
  onboarding: {
    complete: (config: { mode: string; gatewayUrl: string }) =>
      ipcRenderer.invoke('onboarding:complete', config),
  },

  // App info
  app: {
    version: process.env.npm_package_version || '3.2.0',
    platform: process.platform,
    isElectron: true,
  },
})

// Gateway lifecycle bridge — used by GatewayStatusToast
// We keep a map of user callbacks → wrapped IPC listeners so we can remove them properly.
const _gatewayListenerMap = new Map<Function, Parameters<typeof ipcRenderer.on>[1]>()

contextBridge.exposeInMainWorld('gatewayBridge', {
  onStatusChange: (callback: (data: { state: string; message: string }) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, data: { state: string; message: string }) => callback(data)
    _gatewayListenerMap.set(callback, wrapped)
    ipcRenderer.on('gateway:status', wrapped)
  },
  requestRestart: () => ipcRenderer.send('gateway:restart'),
  removeStatusListener: (callback: (data: { state: string; message: string }) => void) => {
    const wrapped = _gatewayListenerMap.get(callback)
    if (wrapped) {
      ipcRenderer.removeListener('gateway:status', wrapped)
      _gatewayListenerMap.delete(callback)
    }
  },
})
