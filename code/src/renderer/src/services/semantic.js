// Recherche sémantique de Frigate (0.14+ ; logique pure, testée)
//
// Vérifié dans le code source de Frigate (dev) :
//  · frigate/api/event.py events_search : GET /api/events/search
//    paramètres (api/defs/query/events_query_parameters.py EventsSearchQueryParams) : query, event_id, search_type
//    (« thumbnail », « description », « thumbnail,description » ou « similarity »), limit (50), cameras, labels…
//    400 « Semantic search is not enabled » si semantic_search.enabled est faux ; 400 sans query ni event_id
//  · réponse : liste d'événements avec search_distance (plus petit = plus proche) et search_source
//  · semantic_search.enabled lu dans /api/config (défaut false, config/classification.py)
//  · score affiché comme l'interface web (views/search/SearchView.tsx zScoreToConfidence) :
//    similarité → 1 − distance ; texte → 1 / (1 + e^distance) (distance normalisée en z-score)

export const semanticEnabled = (config) => !!config?.semantic_search?.enabled

const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
  .map(([k, v]) => `${k}=${(Array.isArray(v) ? v : [v]).map(encodeURIComponent).join(',')}`).join('&')

export const SEARCH_TYPES = ['thumbnail,description', 'thumbnail', 'description']

// Recherche par texte libre
export function searchPath({ query, type = 'thumbnail,description', cameras = [], labels = [], limit = 50 } = {}) {
  const q = String(query || '').trim()
  if (!q) return null
  return `/api/events/search?${qs({ query: q, search_type: SEARCH_TYPES.includes(type) ? type : 'thumbnail', cameras, labels, limit })}`
}

// Événements ressemblant à un autre (même apparence)
export function similarPath(eventId, { cameras = [], limit = 50 } = {}) {
  return eventId ? `/api/events/search?${qs({ search_type: 'similarity', event_id: eventId, cameras, limit })}` : null
}

// Distance → pourcentage de confiance (0–100), null si absente
export function confidence(distance, similarity) {
  if (typeof distance !== 'number' || !Number.isFinite(distance)) return null
  const c = similarity ? 1 - distance : 1 / (1 + Math.exp(distance))
  return Math.round(Math.min(1, Math.max(0, c)) * 100)
}

// Résultats triés du plus proche au plus éloigné, sans l'événement de départ
export function rankResults(list, { similarity = false, exclude = null } = {}) {
  return (Array.isArray(list) ? list : []).filter((e) => e?.id && e.id !== exclude)
    .map((e) => ({ ev: e, score: confidence(e.search_distance, similarity) }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
}
