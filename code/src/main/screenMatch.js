// Murs vidéo : retrouver l'écran d'un mur quand son identifiant a changé (logique pure, testée)
//
// Sous Windows, l'identifiant d'un écran peut changer après un redémarrage ou un rebranchement.
// Chaque mur garde donc aussi le nom de l'écran (« DELL U2419H ») et sa position / taille :
// un écran absent est recherché parmi les écrans branchés, d'abord à nom et position identiques,
// puis à nom et taille identiques, enfin au seul nom s'il n'y a aucune ambiguïté.

const same = (a, b, keys) => !!a && !!b && keys.every((k) => a[k] === b[k])

// conf : { idÉcran: { layout, enabled, mode, label, bounds } } ; displays : [{ id, label, bounds }]
// → { conf (identifiants à jour, nom et position mémorisés), moved: [[ancien, nouveau]] }
export function remapScreens(conf, displays) {
  const out = {}, moved = []
  const ids = new Set(displays.map((d) => String(d.id)))
  const byId = new Map(displays.map((d) => [String(d.id), d]))
  const taken = new Set(Object.keys(conf || {}).filter((id) => ids.has(id)))
  for (const [id, c] of Object.entries(conf || {})) {
    if (ids.has(id)) { out[id] = c; continue }
    const free = displays.filter((d) => !taken.has(String(d.id)) && c?.label && d.label === c.label)
    const pick = free.find((d) => same(d.bounds, c.bounds, ['x', 'y', 'width', 'height']))
      || free.find((d) => same(d.bounds, c.bounds, ['width', 'height']))
      || (free.length === 1 ? free[0] : null)
    if (!pick) { out[id] = c; continue } // écran débranché : réglage gardé pour son retour
    const nid = String(pick.id)
    taken.add(nid); out[nid] = c; moved.push([id, nid])
  }
  // Nom et position à jour pour les écrans présents
  for (const [id, c] of Object.entries(out)) {
    const d = byId.get(id)
    if (d) out[id] = { ...c, label: d.label || c.label || '', bounds: { ...d.bounds } }
  }
  return { conf: out, moved }
}
