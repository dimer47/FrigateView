// Faux serveur Frigate pour développer sans le vrai : npm run mock
//  · https://127.0.0.1:5051 : comme le port 8971 (certificat auto-signé + compte admin/admin ou viewer/viewer)
//  · http://127.0.0.1:5050  : comme le port 5000 (sans compte)
// Reproduit les 5 caméras du serveur de test. Pas de WebRTC : l'app affiche alors les images 1/s.
import http from 'node:http'
import https from 'node:https'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const PORT = 5050
const PORT_TLS = 5051
const USERS = { admin: { password: 'admin', role: 'admin' }, viewer: { password: 'viewer', role: 'viewer' } }
const sessions = new Map() // jeton → utilisateur
const cams = ['route', 'devant', 'devant_local', 'bureau_arriere', 'bureau_devant']
const offline = new Set(['bureau_devant'])
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

function handler(secure) {
  return (req, res) => {
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
  if (url.pathname === '/api/version') return send(200, 'text/plain', '0.17.2-mock')
  if (url.pathname === '/api/config') return send(200, 'application/json', JSON.stringify({ cameras: Object.fromEntries(cams.map((c) => [c, { enabled: true }])) }))
  if (url.pathname === '/api/stats') return send(200, 'application/json', JSON.stringify({ cameras: Object.fromEntries(cams.map((c) => [c, { camera_fps: offline.has(c) ? 0 : 15 }])) }))
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
https.createServer({ key: readFileSync(certDir + 'key.pem'), cert: readFileSync(certDir + 'cert.pem') }, handler(true))
  .listen(PORT_TLS, () => console.log(`Faux Frigate avec compte : https://127.0.0.1:${PORT_TLS} (admin/admin ou viewer/viewer)`))
