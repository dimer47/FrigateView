// Notifications par visage ou par plaque (logique pure, sans Vue ni Electron)
// Source vérifiée dans Frigate (branche dev) : message WebSocket « tracked_object_update »
//  · frigate/data_processing/real_time/face.py : { type: 'face', id, camera, name (nom connu ou 'unknown'), score, timestamp }
//  · frigate/data_processing/common/license_plate/mixin.py : { type: 'lpr', id, camera, name (nom known_plates ou null), plate, score, timestamp }
// Ces messages sont répétés à chaque image analysée : dédoublonnage par objet suivi (id).

export const UNKNOWN = 'unknown'
export const normPlate = (s) => String(s || '').toUpperCase().replace(/[\s_-]/g, '')

// Message brut → { kind, id, cam, s, name, plate } (null si non pertinent)
export function parseTrackUpdate(payload) {
  let p = payload
  if (typeof p === 'string') { try { p = JSON.parse(p) } catch { return null } }
  if (!p?.id || (p.type !== 'face' && p.type !== 'lpr')) return null
  const name = p.name ? String(p.name).trim() : null
  return {
    kind: p.type === 'face' ? 'face' : 'plate',
    id: String(p.id),
    cam: p.camera || '',
    s: (+p.timestamp || Date.now() / 1000) * 1000,
    name: name || null,
    plate: p.type === 'lpr' && p.plate ? String(p.plate).trim() : null
  }
}

// Réglages → cibles surveillées
export function watchConf(s) {
  return { faces: s?.watchFaces || [], plates: s?.watchPlates || [], unknownFace: !!s?.watchUnknownFace }
}
export const hasWatch = (c) => !!(c.faces.length || c.plates.length || c.unknownFace)

// Correspondance : { key, label } ou null. Plaques : nom connu (known_plates) ou plaque brute (casse, espaces, tirets ignorés)
export function matchWatch(u, conf) {
  if (!u) return null
  if (u.kind === 'face') {
    if (u.name && u.name !== UNKNOWN && conf.faces.includes(u.name)) return { key: 'face:' + u.name, label: u.name, unknown: false }
    if ((!u.name || u.name === UNKNOWN) && conf.unknownFace) return { key: 'face:' + UNKNOWN, label: null, unknown: true }
    return null
  }
  if (u.name && conf.plates.includes(u.name)) return { key: 'plate:' + u.name, label: u.name, plate: u.plate }
  const np = normPlate(u.plate)
  if (np && conf.plates.some((p) => normPlate(p) === np)) return { key: 'plate:' + np, label: u.plate, plate: u.plate }
  return null
}

// Anti-rafale : une notification par objet suivi, une par cible et par fenêtre, plafond global par minute
export function createGate({ perTarget = 60e3, perMinute = 6, memory = 500 } = {}) {
  const ids = new Set(), lastByKey = new Map(), recent = []
  return {
    seen: (id) => ids.has(id),
    allow(id, key, now = Date.now()) {
      if (ids.has(id)) return false
      if (now - (lastByKey.get(key) ?? -Infinity) < perTarget) { ids.add(id); return false }
      while (recent.length && now - recent[0] > 60e3) recent.shift()
      if (recent.length >= perMinute) return false
      ids.add(id)
      if (ids.size > memory) ids.delete(ids.values().next().value)
      lastByKey.set(key, now)
      recent.push(now)
      return true
    }
  }
}

// Ajout / retrait d'une cible dans une liste (bouton cloche)
export const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
