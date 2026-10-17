// Faux serveur Frigate pour développer sans le vrai : npm run mock
//  · https://127.0.0.1:5051 : comme le port 8971 (certificat auto-signé + compte admin/admin ou viewer/viewer)
//  · http://127.0.0.1:5050  : comme le port 5000 (sans compte)
// Reproduit les 5 caméras du serveur de test. Pas de WebRTC : l'app affiche alors les images 1/s.
import http from 'node:http'
import https from 'node:https'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { WebSocketServer } from 'ws'

const PORT = 5050
const PORT_TLS = 5051
const USERS = { admin: { password: 'admin', role: 'admin' }, viewer: { password: 'viewer', role: 'viewer' } }
const sessions = new Map() // jeton → utilisateur
const cams = ['route', 'devant', 'devant_local', 'bureau_arriere', 'bureau_devant']
const offline = new Set(['bureau_devant'])
// Aléatoire déterministe (mêmes données à chaque appel)
const rnd = (seed) => { let h = 2166136261; for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 10000) / 10000 }
const isGap = (cam, t) => { const block = 3 * 3600, off = Math.floor(rnd(cam) * 7000); return ((t + off) % block) < 480 }
const mediaDir = new URL('./.media/', import.meta.url).pathname
if (!existsSync(mediaDir + 'route.ts')) {
  mkdirSync(mediaDir, { recursive: true })
  console.log('Génération des vidéos de test (ffmpeg)…')
  for (const c of ['route', 'devant', 'devant_local', 'bureau_arriere', 'bureau_devant'])
    execSync(`ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=640x360:rate=15 -vf hue=h=${Math.floor(rnd(c) * 360)} -t 10 -c:v libx264 -pix_fmt yuv420p -g 15 -f mpegts "${mediaDir}${c}.ts"`)
}
const ZONES = { route: ['chaussee', 'trottoir'], devant: ['portail', 'allee'], devant_local: ['parking'], bureau_arriere: ['cour'], bureau_devant: ['entree'] }
const viewed = new Set()
const live = [] // revues créées pendant que le serveur tourne
function review(c, s0, obj, end) {
  const id = `${s0}-${c}`
  const sub = obj === 'car' && rnd(id) < 0.6 ? [['AB-' + String(100 + Math.floor(rnd(id + 'p') * 900)) + '-CD', 0.9]] : obj === 'person' && rnd(id) < 0.3 ? [[rnd(id + 'f') < 0.6 ? 'Alex' : 'Marie', 0.88]] : []
  return { id, camera: c, start_time: s0, end_time: end, severity: obj === 'person' ? 'alert' : 'detection', thumb_path: `/media/frigate/clips/review/thumb-${c}-${id}.webp`,
    data: { objects: [obj], sub_labels: sub.map((x) => x[0]), zones: [ZONES[c][Math.floor(rnd(id + 'z') * ZONES[c].length)]], detections: [id] } }
}
// Toutes les revues d'une plage (30 jours de rétention), de la plus récente à la plus ancienne
const RETAIN = 30 * 86400
function allReviews(after, before, list) {
  after = Math.max(after, Date.now() / 1000 - RETAIN)
  const out = live.filter((x) => list.includes(x.camera) && x.start_time >= after && x.start_time < before).map(withViewed)
  for (const c of list) for (let t = Math.floor(after / 600) * 600; t < before; t += 600) {
    const x = rnd(c + t)
    if (x > 0.45 || isGap(c, t)) continue
    const s0 = t + Math.floor(rnd(c + t + 'o') * 500), obj = x < 0.25 ? 'person' : x < 0.42 ? 'car' : 'dog'
    if (s0 > Date.now() / 1000 || s0 < after || s0 >= before) continue
    out.push(withViewed(review(c, s0, obj, s0 + 20 + Math.floor(rnd(c + s0) * 90))))
  }
  return out.sort((a, b) => b.start_time - a.start_time)
}
const toEvent = (r) => {
  const sub = r.data.sub_labels[0], plate = sub && /\d/.test(sub) ? sub : null
  return { id: r.id + '-ev', camera: r.camera, label: r.data.objects[0], sub_label: plate ? null : sub || null, zones: r.data.zones, start_time: r.start_time, end_time: r.end_time,
    has_clip: true, has_snapshot: true, top_score: 0.8, false_positive: null, box: null, data: { type: 'object', score: 0.8, recognized_license_plate: plate } }
}
const withViewed = (r) => ({ ...r, has_been_reviewed: viewed.has(r.id) || r.start_time < Date.now() / 1000 - 3600 })
const hue = (id) => (cams.indexOf(id) * 67) % 360

function frame(id, h) {
  const w = Math.round((h * 16) / 9), t = new Date().toLocaleTimeString('fr-FR')
  const x = ((Date.now() / 40) % (w + 80)) - 40
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="hsl(${hue(id)},25%,18%)"/>
  <rect y="${h * 0.62}" width="100%" height="${h * 0.38}" fill="hsl(${hue(id)},15%,12%)"/>
  <circle cx="${x}" cy="${h * 0.6}" r="${h * 0.06}" fill="#f59e0b"/>
  <text x="${w * 0.03}" y="${h * 0.1}" font-family="monospace" font-size="${h * 0.06}" fill="#fff">${id} ${t}</text>
</svg>`
}

// Bibliothèque de visages (reconnaissance faciale, 0.16+) : dossiers en mémoire, images SVG générées.
// MOCK_NO_FACES=1 : reconnaissance désactivée (face_recognition.enabled false, modifications refusées en 400)
const FACES_ON = !process.env.MOCK_NO_FACES
const now0 = Math.floor(Date.now() / 1000)
const faces = { Alex: [], Marie: [], train: [] }
for (let i = 0; i < 4; i++) faces.Alex.push(`Alex-${now0 - 86400 * (i + 1)}.${i}.webp`)
for (let i = 0; i < 3; i++) faces.Marie.push(`Marie-${now0 - 86400 * (i + 2)}.${i}.webp`)
for (let i = 0; i < 9; i++) {
  const ts = now0 - 1800 * (i + 1) - Math.floor(rnd('f' + i) * 900), guess = rnd('g' + i) < 0.4 ? (rnd('h' + i) < 0.5 ? 'Alex' : 'Marie') : 'unknown'
  faces.train.push(`${ts}.${String(i).padStart(6, '0')}-ab${i}cd-${ts}.5-${guess}-${(0.35 + rnd('s' + i) * 0.6).toFixed(2)}.webp`)
}
function faceSvg(seed) {
  const h = Math.floor(rnd(seed) * 360), skin = 25 + Math.floor(rnd(seed + 's') * 25)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="hsl(${h},30%,22%)"/>
  <ellipse cx="80" cy="84" rx="44" ry="54" fill="hsl(30,45%,${skin + 30}%)"/><path d="M36 70q44-60 88 0q-10-34-44-36q-34 2-44 36z" fill="hsl(${h},35%,18%)"/>
  <circle cx="63" cy="80" r="5" fill="#222"/><circle cx="97" cy="80" r="5" fill="#222"/><path d="M62 112q18 ${8 + Math.floor(rnd(seed + 'm') * 10)} 36 0" stroke="#7a3b2e" stroke-width="4" fill="none"/></svg>`
}
const readBody = (req) => new Promise((resolve) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))) })
async function facesApi(req, url, send) {
  const json = (code, o) => send(code, 'application/json', JSON.stringify(o))
  const p = url.pathname
  if (p === '/api/faces' && req.method === 'GET') return json(200, faces), true
  let m = p.match(/^\/clips\/faces\/([^/]+)\/([^/]+)$/)
  if (m) { const n = decodeURIComponent(m[1]), f = decodeURIComponent(m[2]); return faces[n]?.includes(f) ? send(200, 'image/svg+xml', faceSvg(f)) : send(404, 'text/plain', 'not found'), true }
  m = p.match(/^\/api\/faces\/(.+)$/)
  if (!m || req.method === 'GET') return false
  if (!FACES_ON) return json(400, { success: false, message: 'Face recognition is not enabled.' }), true
  const raw = await readBody(req)
  let b = {}; try { b = JSON.parse(raw.toString()) } catch { /* multipart ou vide */ }
  const parts = m[1].split('/').map(decodeURIComponent)
  console.log('VISAGES', req.method, parts.join('/'), raw.length > 300 ? `(${raw.length} octets)` : raw.toString())
  const stamp = () => `${Date.now() / 1000}`
  if (parts[0] === 'train' && parts[2] === 'classify') {
    const i = faces.train.indexOf(b.training_file)
    if (i < 0) return json(404, { success: false, message: `Invalid filename or no file exists: ${b.training_file}` }), true
    faces.train.splice(i, 1); (faces[parts[1]] ||= []).push(`${parts[1]}-${stamp()}.webp`)
    return json(200, { success: true, message: 'ok' }), true
  }
  const [name, action] = parts
  if (action === 'create') { faces[name.replace(/ /g, '_')] ||= []; return json(200, { success: false, message: 'Successfully created face folder.' }), true }
  if (action === 'register') {
    if (!/multipart\/form-data/.test(req.headers['content-type'] || '') || !raw.includes('name="file"')) return json(400, { success: false, message: 'no file' }), true
    ;(faces[name] ||= []).push(`${name}-${stamp()}.webp`); return json(200, { success: true, message: 'Successfully registered face.' }), true
  }
  if (action === 'delete') {
    if (!faces[name]) return json(404, { success: false }), true
    faces[name] = faces[name].filter((f) => !(b.ids || []).includes(f))
    if (name !== 'train' && !faces[name].length) delete faces[name]
    return json(200, { success: true, message: 'Successfully deleted faces.' }), true
  }
  if (action === 'rename' && req.method === 'PUT') {
    if (!faces[name] || !/^[\p{L}\p{N}\s'_-]{1,50}$/u.test(b.new_name || '') || faces[b.new_name]) return json(400, { success: false, message: 'Error renaming face. Check Frigate logs.' }), true
    faces[b.new_name] = faces[name].map((f) => f.replace(name + '-', b.new_name + '-')); delete faces[name]
    return json(200, { success: true }), true
  }
  return json(404, { success: false }), true
}

function handler(secure) {
  return async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const send = (code, type, body, extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra }); res.end(body) }
  if (secure) {
    if (url.pathname === '/api/login' && req.method === 'POST') {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        let b = {}; try { b = JSON.parse(raw) } catch { /* corps invalide */ }
        const u = USERS[b.user]
        if (!u || u.password !== b.password) return send(401, 'application/json', '{"message":"Login failed"}')
        const token = randomBytes(16).toString('hex'); sessions.set(token, b.user)
        send(200, 'application/json', '{}', { 'Set-Cookie': `frigate_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400` })
      })
      return
    }
    const token = /frigate_token=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1]
    if (!sessions.has(token)) return send(401, 'application/json', '{"message":"Unauthorized"}')
    if (url.pathname === '/api/profile') { const name = sessions.get(token); return send(200, 'application/json', JSON.stringify({ username: name, role: USERS[name].role })) }
  }
  // Rôle admin exigé pour modifier les visages
  if (secure && url.pathname.startsWith('/api/faces/') && req.method !== 'GET') { const tk = /frigate_token=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1]; if (USERS[sessions.get(tk)]?.role !== 'admin') return send(403, 'application/json', '{"message":"Forbidden"}') }
  if (await facesApi(req, url, send)) return
  // Caméra « devant » motorisée (commandes reçues par le WebSocket, affichées dans la console)
  const pz = url.pathname.match(/^\/api\/(\w+)\/ptz\/info$/)
  if (pz) return send(200, 'application/json', JSON.stringify(pz[1] === 'devant' ? { name: 'devant', features: ['pt', 'zoom'], presets: ['portail', 'allee'] } : {}))
  if (url.pathname === '/api/version') return send(200, 'text/plain', '0.17.2-mock')
  if (url.pathname === '/api/config') return send(200, 'application/json', JSON.stringify({ face_recognition: { enabled: FACES_ON }, cameras: Object.fromEntries(cams.map((c) => [c, { enabled: true, zones: Object.fromEntries(ZONES[c].map((z) => [z, {}])) }])) }))
  if (url.pathname === '/api/stats') return send(200, 'application/json', JSON.stringify({ cameras: Object.fromEntries(cams.map((c) => [c, { camera_fps: offline.has(c) ? 0 : 15 }])) }))
  // Enregistrements : segments de 10 s, avec une coupure de 8 min toutes les 3 h
  let r = url.pathname.match(/^\/api\/([^/]+)\/recordings$/)
  if (url.pathname === '/ws') return send(426, 'text/plain', 'upgrade required')
  if (r && cams.includes(r[1])) {
    const after = +url.searchParams.get('after'), before = Math.min(+url.searchParams.get('before'), Date.now() / 1000)
    const out = []
    for (let t = Math.floor(Math.max(after, Date.now() / 1000 - 2 * 86400) / 10) * 10; t < before; t += 10) {
      if (isGap(r[1], t)) continue
      out.push({ id: `${t}-${r[1]}`, start_time: t, end_time: t + 10, duration: 10, motion: rnd(r[1] + Math.floor(t / 60)) < 0.25 ? 120 : 0, objects: 0 })
    }
    return send(200, 'application/json', JSON.stringify(out))
  }
  // Revues (alertes / détections)
  if (url.pathname === '/api/reviews/viewed' && req.method === 'POST') {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => { try { for (const id of JSON.parse(raw).ids || []) viewed.add(id) } catch { /* corps invalide */ } send(200, 'application/json', '{"success":true}') })
    return
  }
  r = url.pathname.match(/^\/clips\/review\/thumb-([a-z_]+)-.+\.webp$/)
  if (r && cams.includes(r[1])) return send(200, 'image/svg+xml', frame(r[1], 180))
  // Revues sur 30 jours de rétention. Paramètres de Frigate : cameras, labels, zones, reviewed, severity, after, before, limit
  if (url.pathname === '/api/review') {
    const p = url.searchParams, set = (k) => (p.get(k) && p.get(k) !== 'all' ? p.get(k).split(',') : null)
    const labels = set('labels'), zones = set('zones'), sev = p.get('severity'), rv = p.get('reviewed')
    let out = allReviews(+p.get('after') || 0, +p.get('before') || Date.now() / 1000, set('cameras') || cams)
      .filter((x) => (!labels || x.data.objects.some((o) => labels.includes(o))) && (!zones || x.data.zones.some((z) => zones.includes(z))) && (!sev || x.severity === sev) && (rv == null || +x.has_been_reviewed === +rv))
    if (p.get('limit')) out = out.slice(0, +p.get('limit'))
    return send(200, 'application/json', JSON.stringify(out))
  }
  // Événements (un par revue) : sub_label = visage (chaîne), plaque dans data.recognized_license_plate (0.16+)
  if (url.pathname === '/api/events') {
    const p = url.searchParams, set = (k) => (p.get(k) && p.get(k) !== 'all' ? p.get(k).split(',').map((x) => x.toLowerCase()) : null)
    const labels = set('labels') || set('label'), zones = set('zones') || set('zone'), subs = set('sub_labels') || set('sub_label'), plates = set('recognized_license_plate')
    const out = allReviews(+p.get('after') || 0, +p.get('before') || Date.now() / 1000, set('cameras') || cams).map(toEvent)
      .filter((e) => (!labels || labels.includes(e.label)) && (!zones || e.zones.some((z) => zones.includes(z))) &&
        (!subs || (e.sub_label && subs.includes(e.sub_label.toLowerCase()))) && (!plates || (e.data.recognized_license_plate && plates.includes(e.data.recognized_license_plate.toLowerCase()))))
    return send(200, 'application/json', JSON.stringify(out.slice(+p.get('offset') || 0).slice(0, +p.get('limit') || 100)))
  }
  if (url.pathname === '/api/sub_labels') return send(200, 'application/json', JSON.stringify(['Alex', 'Marie']))
  if (url.pathname === '/api/recognized_license_plates') return send(200, 'application/json', JSON.stringify(['AB-123-CD', 'AB-456-CD']))
  if (url.pathname === '/api/labels') return send(200, 'application/json', JSON.stringify(['car', 'dog', 'person']))
  r = url.pathname.match(/^\/api\/events\/(\d+)-([a-z_]+)-ev\/thumbnail\.webp$/)
  if (r && cams.includes(r[2])) return send(200, 'image/svg+xml', frame(r[2], 180))
  // Relecture HLS : même clip de 10 s répété, une entrée par segment enregistré
  r = url.pathname.match(/^\/vod\/([^/]+)\/start\/([\d.]+)\/end\/([\d.]+)\/index\.m3u8$/)
  if (r && cams.includes(r[1])) {
    const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-TARGETDURATION:10', '#EXT-X-MEDIA-SEQUENCE:0', '#EXT-X-PLAYLIST-TYPE:VOD']
    let first = true
    for (let t = Math.floor(+r[2] / 10) * 10; t < +r[3]; t += 10) {
      if (isGap(r[1], t)) continue
      if (!first) lines.push('#EXT-X-DISCONTINUITY')
      first = false
      lines.push('#EXTINF:10.000,', `/vod/media/${r[1]}.ts`)
    }
    lines.push('#EXT-X-ENDLIST')
    return send(200, 'application/vnd.apple.mpegurl', lines.join('\n'))
  }
  r = url.pathname.match(/^\/vod\/media\/([a-z_]+)\.ts$/)
  if (r && cams.includes(r[1])) return send(200, 'video/mp2t', readFileSync(mediaDir + r[1] + '.ts'))

  const m = url.pathname.match(/^\/api\/([^/]+)\/latest\.(webp|jpg)$/)
  if (m && cams.includes(m[1])) return offline.has(m[1]) ? send(503, 'text/plain', 'offline') : send(200, 'image/svg+xml', frame(m[1], +url.searchParams.get('height') || 360))
  send(404, 'text/plain', 'not found')
  }
}

const certDir = new URL('./.cert/', import.meta.url).pathname
if (!existsSync(certDir + 'cert.pem')) {
  mkdirSync(certDir, { recursive: true })
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=frigate-mock" -keyout "${certDir}key.pem" -out "${certDir}cert.pem"`, { stdio: 'ignore' })
}
http.createServer(handler(false)).listen(PORT, () => console.log(`Faux Frigate sans compte : http://127.0.0.1:${PORT}`))
const tlsServer = https.createServer({ key: readFileSync(certDir + 'key.pem'), cert: readFileSync(certDir + 'cert.pem') }, handler(true))
// WebSocket Frigate (/ws) : messages { topic, payload } — ici une nouvelle revue toutes les 30 s
const wss = new WebSocketServer({ noServer: true })
tlsServer.on('upgrade', (req, sock, head) => {
  const token = /frigate_token=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1]
  if (!req.url.startsWith('/ws') || !sessions.has(token)) { sock.destroy(); return }
  wss.handleUpgrade(req, sock, head, (ws) => {
    ws.on('message', (m) => { try { const j = JSON.parse(m); if (j.topic.endsWith('/ptz')) console.log('PTZ', j.topic, j.payload) } catch { /* message invalide */ } })
    wss.emit('connection', ws)
  })
})
setInterval(() => {
  const on = cams.filter((c) => !offline.has(c)), c = on[Math.floor(Math.random() * on.length)], now = Date.now() / 1000
  const rv = review(c, Math.floor(now), Math.random() < 0.6 ? 'person' : 'car', null)
  live.unshift(rv)
  const msg = (type, after) => JSON.stringify({ topic: 'reviews', payload: JSON.stringify({ type, before: after, after }) })
  for (const ws of wss.clients) ws.send(msg('new', withViewed(rv)))
  setTimeout(() => { rv.end_time = Date.now() / 1000; for (const ws of wss.clients) ws.send(msg('end', withViewed(rv))) }, 25000)
}, 30000)
tlsServer.listen(PORT_TLS, () => console.log(`Faux Frigate avec compte : https://127.0.0.1:${PORT_TLS} (admin/admin ou viewer/viewer)`))
