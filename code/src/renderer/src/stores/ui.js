import { defineStore } from 'pinia'
import { load, save } from './storage'

export const useUiStore = defineStore('ui', {
  state: () => ({
    sidebar: load('fv-ui', {}).sidebar ?? true,
    liveMode: load('fv-ui', {}).liveMode ?? 'webrtc', // webrtc | snapshot
    expand: false,
    layoutDialog: undefined, // undefined = fermé, null = création, id = édition
    helpOpen: false,
    toast: null
  }),
  actions: {
    persist() { save('fv-ui', { sidebar: this.sidebar, liveMode: this.liveMode }) },
    toggleSidebar() { this.sidebar = !this.sidebar; this.persist() },
    setLiveMode(m) { this.liveMode = m; this.persist() },
    notify(text, action) {
      clearTimeout(this._t)
      this.toast = { text, action }
      this._t = setTimeout(() => (this.toast = null), action ? 6000 : 2500)
    }
  }
})
