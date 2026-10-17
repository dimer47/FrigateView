import { contextBridge, ipcRenderer } from 'electron'

const on = (channel, cb) => {
  const h = (_e, v) => cb(v)
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

contextBridge.exposeInMainWorld('native', {
  http: (req) => ipcRenderer.invoke('http', req),
  probeCert: (host, port) => ipcRenderer.invoke('cert:probe', { host, port }),
  trustCert: (host, fingerprint) => ipcRenderer.invoke('cert:trust', { host, fingerprint }),
  logout: (origin) => ipcRenderer.invoke('auth:logout', { origin }),
  saveSecret: (value) => ipcRenderer.invoke('secret:save', value),
  loadSecret: () => ipcRenderer.invoke('secret:load'),
  clearSecret: () => ipcRenderer.invoke('secret:clear'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onSettings: (cb) => on('settings:changed', cb),
  onOpenSettings: (cb) => on('settings:open', cb),
  notify: (n) => ipcRenderer.invoke('notify', n),
  isFocused: () => ipcRenderer.invoke('app:focused'),
  onNotificationClick: (cb) => on('notification:click', cb),
  setTrayStatus: (text) => ipcRenderer.invoke('tray:status', text),
  listScreens: () => ipcRenderer.invoke('screens:list'),
  applyScreens: (conf) => ipcRenderer.invoke('screens:apply', conf),
  identifyScreens: () => ipcRenderer.invoke('screens:identify'),
  onWallLayout: (cb) => on('wall:layout', cb),
  getMetrics: () => ipcRenderer.invoke('metrics:get'),
  setMenuState: (st) => ipcRenderer.invoke('menu:state', st),
  onMenu: (cb) => on('menu:command', cb)
})
