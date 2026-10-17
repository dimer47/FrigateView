import { defineStore } from 'pinia'

// Réglages gardés par le processus principal (fichier settings.json du dossier utilisateur)
export const useAppSettings = defineStore('appSettings', {
  state: () => ({ s: null, open: false, tab: 'notif' }),
  actions: {
    async init() {
      this.s = await window.native.getSettings()
      window.native.onSettings((v) => (this.s = v))
      window.native.onOpenSettings(() => this.show())
    },
    async set(patch) { this.s = await window.native.setSettings(patch) },
    show(tab) { if (tab) this.tab = tab; this.open = true }
  }
})
