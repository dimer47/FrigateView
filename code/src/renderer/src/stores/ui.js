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

export const FITS = ['contain', 'cover', 'fill']

export const useUiStore = defineStore('ui', {
  state: () => ({
    sidebar: load('fv-ui', {}).sidebar ?? true,
    liveMode: load('fv-ui', {}).liveMode ?? 'webrtc', // webrtc | snapshot
    showStats: load('fv-ui', {}).showStats ?? false,
    showUser: load('fv-ui', {}).showUser ?? true,
    // Image dans la case : contain = entière, cover = remplir en rognant, fill = étirer
    fit: load('fv-ui', {}).fit ?? (load('fv-ui', {}).cover ? 'cover' : 'contain'),
    // Flux du direct : auto (SD dès 4 cases) | high | low ; sans effet sur les caméras sans sous-flux
    quality: load('fv-ui', {}).quality ?? 'auto',
    statFields: loadFields(),
    showBoxes: load('fv-ui', {}).showBoxes ?? true, // cadres de détection sur la meilleure image
    expand: false,
    layoutDialog: undefined, // undefined = fermé, null = création, id = édition
    helpOpen: false,
    facesOpen: false,
    platesOpen: false,
    searchOpen: false,
    searchSimilar: null, // identifiant d'objet suivi : « Trouver des similaires »
    toast: null
  }),
  actions: {
    persist() { save('fv-ui', { sidebar: this.sidebar, liveMode: this.liveMode, showStats: this.showStats, showUser: this.showUser, fit: this.fit, quality: this.quality, statFields: this.statFields, showBoxes: this.showBoxes }) },
    toggleSidebar() { this.sidebar = !this.sidebar; this.persist() },
    setLiveMode(m) { this.liveMode = m; this.persist() },
    setStatField(group, key, on) { this.statFields[group][key] = on; this.persist() },
    toggleUser() { this.showUser = !this.showUser; this.persist() },
    setFit(f) { this.fit = f; this.persist() },
    setQuality(q) { this.quality = q; this.persist() },
    cycleFit() { this.setFit(FITS[(FITS.indexOf(this.fit) + 1) % FITS.length]) },
    toggleStats() { this.showStats = !this.showStats; this.persist() },
    notify(text, action) {
      clearTimeout(this._t)
      this.toast = { text, action }
      this._t = setTimeout(() => (this.toast = null), action ? 6000 : 2500)
    }
  }
})
