// Santé du serveur Frigate : stockage, journaux, redémarrage.
// Vérifié dans le source de Frigate 0.18.2 :
//  · frigate/api/record.py : GET /api/recordings/storage (admin) → { caméra: { usage (Mo), bandwidth (Mo/h), usage_percent } }
//  · frigate/api/app.py    : GET /api/logs/{frigate|go2rtc|nginx}?start=&end= (admin) → { totalLines, lines } ;
//                            start négatif = depuis la fin (tranche Python) ; POST /api/restart (admin)
//  · /api/stats (tout compte) : service.storage['/media/frigate/recordings'] = { total, used, free } en Mo
import { getJson, sendJson } from './frigate'

export const LOG_SERVICES = ['frigate', 'go2rtc', 'nginx']

// Disque des enregistrements, en Mo (null si absent)
export function recordingsDisk(stats) {
  const d = stats?.service?.storage?.['/media/frigate/recordings']
  if (!d || !d.total) return null
  return { total: d.total, used: d.used, free: d.free, pct: (d.used / d.total) * 100 }
}

// Réponse de /api/recordings/storage → lignes triées par place occupée, avec estimation de durée restante
export function cameraUsage(json, disk) {
  const rows = Object.entries(json || {})
    .filter(([, v]) => v && typeof v === 'object')
    .map(([cam, v]) => ({ cam, usage: v.usage || 0, bandwidth: v.bandwidth || 0, pct: v.usage_percent ?? (disk ? ((v.usage || 0) / disk.total) * 100 : 0) }))
    .sort((a, b) => b.usage - a.usage)
  const perHour = rows.reduce((n, r) => n + r.bandwidth, 0)
  return { rows, perHour, used: rows.reduce((n, r) => n + r.usage, 0), daysLeft: disk && perHour > 0 ? disk.free / perHour / 24 : null }
}

// Niveau d'une ligne de journal (pour la couleur) : error | warning | info | debug | null
export function logLevel(line) {
  const m = String(line).match(/\b(ERROR|CRITICAL|FATAL|ERR|WARNING|WARN|WRN|INFO|INF|DEBUG|DBG|TRACE|TRC)\b/)
  if (!m) return null
  const k = m[1]
  if (/ERR|CRIT|FATAL/.test(k)) return 'error'
  if (/WARN|WRN/.test(k)) return 'warning'
  if (/INF/.test(k)) return 'info'
  return 'debug'
}

// Taille en Mo → [clé de traduction, valeur] : srv.tb | srv.gb | srv.mb
export function sizeParts(mbytes) {
  if (mbytes >= 1024 * 1024) return ['srv.tb', mbytes / 1024 / 1024, 2]
  if (mbytes >= 1024) return ['srv.gb', mbytes / 1024, 1]
  return ['srv.mb', mbytes, 0]
}

/* ---- API ---- */
export const getCameraStorage = (server) => getJson(server, '/api/recordings/storage', { timeout: 20000 })
export const getLogs = (server, service, lines = 500) => getJson(server, `/api/logs/${encodeURIComponent(service)}?start=-${lines}`, { timeout: 20000 })
export const restartFrigate = (server) => sendJson(server, '/api/restart', 'POST')
