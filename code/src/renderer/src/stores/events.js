import { defineStore } from 'pinia'
import { getRecentReviews, markReviewed, thumbUrl, wsUrl } from '@/services/frigate'
import { reviewType, DAY } from './timeline'
import { load, save } from './storage'

const POLL_MS = 60e3 // filet de sécurité si le temps réel est coupé

export const TYPE_LABELS = { person: 'Personne', car: 'Véhicule', animal: 'Animal', other: 'Autre objet' }
export const TYPE_COLORS = { person: 'var(--color-bad)', car: 'var(--color-warn)', animal: 'var(--color-ok)', other: '#a78bfa' }

// Revue Frigate → événement affiché
function normalize(server, r) {
  return {
    id: r.id,
    cam: r.camera,
    s: r.start_time * 1000,
    e: r.end_time ? r.end_time * 1000 : null, // null = en cours
    type: reviewType(r),
    severity: r.severity,
    objects: r.data?.objects || [],
    subLabels: r.data?.sub_labels || [], // visages reconnus, plaques…
    zones: r.data?.zones || [],
    thumb: thumbUrl(server, r),
    seen: !!r.has_been_reviewed
  }
}

export const useEventsStore = defineStore('events', {
  state: () => ({
    items: [],
    sev: 'all', // all | alert | detection
    search: '',
    scopeLayout: load('fv-ev', {}).scopeLayout ?? true,
    visible: load('fv-ev', {}).visible ?? true,
    width: load('fv-ev', {}).width ?? 300,
    activeId: null,
    detailId: null,
    realtime: 'off', // off | on | down
    fresh: [] // ids arrivés récemment (surbrillance)
  }),
  getters: {
    unseenCount: (s) => s.items.filter((e) => !e.seen).length,
    byId: (s) => (id) => s.items.find((e) => e.id === id)
  },
  actions: {
    persist() { save('fv-ev', { scopeLayout: this.scopeLayout, visible: this.visible, width: this.width }) },

    filtered(layoutCams, camName) {
      const q = this.search.trim().toLowerCase().replace(/[\s-]/g, '')
      const cams = new Set(layoutCams)
      return this.items.filter((e) =>
        (this.sev === 'all' || e.severity === this.sev) &&
        (!this.scopeLayout || cams.has(e.cam)) &&
        (!q || [camName(e.cam), TYPE_LABELS[e.type], ...e.objects, ...e.subLabels, ...e.zones].some((v) => v && String(v).toLowerCase().replace(/[\s_-]/g, '').includes(q))))
    },

    upsert(server, raw) {
      const ev = normalize(server, raw)
      const i = this.items.findIndex((x) => x.id === ev.id)
      if (i >= 0) { this.items[i] = { ...ev, seen: ev.seen || this.items[i].seen }; return null }
      // insertion à sa place (liste triée du plus récent au plus ancien)
      const at = this.items.findIndex((x) => x.s < ev.s)
      this.items.splice(at < 0 ? this.items.length : at, 0, ev)
      return ev
    },

    async refresh(server) {
      try {
        const list = await getRecentReviews(server, (Date.now() - 2 * DAY) / 1000)
        const known = new Set(this.items.map((e) => e.id))
        const seen = new Map(this.items.map((e) => [e.id, e.seen]))
        this.items = list.map((r) => normalize(server, r)).map((e) => ({ ...e, seen: e.seen || !!seen.get(e.id) })).sort((a, b) => b.s - a.s)
        return this.items.filter((e) => !known.has(e.id))
      } catch { return [] }
    },

    // Démarrage : liste des 2 derniers jours + flux temps réel
    async start(server, onNew) {
      this.stop()
      this._server = server
      this._onNew = onNew
      await this.refresh(server)
      this.connect()
      this._poll = setInterval(async () => { if (this.realtime !== 'on') for (const e of await this.refresh(server)) onNew?.(e) }, POLL_MS)
    },
    connect() {
      const server = this._server
      if (!server) return
      let ws
      try { ws = new WebSocket(wsUrl(server)) } catch { this.realtime = 'down'; return }
      this._ws = ws
      ws.onopen = () => { this.realtime = 'on'; ws.send(JSON.stringify({ topic: 'onConnect', message: '', retain: false })) }
      ws.onmessage = (m) => {
        let msg
        try { msg = JSON.parse(m.data) } catch { return }
        if (msg.topic !== 'reviews') return
        let p = msg.payload
        if (typeof p === 'string') { try { p = JSON.parse(p) } catch { return } }
        const r = p?.after
        if (!r?.id) return
        const added = this.upsert(server, r)
        if (added) {
          this.fresh.push(added.id)
          setTimeout(() => (this.fresh = this.fresh.filter((x) => x !== added.id)), 3000)
          this._onNew?.(added)
        }
      }
      ws.onclose = () => {
        if (this._ws !== ws) return
        this.realtime = 'down'
        clearTimeout(this._retry)
        this._retry = setTimeout(() => this.connect(), 5000)
      }
    },
    stop() {
      clearInterval(this._poll)
      clearTimeout(this._retry)
      const ws = this._ws
      this._ws = null
      ws?.close()
      this.realtime = 'off'
    },

    async markSeen(ids) {
      ids = ids.filter((id) => this.byId(id) && !this.byId(id).seen)
      if (!ids.length) return true
      for (const id of ids) this.byId(id).seen = true
      try { await markReviewed(this._server, ids); return true } catch {
        for (const id of ids) this.byId(id).seen = false // échec : on remet l'état d'origine
        return false
      }
    },
    markAllSeen() { return this.markSeen(this.items.filter((e) => !e.seen).map((e) => e.id)) }
  }
})
