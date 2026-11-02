// Actions sur un événement (revue) et ses objets suivis. Vérifié dans le source de Frigate 0.18.2 :
//  · frigate/api/event.py  : POST /api/events/{id}/sub_label { subLabel, camera } (admin ; "" = retiré)
//                            POST /api/events/{id}/plus { include_annotation } (admin ; Frigate+ actif : config.plus.enabled)
//  · frigate/api/review.py : POST /api/reviews/delete { ids } (admin) — supprime la revue ET les enregistrements
//                            de cette période sur la caméra (Recordings…unlink)
import { sendJson } from './frigate'

export const plusEnabled = (config) => config?.plus?.enabled === true
// Sous-libellé : 100 caractères au plus (EventsSubLabelBody)
export const validSubLabel = (s) => String(s ?? '').trim().length <= 100

export const setSubLabel = (server, id, subLabel, camera) =>
  sendJson(server, `/api/events/${encodeURIComponent(id)}/sub_label`, 'POST', { subLabel: String(subLabel || '').trim(), ...(camera && { camera }) })
export const sendToPlus = (server, id) => sendJson(server, `/api/events/${encodeURIComponent(id)}/plus`, 'POST', { include_annotation: 1 })
export const deleteReviews = (server, ids) => sendJson(server, '/api/reviews/delete', 'POST', { ids })
