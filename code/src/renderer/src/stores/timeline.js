import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { getRecordings, getReviews } from '@/services/frigate'
import { load, save } from './storage'

export const MIN = 60e3
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR
const RETENTION = 2 * DAY // affichage limité ; la rétention réelle dépend de la config Frigate

// Objet détecté → famille affichée
const ANIMALS = ['dog', 'cat', 'bird', 'horse', 'bear', 'cow', 'sheep', 'deer', 'fox']
const VEHICLES = ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'boat', 'license_plate']
export function reviewType(r) {
  const objs = r.data?.objects || []
  if (objs.includes('person') || objs.includes('face')) return 'person'
  if (objs.some((o) => VEHICLES.includes(o))) return 'car'
  if (objs.some((o) => ANIMALS.includes(o))) return 'animal'
  return 'other'
}

// Segments de 10 s → plages continues (coupure si trou > 2 s)
export function mergeRanges(list) {
  const out = []
  for (const s of list) {
    const last = out[out.length - 1]
    if (last && s.s - last.e <= 2000) last.e = Math.max(last.e, s.e)
    else out.push({ s: s.s, e: s.e })
  }
  return out
}

export const useTimelineStore = defineStore('timeline', {
  state: () => ({
    view: { start: Date.now() - 3 * HOUR + 15 * MIN, end: Date.now() + 15 * MIN },
    live: true,
    time: Date.now(),
    playing: true,
    speeds: [0.5, 1, 2, 4, 8, 16],
    speedIdx: 1,
    sync: load('fv-tl', {}).sync ?? true,
    playbackCams: null, // null = toutes les caméras du layout ; sinon [id]
    filters: { person: true, car: true, animal: true, other: true, motion: true },
    height: load('fv-tl', {}).height ?? 250,
    visible: load('fv-tl', {}).visible ?? true,
    chunks: {}, // `${cam}:${heure}` → { rec, motion, reviews, at }
    loading: 0
  }),
  getters: {
    cursor: (s) => (s.live ? Date.now() : s.time),
    speed: (s) => s.speeds[s.speedIdx],
    isPlayback: (s) => (cam) => !s.live && (s.playbackCams === null || s.playbackCams.includes(cam))
  },
  actions: {
    persist() { save('fv-tl', { sync: this.sync, height: this.height, visible: this.visible }) },

    /* ---------- Lecture ---------- */
    seek(t, cam = null, center = false) {
      const now = Date.now()
      t = Math.max(now - RETENTION, Math.min(t, now))
      if (now - t < 2000) return this.goLive()
      this.live = false
      this.time = t
      this.playbackCams = cam && !this.sync ? [cam] : null
      const span = this.view.end - this.view.start
      if (center || t < this.view.start || t > this.view.end) { this.view.start = t - span / 2; this.view.end = t + span / 2 }
    },
    goLive() {
      this.live = true
      this.playing = true
      this.playbackCams = null
      const span = this.view.end - this.view.start, now = Date.now()
      this.view.end = now + span * 0.08
      this.view.start = this.view.end - span
    },
    togglePlay() {
      if (this.live) { this.time = Date.now(); this.live = false; this.playing = false } // pause en direct = figer
      else this.playing = !this.playing
    },
    skip(sec) { this.seek(this.cursor + sec * 1000, this.playbackCams?.[0] || null) },
    setSpeed(d) { this.speedIdx = Math.max(0, Math.min(this.speeds.length - 1, this.speedIdx + d)) },
    toggleSync() { this.sync = !this.sync; if (this.sync) this.playbackCams = null; this.persist() },

    // Horloge maîtresse : chaque case vidéo se cale sur `time`
    tick(dt) {
      const now = Date.now()
      if (!this.live && this.playing) {
        this.time += dt * this.speed
        if (this.time >= now - 1000) return this.goLive()
      }
      if (this.live && now > this.view.end - (this.view.end - this.view.start) * 0.04) {
        const span = this.view.end - this.view.start
        this.view.end = now + span * 0.08
        this.view.start = this.view.end - span
      }
    },

    /* ---------- Vue ---------- */
    zoom(f, around) {
      const span = this.view.end - this.view.start
      const ns = Math.max(5 * MIN, Math.min(RETENTION, span * f))
      const c = around ?? this.cursor
      const ratio = (c - this.view.start) / span
      this.view.start = c - ns * ratio
      this.view.end = this.view.start + ns
    },
    pan(dt) { this.view.start += dt; this.view.end += dt },

    /* ---------- Données (par tranches d'une heure, mises en cache) ---------- */
    async ensureData(server, cams) {
      const now = Date.now()
      const from = Math.floor(Math.max(this.view.start, now - RETENTION) / HOUR)
      const to = Math.floor(Math.min(this.view.end, now) / HOUR)
      for (const cam of cams) {
        // heures manquantes, ou heure en cours vieille de plus de 30 s
        const missing = []
        for (let h = from; h <= to; h++) {
          const c = this.chunks[`${cam}:${h}`]
          if (!c || (h === Math.floor(now / HOUR) && now - c.at > 30e3)) missing.push(h)
        }
        if (!missing.length) continue
        // regroupe les heures consécutives : une requête par bloc
        const groups = []
        for (const h of missing) { const g = groups[groups.length - 1]; if (g && g[1] === h - 1) g[1] = h; else groups.push([h, h]) }
        for (const [a, b] of groups) this.fetchBlock(server, cam, a, b)
      }
    },
    async fetchBlock(server, cam, h0, h1) {
      const key = `${cam}:${h0}-${h1}`
      this._pending ||= new Set()
      if (this._pending.has(key)) return
      this._pending.add(key)
      this.loading++
      try {
        const after = (h0 * HOUR) / 1000, before = ((h1 + 1) * HOUR) / 1000
        const [recs, reviews] = await Promise.all([getRecordings(server, cam, after, before), getReviews(server, [cam], after, before)])
        const at = Date.now()
        this.pruneChunks(at)
        for (let h = h0; h <= h1; h++) {
          const hs = h * HOUR, he = hs + HOUR
          const segs = recs.map((r) => ({ s: r.start_time * 1000, e: r.end_time * 1000, m: r.motion > 0 })).filter((r) => r.e > hs && r.s < he).sort((a, b) => a.s - b.s)
          this.chunks[`${cam}:${h}`] = markRaw({
            at,
            rec: mergeRanges(segs),
            motion: mergeRanges(segs.filter((x) => x.m)),
            reviews: reviews.filter((r) => r.camera === cam && r.start_time * 1000 < he && (r.end_time ?? at / 1000) * 1000 > hs)
              .map((r) => ({ id: r.id, s: r.start_time * 1000, e: (r.end_time ?? at / 1000) * 1000, type: reviewType(r), severity: r.severity }))
          })
        }
      } catch { /* réessayé au prochain affichage */ } finally {
        this._pending.delete(key)
        this.loading--
      }
    },
    // Cache : heures sorties de la fenêtre affichable (2 jours + marge) retirées
    pruneChunks(now = Date.now()) {
      const oldest = Math.floor((now - RETENTION) / HOUR) - 1
      for (const k of Object.keys(this.chunks)) if (Number(k.slice(k.lastIndexOf(':') + 1)) < oldest) delete this.chunks[k]
    },
    // Données d'une caméra sur la vue courante
    rangesFor(cam) {
      const out = { rec: [], motion: [], reviews: [] }
      const from = Math.floor(this.view.start / HOUR), to = Math.floor(this.view.end / HOUR)
      const seen = new Set()
      for (let h = from; h <= to; h++) {
        const c = this.chunks[`${cam}:${h}`]
        if (!c) continue
        out.rec.push(...c.rec)
        out.motion.push(...c.motion)
        for (const r of c.reviews) if (!seen.has(r.id)) { seen.add(r.id); out.reviews.push(r) }
      }
      return out
    },
    hasRecording(cam, t) {
      const c = this.chunks[`${cam}:${Math.floor(t / HOUR)}`]
      return c ? c.rec.some((r) => r.s <= t && t < r.e) : null // null = inconnu
    }
  }
})
