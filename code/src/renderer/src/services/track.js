// Parcours d'un objet suivi (logique pure, testée)
//
// Frigate (0.16+) :
//  · /api/events/{id} → data.path_data : [[[x, y], horodatage], …], points en fractions (0–1)
//    de l'image de détection (bas du cadre, là où l'objet touche le sol)
//  · /api/timeline?source_id={id} → étapes : class_type visible | entered_zone | active | stationary |
//    attribute | gone…, avec data.zones, data.attribute, data.box et timestamp (secondes)

const num = (v) => typeof v === 'number' && Number.isFinite(v)

// Trajet : points valides, dans l'ordre du temps
export function pathPoints(ev) {
  const raw = ev?.data?.path_data
  if (!Array.isArray(raw)) return []
  return raw
    .map((p) => (Array.isArray(p) && Array.isArray(p[0]) ? { x: p[0][0], y: p[0][1], t: p[1] } : null))
    .filter((p) => p && num(p.x) && num(p.y))
    .map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)), t: num(p.t) ? p.t * 1000 : null }))
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
}

// Polyligne SVG (viewBox 0 0 1 1)
export const pathString = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ')

// Étapes de la chronologie : { t (ms), kind, zones, attribute }, triées, doublons consécutifs retirés
export function trackSteps(timeline) {
  if (!Array.isArray(timeline)) return []
  const out = []
  for (const x of timeline.slice().sort((a, b) => (a?.timestamp ?? 0) - (b?.timestamp ?? 0))) {
    if (!x || !num(x.timestamp)) continue
    const d = x.data || {}
    const step = { t: x.timestamp * 1000, kind: String(x.class_type || 'other'), zones: Array.isArray(d.zones) ? d.zones : [], attribute: d.attribute || '' }
    const prev = out[out.length - 1]
    if (prev && prev.kind === step.kind && prev.zones.join() === step.zones.join() && prev.attribute === step.attribute) continue
    out.push(step)
  }
  return out
}
