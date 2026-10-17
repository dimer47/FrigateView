// Accès à l'API Frigate.
// Port 8971 : HTTPS + compte Frigate (jeton de session en cookie, partagé avec les <img>).
// Port 5000 : accès interne sans compte, à n'utiliser que sur un réseau de confiance.

// Mode « local » : sans compte, en HTTP. Choisi explicitement à la connexion
// (anciennes configurations sans mode : déduit du port 5000).
export const isInternal = (s) => (s.mode ? s.mode === 'local' : String(s.port) === '5000')
export const baseUrl = (s) => `${isInternal(s) ? 'http' : 'https'}://${s.host}:${s.port}`

export class FrigateError extends Error {
  constructor(message, { status = 0, code = '', cert = null } = {}) {
    super(message)
    this.status = status
    this.code = code // timeout | cert | auth | http | network
    this.cert = cert
  }
}

async function request(server, path, opts = {}) {
  // Frigate exige cet en-tête sur les requêtes qui modifient quelque chose (protection CSRF)
  if (opts.method && opts.method !== 'GET') opts = { ...opts, headers: { 'X-CSRF-TOKEN': '1', ...opts.headers } }
  const r = await window.native.http({ url: baseUrl(server) + path, timeout: 6000, ...opts })
  if (r.ok) return r.text
  if (r.error === 'cert') throw new FrigateError('Certificat non reconnu', { code: 'cert', cert: r.cert })
  if (r.error === 'timeout') throw new FrigateError('Délai dépassé', { code: 'timeout' })
  if (r.status === 401 || r.status === 403) throw new FrigateError('Session expirée ou accès refusé', { status: r.status, code: 'auth' })
  if (r.status) throw new FrigateError(`HTTP ${r.status}`, { status: r.status, code: 'http' })
  throw new FrigateError(r.error || 'Erreur réseau', { code: 'network' })
}

export const getJson = async (server, path) => JSON.parse(await request(server, path))

// Port 8971 : certificat auto-signé à approuver une fois (empreinte vérifiée ensuite)
export async function checkCert(server) {
  if (isInternal(server)) return
  const p = await window.native.probeCert(server.host, server.port)
  if (!p.ok) throw new FrigateError(p.error === 'timeout' ? 'Délai dépassé' : p.error, { code: p.error === 'timeout' ? 'timeout' : 'network' })
  if (!p.authorized && !p.trusted) throw new FrigateError('Certificat non reconnu', { code: 'cert', cert: p })
}

export async function login(server, user, password) {
  try {
    await request(server, '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }) })
  } catch (e) {
    if (e.status === 400 || e.status === 401) throw new FrigateError('Utilisateur ou mot de passe incorrect', { status: e.status, code: 'login' })
    if (e.status === 429) throw new FrigateError('Trop de tentatives, réessayez dans une minute', { status: 429, code: 'login' })
    throw e
  }
}

export const logout = (server) => window.native.logout(baseUrl(server))

// Rôle du compte : admin | viewer
export async function getProfile(server) {
  if (isInternal(server)) return { username: '', role: 'admin' }
  const p = await getJson(server, '/api/profile')
  return { username: p.username || '', role: p.role || 'viewer' }
}

export const getVersion = async (server) => (await request(server, '/api/version')).trim()

// « bureau_arriere » → « Bureau arriere » (le nom affiché reste modifiable plus tard)
const prettify = (id) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export async function getCameras(server) {
  const config = await getJson(server, '/api/config')
  return Object.entries(config.cameras || {}).map(([id, c]) => ({
    id,
    name: c.ui?.name || c.friendly_name || prettify(id),
    enabled: c.enabled !== false,
    order: c.ui?.order ?? 0
  })).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

// En ligne = la caméra envoie des images (camera_fps > 0)
export async function getOnline(server) {
  const stats = await getJson(server, '/api/stats')
  const out = {}
  for (const [id, s] of Object.entries(stats.cameras || {})) out[id] = (s.camera_fps ?? 0) > 0
  return out
}

export const snapshotUrl = (server, cam, height) =>
  `${baseUrl(server)}/api/${encodeURIComponent(cam)}/latest.webp?height=${height}&t=${Date.now()}`

/* ---- Enregistrements et relecture ---- */

// Segments enregistrés (≈ 10 s chacun) : { start_time, end_time, duration, motion, objects }
export const getRecordings = (server, cam, after, before) =>
  getJson(server, `/api/${encodeURIComponent(cam)}/recordings?after=${Math.floor(after)}&before=${Math.ceil(before)}`)

// Revues Frigate : alertes (personnes…) et détections, avec les objets détectés
export const getReviews = (server, cams, after, before) =>
  getJson(server, `/api/review?cameras=${cams.map(encodeURIComponent).join(',')}&after=${Math.floor(after)}&before=${Math.ceil(before)}&limit=2000`)

// Liste de lecture HLS d'une plage. Les coupures d'enregistrement sont retirées par Frigate.
export const vodUrl = (server, cam, start, end) =>
  `${baseUrl(server)}/vod/${encodeURIComponent(cam)}/start/${Math.floor(start)}/end/${Math.ceil(end)}/index.m3u8`

/* ---- Revues (panneau des événements) ---- */

export const getRecentReviews = (server, after, limit = 500) =>
  getJson(server, `/api/review?after=${Math.floor(after)}&limit=${limit}`)

export const markReviewed = (server, ids) =>
  request(server, '/api/reviews/viewed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })

// thumb_path est un chemin disque du serveur (/media/frigate/clips/…) : servi sous /clips/…
export const thumbUrl = (server, review) =>
  review.thumb_path ? `${baseUrl(server)}/${review.thumb_path.replace(/^\/media\/frigate\//, '')}` : ''

// Flux temps réel de Frigate (mêmes sujets que MQTT, authentifié par le cookie de session)
export const wsUrl = (server) => `${isInternal(server) ? 'ws' : 'wss'}://${server.host}:${server.port}/ws`
