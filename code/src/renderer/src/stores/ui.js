import { defineStore } from 'pinia'
import { load, save } from './storage'

// Éléments des statistiques, chacun affichable ou non (Réglages → Général)
export const STAT_FIELDS = {
  global: { total: true, appCpu: true, appMem: false, pcCpu: true, pcMem: false, srvCpu: true, srvMem: true, srvGo2rtc: false, srvRecord: false, srvStorage: true, srvDetector: false, srvUptime: false },
  camera: { rate: true, res: true, fps: true, source: false, srvFps: true, srvQuality: true, srvReconnects: false, srvCamCpu: false }
}
const loadFields = () => {
  const saved = load('fv-ui', {}).statFields || {}
  return { global: { ...STAT_FIELDS.global, ...saved.global }, camera: { ...STAT_FIELDS.camera, ...saved.camera } }
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    sidebar: load('fv-ui', {}).sidebar ?? true,
    liveMode: load('fv-ui', {}).liveMode ?? 'webrtc', // webrtc | snapshot
    showStats: load('fv-ui', {}).showStats ?? false,
    showUser: load('fv-ui', {}).showUser ?? true,
    cover: load('fv-ui', {}).cover ?? false, // remplir la case (image rognée) au lieu de l'afficher entière
    statFields: loadFields(),
    expand: false,
    layoutDialog: undefined, // undefined = fermé, null = création, id = édition
    helpOpen: false,
    toast: null
  }),
  actions: {
    persist() { save('fv-ui', { sidebar: this.sidebar, liveMode: this.liveMode, showStats: this.showStats, showUser: this.showUser, cover: this.cover, statFields: this.statFields }) },
    toggleSidebar() { this.sidebar = !this.sidebar; this.persist() },
    setLiveMode(m) { this.liveMode = m; this.persist() },
    setStatField(group, key, on) { this.statFields[group][key] = on; this.persist() },
    toggleUser() { this.showUser = !this.showUser; this.persist() },
    toggleCover() { this.cover = !this.cover; this.persist() },
    toggleStats() { this.showStats = !this.showStats; this.persist() },
    notify(text, action) {
      clearTimeout(this._t)
      this.toast = { text, action }
      this._t = setTimeout(() => (this.toast = null), action ? 6000 : 2500)
    }
  }
})
