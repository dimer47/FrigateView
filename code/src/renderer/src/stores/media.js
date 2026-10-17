// Captures d'image, exports de clips (téléchargements suivis) et son des caméras
import { defineStore } from 'pinia'
import { useServerStore } from './server'
import { useUiStore } from './ui'
import { clipUrl, latestJpgUrl } from '@/services/frigate'
import { t } from '@/i18n'

const pad = (n) => String(n).padStart(2, '0')
export function stamp(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').trim()

// Image affichée par chaque case (vidéo directe, relecture ou image fixe), enregistrée par CameraCell
const frames = new Map() // camId → () => { el, time }

let seq = 0
let progressHooked = false

export const useMediaStore = defineStore('media', {
  state: () => ({
    audioCam: null,
    hasAudio: {}, // caméra → le flux direct contient du son // caméra dont le son est activé (une seule à la fois)
    exportOpen: null, // null = fermé ; { cams, start, end } = fenêtre d'export ouverte
    downloads: [] // { id, name, path, loaded, total, state: running | done | error | canceled }
  }),
  actions: {
    registerFrame(cam, getter) { frames.set(cam, getter); return () => frames.get(cam) === getter && frames.delete(cam) },
    toggleAudio(cam) { this.audioCam = this.audioCam === cam ? null : cam },

    /* ---- Capture : l'image affichée, à sa résolution d'origine ---- */
    async capture(cam) {
      const server = useServerStore(), ui = useUiStore()
      const name = `${safe(server.camById(cam)?.name || cam)}_${stamp(frames.get(cam)?.()?.time || Date.now())}.jpg`
      const f = frames.get(cam)?.()
      const path = await window.native.chooseSave(name, 'image')
      if (!path) return
      let ok = false
      const el = f?.el
      const w = el?.videoWidth || 0, h = el?.videoHeight || 0
      if (w && h) {
        // Vidéo (direct WebRTC ou relecture) : copie de l'image affichée
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d').drawImage(el, 0, 0, w, h)
        const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92))
        ok = blob && (await window.native.writeFile(path, await blob.arrayBuffer()))
      } else {
        // Mode images : on demande à Frigate l'image pleine résolution
        ok = (await window.native.download(`cap${++seq}`, latestJpgUrl(server.server, cam), path)).ok
      }
      ui.notify(ok ? t('media.captured') : t('media.captureFailed'), ok ? { label: t('media.show'), run: () => window.native.reveal(path) } : undefined)
    },

    /* ---- Export de clips ---- */
    openExport(opts) { this.exportOpen = opts },
    async exportClips(cams, start, end) {
      const server = useServerStore()
      const name = (cam) => `${safe(server.camById(cam)?.name || cam)}_${stamp(start)}.mp4`
      let targets
      if (cams.length === 1) {
        const p = await window.native.chooseSave(name(cams[0]), 'video')
        if (!p) return false
        targets = [[cams[0], p]]
      } else {
        const dir = await window.native.chooseDir()
        if (!dir) return false
        targets = cams.map((c) => [c, window.native.pathJoin(dir, name(c))])
      }
      this.hookProgress()
      this.exportOpen = null
      for (const [cam, path] of targets) this.download(clipUrl(server.server, cam, start / 1000, end / 1000), path, name(cam))
      return true
    },
    async download(url, path, name) {
      const id = `dl${++seq}`
      this.downloads.push({ id, name, path, loaded: 0, total: 0, state: 'running' })
      const r = await window.native.download(id, url, path)
      const d = this.downloads.find((x) => x.id === id)
      if (d) d.state = r.ok ? 'done' : r.error === 'aborted' ? 'canceled' : 'error'
      if (d && r.ok) d.loaded = r.size
      if (d && !r.ok) d.error = r.status === 404 || r.status === 500 ? t('media.noRecording') : r.error || `HTTP ${r.status}`
    },
    cancel(id) { window.native.cancelDownload(id) },
    clear() { this.downloads = this.downloads.filter((d) => d.state === 'running') },
    hookProgress() {
      if (progressHooked) return
      progressHooked = true
      window.native.onDownloadProgress(({ id, loaded, total }) => {
        const d = this.downloads.find((x) => x.id === id)
        if (d) Object.assign(d, { loaded, total })
      })
    }
  }
})
