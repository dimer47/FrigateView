// Filtres du panneau des événements et recherche dans l'historique (logique pure, testée)
//
// API Frigate utilisée (vérifiée dans le code source 0.16/0.17, frigate/api/defs/query/*) :
//  · /api/review : cameras, labels, zones, reviewed, limit, severity, before, after (listes séparées par des virgules)
//  · /api/events : cameras, labels, sub_labels, zones, recognized_license_plate, after, before, limit…
//    sub_label est une chaîne (« bob, john »), la plaque est dans data.recognized_license_plate.
// Hypothèses NON vérifiées sur un vrai serveur :
//  · /api/sub_labels et /api/recognized_license_plates renvoient une liste de chaînes (absence tolérée)
//  · dans les revues, data.sub_labels contient visages ET plaques reconnus, sans les distinguer
//  · /api/review sans « limit » renvoie tout : on passe toujours une limite, la pagination se fait par « before »

import { plateKey, plateRegex, displayPlate, matchKnown } from '@/services/plates'
export const FILTER_KEYS = ['object', 'face', 'plate', 'zone', 'cam']
export const emptyFilters = () => Object.fromEntries(FILTER_KEYS.map((k) => [k, []]))
export const hasFilters = (f) => FILTER_KEYS.some((k) => f[k]?.length)
export const PAGE = 50

// Plaque d'immatriculation : lettres ET chiffres, 4 à 10 caractères (tirets/espaces permis), sans minuscule.
// Un visage est un prénom (« Alex », « Marie-Jo ») : pas de chiffre. Les plaques connues du serveur priment.
// Les noms de plaques connues (« Voiture de Marie », config lpr.known_plates) sont rangés avec les plaques.
export function isPlate(s, knownPlates) {
  if (knownPlates?.has?.(s)) return true
  const v = String(s).trim()
  const bare = v.replace(/[\s-]/g, '')
  return /^[A-Z0-9]{4,10}$/.test(bare) && /\d/.test(bare) && /[A-Z]/.test(bare) && v === v.toUpperCase()
}

export function classify(labels, knownPlates) {
  const faces = [], plates = []
  for (const l of labels || []) if (l) (isPlate(l, knownPlates) ? plates : faces).push(l)
  return { faces, plates }
}

// Filtres cumulables : ET entre catégories, OU entre valeurs d'une même catégorie
// knownList : plaques connues [{ name, plates }] (config lpr.known_plates). Un nom choisi trouve aussi les passages
// de ses plaques, y compris ceux d'avant le nommage (Frigate n'y a pas mis le nom).
export function matchFilters(e, f, knownPlates, knownList = []) {
  const { faces, plates } = classify(e.subLabels, knownPlates)
  const any = (sel, vals) => !sel?.length || sel.some((x) => vals.includes(x))
  // Plaques : tirets et espaces ignorés (« CV-419HJ » = « CV419HJ »)
  const anyPlate = (sel, vals) => !sel?.length || sel.some((x) => {
    const entry = knownList.find((k) => k.name === x)
    return vals.some((v) => plateKey(v) === plateKey(x) || (entry && matchKnown(v, [entry])))
  })
  return any(f.object, e.objects) && any(f.face, faces) && anyPlate(f.plate, plates) && any(f.zone, e.zones) && any(f.cam, [e.cam])
}

export function toggleFilter(f, key, value) {
  const cur = f[key] || []
  return { ...f, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] }
}

const uniqSorted = (a) => [...new Set(a.filter(Boolean))].sort((x, y) => String(x).localeCompare(String(y)))

// Plaques proposées : une entrée par plaque (variantes de tirets/espaces réunies, forme lisible), noms connus en tête.
// Une plaque couverte par un nom connu (known_plates) n'est pas répétée : le nom la représente.
export function plateOptions(values, names = [], knownList = []) {
  const groups = new Map(), nameSet = new Set(names)
  for (const v of values) {
    if (!v || nameSet.has(v) || matchKnown(v, knownList)) continue
    const k = plateKey(v)
    if (!groups.has(k)) groups.set(k, new Map())
    groups.get(k).set(v, (groups.get(k).get(v) || 0) + 1)
  }
  return [...uniqSorted(names), ...uniqSorted([...groups].map(([k, c]) => displayPlate(k, c)))]
}

// Valeurs proposées dans les menus : événements chargés + listes du serveur
export function filterOptions(items, known = {}) {
  const names = known.plateNames || []
  const plates = new Set([...(known.plates || []), ...names])
  const subs = [...items.flatMap((e) => e.subLabels), ...(known.subLabels || [])]
  const { faces, plates: p } = classify(subs, plates)
  return {
    object: uniqSorted([...items.flatMap((e) => e.objects), ...(known.labels || [])]),
    face: uniqSorted([...faces, ...(known.faceNames || [])]), // + personnes de la bibliothèque (compte admin)
    plate: plateOptions([...p, ...(known.plates || [])], names, known.knownList || []),
    zone: uniqSorted([...items.flatMap((e) => e.zones), ...(known.zones || [])]),
    cam: uniqSorted([...items.map((e) => e.cam), ...(known.cams || [])])
  }
}

// Plages rapides : aujourd'hui, 7 j, 30 j (secondes ; before = null : jusqu'à maintenant, temps réel compris)
export function rangePreset(key, now = Date.now()) {
  const nowS = Math.floor(now / 1000)
  if (key === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return { after: Math.floor(d / 1000), before: null } }
  const days = { '7d': 7, '30d': 30 }[key]
  return { after: days ? nowS - days * 86400 : null, before: null }
}
// Champs <input type="date"> (« 2026-10-01 ») → secondes, fin de journée incluse
export function rangeFromDates(from, to) {
  const at = (s, end) => { if (!s) return null; const d = new Date(s + 'T00:00:00'); if (end) d.setDate(d.getDate() + 1); return Math.floor(d / 1000) }
  return { after: at(from, false), before: at(to, true) }
}

const qs = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
  .map(([k, v]) => `${k}=${(Array.isArray(v) ? v : [v]).map((x) => encodeURIComponent(x)).join(',')}`).join('&')

// Visage ou plaque demandé → /api/events (seul à filtrer sub_label / plaque côté serveur), sinon /api/review
export function historyQuery(f, { after, before, limit = PAGE, knownList = [] } = {}) {
  const common = { cameras: f.cam, labels: f.object, zones: f.zone, after: after != null ? Math.floor(after) : null, before: before != null ? Math.ceil(before) : null, limit }
  if (f.face?.length || f.plate?.length) {
    // Plaque : cherchée dans recognized_license_plate (0.16+) ET dans sub_labels (anciennes versions) via deux requêtes
    return { kind: 'events', paths: [
      `/api/events?${qs({ ...common, sub_labels: [...(f.face || []), ...(f.plate || [])] })}`,
      ...(f.plate?.length ? [`/api/events?${qs({ ...common, recognized_license_plate: f.plate.flatMap((x) => knownList.find((k) => k.name === x)?.plates || [isPlate(x) ? plateRegex(x) : x]) })}`] : [])
    ] }
  }
  return { kind: 'review', paths: [`/api/review?${qs(common)}`] }
}

// Fusion de pages : sans doublon, du plus récent au plus ancien
export function mergePages(list, page) {
  const seen = new Set(list.map((e) => e.id))
  return [...list, ...page.filter((e) => !seen.has(e.id) && seen.add(e.id))].sort((a, b) => b.s - a.s)
}

// Événement Frigate (/api/events) → même forme qu'une revue normalisée
export function fromEvent(ev, thumb) {
  const subs = ev.sub_label ? String(Array.isArray(ev.sub_label) ? ev.sub_label[0] : ev.sub_label).split(',').map((x) => x.trim()).filter(Boolean) : []
  const plate = ev.data?.recognized_license_plate
  return {
    id: ev.id,
    cam: ev.camera,
    s: ev.start_time * 1000,
    e: ev.end_time ? ev.end_time * 1000 : null,
    type: ev.label === 'person' ? 'person' : ['car', 'motorcycle', 'truck', 'bus', 'bicycle'].includes(ev.label) ? 'car' : ['dog', 'cat', 'bird', 'horse'].includes(ev.label) ? 'animal' : 'other',
    severity: ev.label === 'person' ? 'alert' : 'detection', // approximation : /api/events ne donne pas la gravité
    objects: [ev.label],
    subLabels: [...new Set([...subs, ...(plate ? [plate] : [])])],
    zones: ev.zones || [],
    detections: [ev.id],
    thumb,
    seen: true, // « vu » concerne les revues, pas les événements
    fromEvents: true
  }
}
