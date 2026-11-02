// Plaques d'immatriculation (LPR de Frigate 0.16+, fonction de base).
// Vérifié dans le source de Frigate (branche dev) :
//  · frigate/config/classification.py : lpr.enabled (global, surchargeable par caméra), lpr.known_plates { nom: [plaques ou regex] }
//  · frigate/api/event.py : GET /api/events?recognized_license_plate=… (valeur avec ^ . [ ] ? + * → regex SQL, sinon égalité) ;
//    la plaque est dans data.recognized_license_plate
//  · frigate/api/app.py : GET /api/recognized_license_plates (liste triée des plaques vues)
//  · frigate/data_processing/common/license_plate/mixin.py : plaque connue (re.match(^regex$) ou distance de Levenshtein
//    ≤ match_distance) → sub_label = nom connu
// Édition de known_plates (compte admin, Frigate 0.17+) : PUT /api/config/set avec config_data (absent en 0.16).
//  · 0.18 : même appel que l'interface de Frigate (web/src/pages/Settings.tsx, utils/configUtil.ts) :
//    requires_restart 0 + update_topic « config/lpr » → pris en compte sans redémarrage ;
//    replace_paths réécrit la liste entière (sinon les clés sont fusionnées et un nom retiré resterait).
//  · 0.17 : replace_paths inconnu → fusion ; un nom vidé est envoyé avec une liste vide.
//    Prise en compte à chaud non garantie : redémarrage de Frigate conseillé.
import { getJson, sendJson } from './frigate'

// Toute plaque non vide (regex : seule forme acceptée par Frigate pour « plaque présente »)
export const ANY_PLATE = '^.+'

const normalize = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '')
export const plateKey = normalize

// Motif enregistré dans known_plates : Frigate compare au caractère près (re.match ^…$ ou Levenshtein ≤ match_distance,
// data_processing/common/license_plate/mixin.py), « CV-419-HJ » ne reconnaîtrait pas « CV419HJ ».
// D'où « CV[- ]?419[- ]?HJ » : tiret ou espace facultatif entre les groupes de lettres et de chiffres.
const SEP = '[- ]?'
export const plateRegex = (plate) => (normalize(plate).match(/[A-Z]+|\d+|[^A-Z\d]+/g) || []).join(SEP)
// Clé d'une entrée de known_plates (motif ci-dessus ou plaque saisie à la main)
export const knownKey = (p) => normalize(String(p).split(SEP).join(''))
// Affichage d'une entrée : motif généré → plaque lisible, autre regex → telle quelle
export const knownLabel = (p) => (/^[A-Z0-9]+(\[- \]\?[A-Z0-9]+)*$/.test(p) ? displayPlate(knownKey(p), new Map([[p, 1]])) : p)

// Forme affichée d'un groupe de variantes (« CV419HJ », « CV-419HJ »…) :
// format SIV français AA-123-AA si la plaque s'y prête, sinon la variante la plus vue (la plus récente à égalité)
export function displayPlate(key, counts) {
  const m = key.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || key
}

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
      if (knownKey(p) === normalize(plate)) return k.name // tirets et espaces ignorés
      try { if (new RegExp(`^${p}$`).test(plate)) return k.name } catch { /* regex invalide : ignorée */ }
    }
  }
  return null
}

// Événements Frigate → plaques agrégées, la plus récemment vue d'abord.
// Les lectures qui ne diffèrent que par les tirets ou les espaces sont réunies (clé = plateKey) ;
// `variants` garde les écritures exactes lues par Frigate.
export function aggregatePlates(events, known = []) {
  const names = new Set(known.map((k) => k.name))
  const map = new Map()
  for (const ev of events || []) {
    const raw = ev?.data?.recognized_license_plate
    if (!raw) continue
    const key = normalize(raw)
    const sub = ev.sub_label ? String(Array.isArray(ev.sub_label) ? ev.sub_label[0] : ev.sub_label).trim() : ''
    const name = (names.has(sub) && sub) || matchKnown(raw, known)
    const s = (ev.start_time || 0) * 1000
    let p = map.get(key)
    if (!p) map.set(key, (p = { key, plate: raw, name: null, cams: [], last: 0, count: 0, events: [], counts: new Map() }))
    p.count++
    p.counts.set(raw, (p.counts.get(raw) || 0) + 1)
    p.events.push(ev)
    if (name) p.name = name
    if (ev.camera && !p.cams.includes(ev.camera)) p.cams.push(ev.camera)
    if (s > p.last) { p.last = s; p.lastEvent = ev }
  }
  const out = [...map.values()]
  for (const p of out) {
    p.events.sort((a, b) => b.start_time - a.start_time)
    p.variants = [...p.counts.keys()]
    p.plate = displayPlate(p.key, p.counts)
    delete p.counts
  }
  return out.sort((a, b) => b.last - a.last)
}

// Filtre texte : plaque (sans tirets ni espaces, insensible à la casse), nom connu ou caméra
export function filterPlates(list, q, camName = (c) => c) {
  const n = normalize(q), l = String(q || '').trim().toLowerCase()
  if (!l) return list
  return list.filter((p) => normalize(p.plate).includes(n) || (p.name && p.name.toLowerCase().includes(l)) || p.cams.some((c) => String(camName(c)).toLowerCase().includes(l)))
}

// Version « 0.17.2-abc » → [0, 17, 2]
const ver = (v) => String(v || '').split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0)
const atLeast = (v, min) => { const a = ver(v); for (let i = 0; i < 3; i++) if (a[i] !== min[i]) return a[i] > min[i]; return true }
export const canEditKnown = (version) => atLeast(version, [0, 17, 0])
export const hotReloadKnown = (version) => atLeast(version, [0, 18, 0])

// Nom de plaque connue : non vide, 50 caractères, sans point (le point sépare les niveaux dans config_data)
export const validPlateName = (s) => { const n = String(s || '').trim(); return n.length > 0 && n.length <= 50 && !n.includes('.') }

// Nouvelle table known_plates : la plaque (et ses variantes de tirets/espaces) retirée de tous les noms, puis rangée sous `name`
// (name vide = simple retrait). Les noms vidés sont listés à part (vides à envoyer en 0.17).
export function namePlate(known, plate, name) {
  const map = {}, emptied = []
  for (const k of known) {
    const rest = k.plates.filter((p) => knownKey(p) !== normalize(plate)) // toutes les variantes de la plaque
    if (rest.length) map[k.name] = rest
    else emptied.push(k.name)
  }
  const n = String(name || '').trim()
  if (n) { map[n] = [...(map[n] || []), plateRegex(plate)]; const i = emptied.indexOf(n); if (i >= 0) emptied.splice(i, 1) }
  return { map, emptied }
}

/* ---- API ---- */
export async function saveKnownPlates(server, version, { map, emptied }) {
  const hot = hotReloadKnown(version)
  const known = hot ? map : { ...map, ...Object.fromEntries(emptied.map((n) => [n, []])) }
  await sendJson(server, '/api/config/set', 'PUT', {
    requires_restart: 0,
    update_topic: 'config/lpr',
    config_data: { lpr: { known_plates: known } },
    ...(hot && { replace_paths: ['lpr.known_plates'] })
  })
}

export const getPlateEvents = (server, { after, limit = 500 } = {}) =>
  getJson(server, `/api/events?recognized_license_plate=${encodeURIComponent(ANY_PLATE)}&limit=${limit}${after ? `&after=${Math.floor(after)}` : ''}`, { timeout: 20000 })
