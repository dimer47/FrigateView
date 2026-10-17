import { defineStore } from 'pinia'
import { getVersion, getCameras, getStats, onlineFromStats, getProfile, login, logout, isInternal, checkCert } from '@/services/frigate'
import { resetWebRTCEndpoint } from '@/services/webrtc'
import { load, save } from './storage'

const POLL_MS = 10000
// État de /api/stats publié par la fenêtre principale, relu par les murs (même origine → localStorage partagé)
const SHARED_KEY = 'fv-srv-state'
const SHARED_MAX_AGE = 25000 // au-delà, la fenêtre principale ne relève plus : le mur interroge lui-même
const isWall = new URLSearchParams(location.search).get('wall') === '1'

export const useServerStore = defineStore('server', {
  state: () => ({
    server: load('fv-server', null), // { host, port, user } — jamais le mot de passe
    status: 'idle', // idle | connecting | ok | lost | auth
    authReason: '', // clé du message affiché sur l'écran de connexion quand la session a expiré
    version: '',
    profile: { username: '', role: 'viewer' },
    cameras: [],
    online: {},
    stats: null, // dernière réponse brute de /api/stats (statistiques du serveur)
    lostAt: 0
  }),
  getters: {
    camById: (s) => (id) => s.cameras.find((c) => c.id === id),
    onlineCount: (s) => s.cameras.filter((c) => s.online[c.id]).length,
    isAdmin: (s) => s.profile.role === 'admin',
    needsLogin: (s) => !s.server || s.status === 'auth'
  },
  actions: {
    // Connexion complète ; lève une FrigateError (code cert | login | timeout | network…)
    async open(server, password) {
      await checkCert(server)
      if (!isInternal(server) && password !== undefined) await login(server, server.user, password)
      const [version, cameras, profile] = await Promise.all([getVersion(server), getCameras(server), getProfile(server)])
      let online = {}
      try { this.stats = await getStats(server); online = onlineFromStats(this.stats) } catch { /* statistiques facultatives */ }
      Object.assign(this, { server, version, cameras, profile, online, status: 'ok', authReason: '' })
      save('fv-server', server)
      resetWebRTCEndpoint()
      this.publish()
      this.startPolling()
    },

    async connect({ mode, host, port, user, password, remember }) {
      const server = { mode, host, port, user: mode === 'local' ? '' : user }
      await this.open(server, password)
      if (remember && !isInternal(server)) await window.native.saveSecret({ host, port, user, password })
      else await window.native.clearSecret()
    },

    // Au démarrage : cookie de session encore valide, sinon mot de passe mémorisé
    async resume() {
      if (!this.server) return
      this.status = 'connecting'
      try {
        await this.open(this.server)
      } catch (e) {
        if (e.code === 'auth' && (await this.relogin())) return
        if (e.code === 'auth') return this.askLogin('connect.sessionExpired')
        if (e.code === 'cert') return this.askLogin('connect.certChanged')
        this.status = 'lost'
        this.lostAt = Date.now()
        this.startPolling()
      }
    },

    // Mutualisé : plusieurs appels simultanés (resume, poll…) partagent la même tentative
    relogin() {
      this._relogin ||= (async () => {
        const s = await window.native.loadSecret()
        if (!s || !this.server || s.host !== this.server.host || String(s.port) !== String(this.server.port)) return false
        try { await this.open({ mode: 'secure', host: s.host, port: s.port, user: s.user }, s.password); return true } catch { return false }
      })().finally(() => { this._relogin = null })
      return this._relogin
    },

    askLogin(reason) {
      clearInterval(this._timer)
      this.status = 'auth'
      this.authReason = reason
    },

    async signOut() {
      clearInterval(this._timer)
      await logout(this.server)
      await window.native.clearSecret()
      this.askLogin('')
    },

    async changeServer() {
      await this.signOut()
      this.server = null
      this.cameras = []
      save('fv-server', null)
    },

    // fast : relevé toutes les 3 s quand les statistiques sont affichées
    startPolling(fast = this._fast) {
      this._fast = fast
      clearInterval(this._timer)
      this._timer = setInterval(() => this.poll(), fast ? 3000 : POLL_MS)
    },

    // Garde anti-chevauchement : sur un lien lent, une requête ne part pas tant que la précédente n'a pas répondu
    async poll() {
      if (!this.server || this.status === 'auth' || this._polling) return
      this._polling = true
      try { await this._poll() } finally { this._polling = false }
    },

    // Mur : reprend l'état publié par la fenêtre principale s'il est récent ; true = traité
    async pollShared() {
      const sh = load(SHARED_KEY, null)
      if (!sh || Date.now() - sh.at > SHARED_MAX_AGE || sh.host !== this.server.host || String(sh.port) !== String(this.server.port)) return false
      if (sh.status === 'ok') {
        this.stats = sh.stats
        this.online = sh.online
        this._fails = 0
        if (this.status === 'lost') { this.cameras = await getCameras(this.server); this.status = 'ok' }
      } else if (sh.status === 'lost' && this.status !== 'lost') { this.status = 'lost'; this.lostAt = sh.lostAt || Date.now() }
      return true
    },

    async _poll() {
      if (isWall) {
        try { if (await this.pollShared()) return } catch { /* repli : relevé direct */ }
      }
      try {
        this.stats = await getStats(this.server)
        this._fails = 0
        this.online = onlineFromStats(this.stats)
        if (this.status === 'lost') { this.cameras = await getCameras(this.server); this.status = 'ok' }
        this.publish()
      } catch (e) {
        if (e.code === 'auth') { if (!(await this.relogin())) this.askLogin('connect.sessionExpired'); return }
        // Coupure seulement après 3 échecs de suite : un lien saturé par la vidéo
        // (plusieurs murs, flux 4K) ralentit les réponses sans que le serveur soit arrêté
        if (this.status !== 'lost' && (this._fails = (this._fails || 0) + 1) < 3) return
        if (this.status !== 'lost') { this.status = 'lost'; this.lostAt = Date.now() }
        this.publish()
      }
    },
    // Fenêtre principale : partage le dernier relevé avec les murs
    publish() {
      if (isWall || !this.server || (this.status !== 'ok' && this.status !== 'lost')) return
      save(SHARED_KEY, { at: Date.now(), host: this.server.host, port: this.server.port, status: this.status, lostAt: this.lostAt, stats: this.stats, online: this.online })
    },
    retryNow() { this.poll() }
  }
})
