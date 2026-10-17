// Cadres de détection sur la meilleure image d'un événement (logique pure, testée)
//
// Vérifié dans le code source de Frigate (dev, frigate/events/maintainer.py + util/builtin.py to_relative_box) :
//  · /api/events/{id} → data.box, data.region : [x, y, largeur, hauteur], fractions (0–1) de l'image de détection
//    (detect.width × detect.height), relevées sur l'image retenue comme meilleure image (« snapshot »)
//  · data.attributes : [{ label: 'face' | 'license_plate' | …, score, box: même format }]
//  · /api/events/{id}/snapshot.jpg?bbox=0&crop=0&timestamp=0 : cette même image, entière et sans cadre dessiné
//    (la vignette thumbnail.webp est recadrée sur la région : les coordonnées ne s'y appliquent pas)
// Nom reconnu : sub_label (visage ou nom d'une plaque connue), plaque lue dans data.recognized_license_plate.

const clamp01 = (v) => Math.min(1, Math.max(0, v))

// [x, y, w, h] valide → rectangle borné à l'image, sinon null
export function toRect(box) {
  if (!Array.isArray(box) || box.length !== 4 || box.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null
  const x = clamp01(box[0]), y = clamp01(box[1])
  // Côté inchangé quand le cadre est déjà dans l'image (pas d'arrondi flottant)
  const side = (o, l) => (o >= 0 && o + l <= 1 ? l : clamp01(o + l) - clamp01(o))
  const w = side(box[0], box[2]), h = side(box[1], box[3])
  return w > 0 && h > 0 ? { x, y, w, h } : null
}

const subLabelOf = (ev) => {
  const s = Array.isArray(ev?.sub_label) ? ev.sub_label[0] : ev?.sub_label
  return s ? String(s) : ''
}

// Événement Frigate → cadres à dessiner : l'objet, puis ses attributs (visage, plaque…)
export function eventBoxes(ev) {
  const d = ev?.data || {}
  const out = []
  const main = toRect(d.box)
  const plate = d.recognized_license_plate || ''
  const sub = subLabelOf(ev)
  if (main) out.push({ kind: 'object', ...main, label: ev.label || '', score: d.score ?? d.top_score ?? ev.top_score ?? null, name: sub })
  for (const a of Array.isArray(d.attributes) ? d.attributes : []) {
    const r = toRect(a?.box)
    if (!r) continue
    const name = a.label === 'license_plate' ? plate : a.label === 'face' && ev.label === 'person' ? sub : ''
    out.push({ kind: 'attribute', ...r, label: a.label || '', score: a.score ?? null, name })
  }
  return out
}

// Texte de l'étiquette : « Personne 87 % · Alex »
export function boxCaption(b, labelOf = (l) => l) {
  const parts = [labelOf(b.label)]
  if (typeof b.score === 'number') parts[0] += ` ${Math.round(b.score * 100)} %`
  if (b.name) parts.push(b.name)
  return parts.join(' · ')
}

// Plusieurs objets dans une revue : on affiche d'abord celui qui porte un nom, puis le meilleur score
export function pickEvent(events) {
  const list = (events || []).filter((e) => e?.id)
  const rank = (e) => (subLabelOf(e) || e.data?.recognized_license_plate ? 2 : 0) + (e.data?.top_score ?? e.top_score ?? e.data?.score ?? 0)
  return list.slice().sort((a, b) => rank(b) - rank(a))[0] || null
}
