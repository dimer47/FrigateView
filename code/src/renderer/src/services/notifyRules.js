// Notifications d'évènements : règles par type d'objet, gravité, caméra et zone (logique pure, testée)
//
// Réglages (Réglages › Notifications) :
//  · notifyTypes : { person: true, car: false, … }
//  · notifySeverity : 'all' | 'alert' (alertes seulement)
//  · notifyCamsOff : caméras exclues (liste d'identifiants ; vide = toutes)
//  · notifyZones : zones requises (vide = partout) ; l'évènement doit toucher au moins l'une d'elles
export function wantNotify(e, s) {
  if (!e || !s?.notify || s.dnd) return false
  if (!s.notifyTypes?.[e.type]) return false
  if (s.notifySeverity === 'alert' && e.severity !== 'alert') return false
  if ((s.notifyCamsOff || []).includes(e.cam)) return false
  const zones = s.notifyZones || []
  if (zones.length && !(e.zones || []).some((z) => zones.includes(z))) return false
  return true
}
