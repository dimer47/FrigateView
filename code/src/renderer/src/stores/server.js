import { defineStore } from 'pinia'
import { getVersion, getCameras, getOnline, getProfile, login, logout, isInternal, checkCert } from '@/services/frigate'
import { resetWebRTCEndpoint } from '@/services/webrtc'
import { load, save } from './storage'

const POLL_MS = 10000

export const useServerStore = defineStore('server', {
  state: () => ({
    server: load('fv-server', null), // { host, port, user } — jamais le mot de passe
    status: 'idle', // idle | connecting | ok | lost | auth
    authReason: '', // message affiché sur l'écran de connexion quand la session a expiré
    version: '',
    profile: { username: '', role: 'viewer' },
    cameras: [],
    online: {},
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
      try { online = await getOnline(server) } catch { /* statistiques facultatives */ }
      Object.assign(this, { server, version, cameras, profile, online, status: 'ok', authReason: '' })
      save('fv-server', server)
      resetWebRTCEndpoint()
      this.startPolling()
    },

    async connect({ host, port, user, password, remember }) {
      const server = { host, port, user: isInternal({ port }) ? '' : user }
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
        if (e.code === 'auth') return this.askLogin('Votre session a expiré. Reconnectez-vous.')
        if (e.code === 'cert') return this.askLogin('Le certificat du serveur a changé. Vérifiez-le avant de vous reconnecter.')
        this.status = 'lost'
        this.lostAt = Date.now()
        this.startPolling()
      }
    },

    async relogin() {
      const s = await window.native.loadSecret()
      if (!s || s.host !== this.server.host || String(s.port) !== String(this.server.port)) return false
      try { await this.open({ host: s.host, port: s.port, user: s.user }, s.password); return true } catch { return false }
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

    startPolling() {
      clearInterval(this._timer)
      this._timer = setInterval(() => this.poll(), POLL_MS)
    },

    async poll() {
      if (!this.server || this.status === 'auth') return
      try {
        this.online = await getOnline(this.server)
        if (this.status === 'lost') { this.cameras = await getCameras(this.server); this.status = 'ok' }
      } catch (e) {
        if (e.code === 'auth') { if (!(await this.relogin())) this.askLogin('Votre session a expiré. Reconnectez-vous.'); return }
        if (this.status !== 'lost') { this.status = 'lost'; this.lostAt = Date.now() }
      }
    },
    retryNow() { this.poll() }
  }
})
