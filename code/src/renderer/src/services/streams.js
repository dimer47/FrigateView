// Choix du flux go2rtc pour le direct : HD (flux principal) ou SD (sous-flux).
// Source : live.streams de la config Frigate (≥ 0.15), ex. { "Principal": "garage", "Sous-flux": "garage_sub" }.
// Sans cette déclaration, seul le flux principal (nom de la caméra) existe : comportement historique.

const LOW = /sub|low|bas|sd|lq|mobile|small|petit/i

// auto = adaptatif (services/adaptive.js) ; light = règle fixe (SD dès 4 cases, HD agrandie) ; high / low = verrouillé
export const QUALITIES = ['auto', 'light', 'high', 'low']

export function streamsOf(cam) {
  const list = Object.entries(cam?.streams || {}).filter(([, id]) => id).map(([label, id]) => ({ label, id }))
  return list.length ? list : [{ label: 'HD', id: cam?.id }]
}

export const hasSubStream = (cam) => streamsOf(cam).length > 1

export function pickStream(cam, quality) {
  const list = streamsOf(cam)
  if (list.length === 1) return list[0]
  const low = list.find((s) => LOW.test(s.label) || LOW.test(s.id)) || list[list.length - 1]
  const high = list.find((s) => s !== low) || list[0]
  return quality === 'low' ? low : high
}

// Qualité effective d'une case : choix manuel de la case > réglage global > auto
// (light, et auto hors adaptatif : SD dès 4 cases affichées, HD en caméra agrandie ou en petite mosaïque).
export function cellQuality({ pref = 'auto', override = null, tiles = 1, focused = false } = {}) {
  if (override) return override
  if (pref === 'high' || pref === 'low') return pref
  return !focused && tiles >= 4 ? 'low' : 'high'
}
