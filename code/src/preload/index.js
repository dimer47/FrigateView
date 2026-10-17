import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('native', {
  http: (req) => ipcRenderer.invoke('http', req),
  probeCert: (host, port) => ipcRenderer.invoke('cert:probe', { host, port }),
  trustCert: (host, fingerprint) => ipcRenderer.invoke('cert:trust', { host, fingerprint }),
  logout: (origin) => ipcRenderer.invoke('auth:logout', { origin }),
  saveSecret: (value) => ipcRenderer.invoke('secret:save', value),
  loadSecret: () => ipcRenderer.invoke('secret:load'),
  clearSecret: () => ipcRenderer.invoke('secret:clear')
})
