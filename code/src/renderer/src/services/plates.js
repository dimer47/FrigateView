// Plaques d'immatriculation (LPR de Frigate 0.16+, fonction de base).
// Vérifié dans le source de Frigate (branche dev) :
//  · frigate/config/classification.py : lpr.enabled (global, surchargeable par caméra), lpr.known_plates { nom: [plaques ou regex] }
//  · frigate/api/event.py : GET /api/events?recognized_license_plate=… (valeur avec ^ . [ ] ? + * → regex SQL, sinon égalité) ;
//    la plaque est dans data.recognized_license_plate
//  · frigate/api/app.py : GET /api/recognized_license_plates (liste triée des plaques vues)
//  · frigate/data_processing/common/license_plate/mixin.py : plaque connue (re.match(^regex$) ou distance de Levenshtein
//    ≤ match_distance) → sub_label = nom connu
// Édition de known_plates : PUT /api/config/set existe, mais le corps config_data n'existe pas en 0.16 (paramètres
// d'URL seulement) et un redémarrage est requis → lecture seule ici, édition dans l'interface de Frigate.
import { getJson } from './frigate'

// Toute plaque non vide (regex : seule forme acceptée par Frigate pour « plaque présente »)
export const ANY_PLATE = '^.+'

const normalize = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '')

// LPR actif sur le serveur : réglage global ou au moins une caméra
export function lprEnabled(config) {
  if (config?.lpr?.enabled === true) return true
  return Object.values(config?.cameras || {}).some((c) => c?.lpr?.enabled === true)
}

// known_plates → [{ name, plates }] trié par nom
export function knownPlates(config) {
  const kp = config?.lpr?.known_plates
  if (!kp || typeof kp !== 'object') return []
  return Object.entries(kp)
    .map(([name, list]) => ({ name, plates: (Array.isArray(list) ? list : [list]).filter((p) => p != null).map(String) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

// Nom connu d'une plaque (regex ancrée comme Frigate ; sans distance de Levenshtein, le serveur la donne via sub_label)
export function matchKnown(plate, known) {
  if (!plate) return null
  for (const k of known) {
    for (const p of k.plates) {
      try { if (new RegExp(`^${p}$`).test(plate)) return k.name } catch { if (normalize(p) === normalize(plate)) return k.name }
    }
  }
  return null
}

// Événements Frigate → plaques agrégées, la plus récemment vue d'abord
export function aggregatePlates(events, known = []) {
  const names = new Set(known.map((k) => k.name))
  const map = new Map()
  for (const ev of events || []) {
    const plate = ev?.data?.recognized_license_plate
    if (!plate) continue
    const sub = ev.sub_label ? String(Array.isArray(ev.sub_label) ? ev.sub_label[0] : ev.sub_label).trim() : ''
    const name = (names.has(sub) && sub) || matchKnown(plate, known)
    const s = (ev.start_time || 0) * 1000
    let p = map.get(plate)
    if (!p) map.set(plate, (p = { plate, name: null, cams: [], last: 0, count: 0, events: [] }))
    p.count++
    p.events.push(ev)
    if (name) p.name = name
    if (ev.camera && !p.cams.includes(ev.camera)) p.cams.push(ev.camera)
    if (s > p.last) { p.last = s; p.lastEvent = ev }
  }
  const out = [...map.values()]
  for (const p of out) p.events.sort((a, b) => b.start_time - a.start_time)
  return out.sort((a, b) => b.last - a.last)
}

// Filtre texte : plaque (sans tirets ni espaces, insensible à la casse), nom connu ou caméra
export function filterPlates(list, q, camName = (c) => c) {
  const n = normalize(q), l = String(q || '').trim().toLowerCase()
  if (!l) return list
  return list.filter((p) => normalize(p.plate).includes(n) || (p.name && p.name.toLowerCase().includes(l)) || p.cams.some((c) => String(camName(c)).toLowerCase().includes(l)))
}

/* ---- API ---- */
export const getPlateEvents = (server, { after, limit = 500 } = {}) =>
  getJson(server, `/api/events?recognized_license_plate=${encodeURIComponent(ANY_PLATE)}&limit=${limit}${after ? `&after=${Math.floor(after)}` : ''}`, { timeout: 20000 })
