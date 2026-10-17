// Contrôles de sécurité du processus principal : fonctions pures, testables sans Electron.
import { resolve, dirname } from 'node:path'

// Ports go2rtc joignables directement en mode local (repli WebRTC, cf. renderer/services/webrtc.js)
export const GO2RTC_PORTS = ['1984', '8555']

const parse = (url) => { try { return new URL(url) } catch { return null } }

// Lien externe ouvrable dans le navigateur : http(s) uniquement
export const isExternalUrlSafe = (url) => { const u = parse(url); return !!u && (u.protocol === 'http:' || u.protocol === 'https:') }

// Fichier choisi par l'utilisateur, ou fichier placé directement dans un dossier choisi
export const allowedIn = (allowedPaths, p) => typeof p === 'string' && p !== '' && (allowedPaths.has(p) || allowedPaths.has(dirname(resolve(p))))

// Requête 'http' autorisée : même hôte que le serveur Frigate courant,
// sur son port, ou en http sur un port go2rtc.
// server = { host, port } (dernier serveur annoncé par cert:probe ou par la première requête)
export function isAllowedHttpUrl(server, url) {
  const u = parse(url)
  if (!u || !server?.host || (u.protocol !== 'http:' && u.protocol !== 'https:')) return false
  if (u.username || u.password) return false
  const bare = (h) => String(h).toLowerCase().replace(/^\[|\]$/g, '')
  if (bare(u.hostname) !== bare(server.host)) return false
  const port = u.port || (u.protocol === 'https:' ? '443' : '80')
  if (port === String(server.port)) return true
  return u.protocol === 'http:' && GO2RTC_PORTS.includes(port)
}

// Navigation autorisée dans une fenêtre : uniquement la page locale de l'application
export function isAppUrl(url, { devUrl, appFile } = {}) {
  const u = parse(url)
  if (!u) return false
  if (devUrl) { const d = parse(devUrl); if (d && u.origin === d.origin) return true }
  if (appFile && u.protocol === 'file:') return decodeURIComponent(u.pathname).replace(/\\/g, '/').replace(/^\/([A-Za-z]:)/, '$1') === appFile.replace(/\\/g, '/')
  return false
}
