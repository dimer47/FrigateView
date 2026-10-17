import { defineStore } from 'pinia'
import { getRecentReviews, markReviewed, thumbUrl, wsUrl, getPath, getList, eventThumbUrl } from '@/services/frigate'
import { emptyFilters, hasFilters, matchFilters, historyQuery, mergePages, fromEvent, PAGE } from './eventFilters'
import { reviewType, DAY } from './timeline'
import { load, save } from './storage'
import { t } from '@/i18n'

const POLL_MS = 60e3 // filet de sécurité si le temps réel est coupé
const KEEP = 2 * DAY // au-delà, les événements reçus en temps réel sont retirés de la liste

export const TYPE_KEYS = ['person', 'car', 'animal', 'other']
export const typeLabel = (k) => t('types.' + k)
export const TYPE_COLORS = { person: 'var(--color-bad)', car: 'var(--color-warn)', animal: 'var(--color-ok)', other: '#a78bfa' }

// Revue Frigate → événement affiché
export function normalize(server, r) {
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
    detections: r.data?.detections || [], // identifiants des objets suivis (/api/events/{id})
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
    fresh: [], // ids arrivés récemment (surbrillance)
    filters: emptyFilters(), // objet, visage, plaque, zone, caméra
    range: { preset: '', after: null, before: null }, // plage de dates (secondes)
    known: { subLabels: [], plates: [], labels: [], zones: [] }, // valeurs connues du serveur
    hist: { items: [], loading: false, done: false, error: false } // résultats de la recherche dans l'historique
  }),
  getters: {
    unseenCount: (s) => s.items.filter((e) => !e.seen).length,
    byId: (s) => (id) => s.items.find((e) => e.id === id) || s.hist.items.find((e) => e.id === id),
    // Filtre ou plage actif : la liste vient du serveur (au-delà des 2 jours en mémoire)
    historyMode: (s) => hasFilters(s.filters) || s.range.after != null || s.range.before != null,
    knownPlates: (s) => new Set(s.known.plates)
  },
  actions: {
    persist() { save('fv-ev', { scopeLayout: this.scopeLayout, visible: this.visible, width: this.width }) },

    filtered(layoutCams, camName) {
      const q = this.search.trim().toLowerCase().replace(/[\s-]/g, '')
      const cams = new Set(layoutCams)
      const plates = this.knownPlates
      return (this.historyMode ? this.hist.items : this.items).filter((e) =>
        (!this.historyMode || matchFilters(e, this.filters, plates)) &&
        (this.sev === 'all' || e.severity === this.sev) &&
        (!this.scopeLayout || cams.has(e.cam)) &&
        (!q || [camName(e.cam), typeLabel(e.type), ...e.objects, ...e.subLabels, ...e.zones].some((v) => v && String(v).toLowerCase().replace(/[\s_-]/g, '').includes(q))))
    },

    clearFilters() { this.filters = emptyFilters(); this.range = { preset: '', after: null, before: null } },

    // Valeurs proposées dans les menus (listes absentes sur certaines versions : ignorées)
    async loadKnown(server) {
      const [subLabels, plates, labels] = await Promise.all(['/api/sub_labels', '/api/recognized_license_plates', '/api/labels'].map((p) => getList(server, p)))
      let zones = []
      try { zones = Object.values((await getPath(server, '/api/config')).cameras || {}).flatMap((c) => Object.keys(c.zones || {})) } catch { /* facultatif */ }
      this.known = { subLabels, plates, labels, zones }
    },

    // Recherche dans l'historique : page suivante (reset = nouvelle recherche)
    async searchHistory(reset, layoutCams = []) {
      const server = this._server
      if (!server || !this.historyMode) { this.hist = { items: [], loading: false, done: false, error: false }; return }
      if (!reset && (this.hist.loading || this.hist.done)) return
      const token = (this._histToken = (this._histToken || 0) + 1)
      if (reset) { this.hist = { items: [], loading: true, done: false, error: false }; this._cursor = null } else this.hist.loading = true
      const before = this._cursor ?? this.range.before
      // « Caméras du gabarit » : restriction faite par le serveur (sinon une page entière pourrait être masquée)
      const f = !this.filters.cam.length && this.scopeLayout ? { ...this.filters, cam: layoutCams.filter(Boolean) } : this.filters
      const q = historyQuery(f, { after: this.range.after, before, limit: PAGE })
      try {
        const pages = await Promise.all(q.paths.map((p) => getPath(server, p)))
        if (token !== this._histToken) return // recherche remplacée entre-temps
        const lists = pages.map((list) => (Array.isArray(list) ? list : []).map((r) => (q.kind === 'events' ? fromEvent(r, eventThumbUrl(server, r.id)) : normalize(server, r))))
        // Curseur : fin de page la plus récente parmi les requêtes pleines (doublons retirés par mergePages, aucun trou)
        const full = lists.filter((l) => l.length >= PAGE)
        this.hist.items = mergePages(this.hist.items, lists.flat())
        this.hist.done = !full.length
        if (full.length) this._cursor = Math.max(...full.map((l) => Math.min(...l.map((e) => e.s)))) / 1000
      } catch {
        if (token === this._histToken) this.hist.error = true
      } finally {
        if (token === this._histToken) this.hist.loading = false
      }
    },

    upsert(server, raw) {
      const ev = normalize(server, raw)
      const i = this.items.findIndex((x) => x.id === ev.id)
      if (i >= 0) { this.items[i] = { ...ev, seen: ev.seen || this.items[i].seen }; return null }
      // insertion à sa place (liste triée du plus récent au plus ancien)
      const at = this.items.findIndex((x) => x.s < ev.s)
      this.items.splice(at < 0 ? this.items.length : at, 0, ev)
      this.prune()
      return ev
    },
    // Liste triée du plus récent au plus ancien : on coupe la queue
    prune() {
      const limit = Date.now() - KEEP
      let n = this.items.length
      while (n && this.items[n - 1].s < limit && this.items[n - 1].id !== this.detailId) n--
      if (n < this.items.length) this.items.splice(n)
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
    async start(server, onNew, onTrack) {
      this.stop()
      this._server = server
      this._onNew = onNew
      this._onTrack = onTrack // visages / plaques reconnus (tracked_object_update)
      await this.refresh(server)
      this.loadKnown(server)
      this.connect()
      this._poll = setInterval(async () => { this.prune(); if (this.realtime !== 'on') for (const e of await this.refresh(server)) onNew?.(e) }, POLL_MS)
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
        if (msg.topic === 'tracked_object_update') return this._onTrack?.(msg.payload)
        if (msg.topic !== 'reviews') return
        let p = msg.payload
        if (typeof p === 'string') { try { p = JSON.parse(p) } catch { return } }
        const r = p?.after
        if (!r?.id) return
        const added = this.upsert(server, r)
        if (added) {
          // Recherche ouverte jusqu'à maintenant : les nouveaux arrivent aussi en tête des résultats (filtrés à l'affichage)
          if (this.historyMode && this.range.before == null && (this.range.after == null || added.s / 1000 >= this.range.after)) this.hist.items = mergePages([added], this.hist.items)
          this.fresh.push(added.id)
          this._freshTimers ||= new Set()
          const tm = setTimeout(() => { this._freshTimers.delete(tm); this.fresh = this.fresh.filter((x) => x !== added.id) }, 3000)
          this._freshTimers.add(tm)
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
    // Commande envoyée à Frigate par le WebSocket (ex. PTZ : topic « cam/ptz », payload « MOVE_LEFT »)
    send(topic, payload) {
      if (this._ws?.readyState !== WebSocket.OPEN) return false
      this._ws.send(JSON.stringify({ topic, payload, message: payload, retain: false }))
      return true
    },
    stop() {
      clearInterval(this._poll)
      clearTimeout(this._retry)
      for (const tm of this._freshTimers || []) clearTimeout(tm)
      this._freshTimers?.clear()
      this.fresh = []
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
