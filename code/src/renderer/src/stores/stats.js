import { defineStore } from 'pinia'
import { markRaw } from 'vue'

// Statistiques affichées sur demande : débit reçu par caméra, et charge de l'application / du PC.
// Les images (mode « Images 1/s ») sont mesurées par l'API Resource Timing du navigateur.
const n = (v) => (v == null || v === '' ? null : Number(v))

// Statistiques du serveur Frigate (VM entière, go2rtc, enregistrement, disque, détecteur)
export function serverSummary(st) {
  if (!st) return null
  const rec = st.service?.storage?.['/media/frigate/recordings']
  const det = Object.values(st.detectors || {})[0]
  return {
    cpu: n(st.cpu_usages?.['frigate.full_system']?.cpu),
    mem: n(st.cpu_usages?.['frigate.full_system']?.mem),
    go2rtc: n(st.processes?.go2rtc?.cpu),
    record: n(st.processes?.recording?.cpu),
    storageUsed: rec ? rec.used / 1024 : null, // Go
    storageTotal: rec ? rec.total / 1024 : null,
    inference: det ? n(det.inference_speed) : null, // ms
    uptime: n(st.service?.uptime), // s
    version: st.service?.version, latest: st.service?.latest_version
  }
}
export function serverCamera(st, cam) {
  const c = st?.cameras?.[cam]
  if (!c) return null
  return {
    fps: n(c.camera_fps), expected: n(c.expected_fps), quality: c.connection_quality || null,
    reconnects: n(c.reconnects_last_hour), cpu: [c.ffmpeg_cpu, c.capture_cpu, c.detect_cpu].reduce((a, v) => a + (n(v) || 0), 0)
  }
}

export const useStatsStore = defineStore('stats', {
  state: () => ({ cams: {}, metrics: null }),
  getters: {
    totalKbps: (s) => Object.values(s.cams).reduce((a, c) => a + (c.kbps || 0), 0)
  },
  actions: {
    report(cam, data) { this.cams[cam] = { ...data, at: Date.now() } },
    forget(cam) { delete this.cams[cam] },
    start() {
      if (this._timer) return
      // octets des images reçues, par caméra (adresse …/api/<caméra>/latest.webp)
      this._imgBytes = {}
      this._obs = markRaw(new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const m = e.name.match(/\/api\/([^/]+)\/latest\./)
          if (m) { const c = decodeURIComponent(m[1]); this._imgBytes[c] = (this._imgBytes[c] || 0) + (e.encodedBodySize || e.transferSize || 0) }
        }
      }))
      this._obs.observe({ type: 'resource', buffered: false })
      const poll = async () => {
        this.metrics = await window.native.getMetrics()
        const now = Date.now()
        for (const [k, c] of Object.entries(this.cams)) if (now - c.at > 6000) delete this.cams[k] // case fermée
      }
      poll()
      this._timer = setInterval(poll, 2000)
    },
    stop() {
      clearInterval(this._timer); this._timer = null
      this._obs?.disconnect()
      this.cams = {}; this.metrics = null
    },
    // Octets d'images reçus depuis le dernier appel, pour une caméra
    takeImageBytes(cam) { const b = this._imgBytes?.[cam] || 0; if (this._imgBytes) this._imgBytes[cam] = 0; return b }
  }
})

// Formats lisibles
export const fmtRate = (kbps, locale) => (kbps >= 1000 ? `${(kbps / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mb/s` : `${Math.round(kbps)} kb/s`)
