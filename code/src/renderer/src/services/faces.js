// Bibliothèque de visages de Frigate (reconnaissance faciale, 0.16+).
// Routes lues dans frigate/api/classification.py et web/src/pages/FaceLibrary.tsx (branche master, 0.17) :
//   GET  /api/faces                          → { nom: [fichiers], train: [fichiers] }
//   POST /api/faces/{nom}/create             → crée le dossier (espaces → « _ »)
//   POST /api/faces/{nom}/register           → multipart, champ « file »
//   POST /api/faces/train/{nom}/classify     → { training_file } : visage récent attribué à {nom}
//   POST /api/faces/{nom}/delete             → { ids: [fichiers] } (dossier supprimé quand il est vide ; {nom} = train pour les récents)
//   PUT  /api/faces/{ancien}/rename          → { new_name }
//   Images servies sous /clips/faces/{nom}/{fichier}
// Toutes les modifications exigent le rôle admin et renvoient 400 « Face recognition is not enabled » si la fonction est coupée.
// À vérifier sur un vrai serveur : format exact des noms des fichiers d'une personne ({nom}-{horodatage}.webp),
// et accès aux images /clips/faces/… pour un compte viewer.
import { baseUrl, getJson, sendJson, uploadImage } from './frigate'

export const TRAIN = 'train'
const enc = encodeURIComponent

// Visage récent : « {id événement en 2 parties}-{horodatage}-{nom reconnu}-{score}.webp »
// (même découpage que FaceLibrary.tsx). Champs absents → null.
export function parseTrainFile(file) {
  const p = String(file).replace(/\.(webp|png|jpe?g)$/i, '').split('-')
  const num = (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : null }
  const ts = num(p[2])
  return {
    file,
    eventId: p.length >= 2 ? `${p[0]}-${p[1]}` : null,
    ts: ts ? ts * 1000 : null,
    name: p[3] && p[3] !== 'unknown' ? p[3] : null,
    score: p.length >= 5 ? num(p[4]) : null
  }
}

// Image d'une personne : « {nom}-{horodatage}.webp » (horodatage = dernier segment numérique)
export function imageTime(file) {
  const m = String(file).match(/-(\d{9,}(?:\.\d+)?)\.(webp|png|jpe?g)$/i)
  return m ? Number(m[1]) * 1000 : null
}

const byNewest = (a, b) => (imageTime(b) ?? 0) - (imageTime(a) ?? 0) || String(b).localeCompare(String(a))

// Réponse de /api/faces → personnes triées par nom, images les plus récentes d'abord, visages récents à part
export function parseFaces(json) {
  const out = { people: [], train: [] }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return out
  for (const [name, files] of Object.entries(json)) {
    const list = Array.isArray(files) ? files.filter((f) => typeof f === 'string') : []
    if (name === TRAIN) out.train = list.map(parseTrainFile).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
    else out.people.push({ name, images: [...list].sort(byNewest) })
  }
  out.people.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return out
}

export const faceImageUrl = (server, name, file) => `${baseUrl(server)}/clips/faces/${enc(name)}/${enc(file)}`

// Nom acceptable par Frigate (rename : lettres, chiffres, espaces, ' _ -, 50 caractères)
export const validName = (s) => /^[\p{L}\p{N}\s'_-]{1,50}$/u.test(String(s).trim()) && String(s).trim().toLowerCase() !== TRAIN
export const folderName = (s) => String(s).trim().replace(/ /g, '_')

// Réglage global face_recognition.enabled de /api/config (absent = désactivé, comme dans Frigate)
export const faceRecognitionEnabled = (config) => config?.face_recognition?.enabled === true

// Sélection avec Maj : plage entre le dernier clic et le clic courant
export function rangeSelect(list, selected, from, to) {
  const a = list.indexOf(from), b = list.indexOf(to)
  if (a < 0 || b < 0) return new Set([...selected, to])
  const [i, j] = a < b ? [a, b] : [b, a]
  return new Set([...selected, ...list.slice(i, j + 1)])
}

/* ---- API ---- */
export const getFaces = async (server) => parseFaces(await getJson(server, '/api/faces', { timeout: 15000 }))
export const createFace = (server, name) => sendJson(server, `/api/faces/${enc(folderName(name))}/create`)
export const classifyFace = (server, file, name) => sendJson(server, `/api/faces/train/${enc(name)}/classify`, 'POST', { training_file: file })
export const deleteFaceImages = (server, name, ids) => sendJson(server, `/api/faces/${enc(name)}/delete`, 'POST', { ids })
export const renameFace = (server, oldName, newName) => sendJson(server, `/api/faces/${enc(oldName)}/rename`, 'PUT', { new_name: newName.trim() })
export const registerFace = (server, name, img) => uploadImage(server, `/api/faces/${enc(name)}/register`, img)
