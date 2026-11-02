// Ordre des caméras choisi par glisser-déposer
export function applyOrder(cameras, ids) {
  if (!ids?.length) return cameras
  const rank = (c) => { const i = ids.indexOf(c.id); return i < 0 ? ids.length : i }
  return [...cameras].sort((a, b) => rank(a) - rank(b)) // tri stable : les nouvelles caméras gardent l'ordre Frigate, à la fin
}
export function moveId(ids, id, target, after) {
  const out = ids.filter((x) => x !== id)
  const i = out.indexOf(target)
  if (i < 0) return ids
  out.splice(after ? i + 1 : i, 0, id)
  return out
}
