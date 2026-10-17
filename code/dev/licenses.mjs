// Génère ../THIRD_PARTY_NOTICES.md : composants livrés dans l'application et leur licence.
// npm run licenses — à relancer après tout changement de dépendances.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
// Paquets réellement inclus dans l'app (imports du code + moteur Electron)
const ROOTS = ['electron', 'electron-updater', 'vue', 'pinia', 'vue-i18n', 'hls.js', 'tailwindcss']
const seen = new Map()
const pkgOf = (name) => { const p = join(root, 'node_modules', name, 'package.json'); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null }
const lic = (p) => (typeof p.license === 'string' ? p.license : p.license?.type || (p.licenses || []).map((l) => l.type || l).join(' OR ') || 'voir le paquet')
function walk(name, top) {
  if (seen.has(name)) return
  const p = pkgOf(name)
  if (!p) return
  seen.set(name, { version: p.version, license: lic(p) })
  if (top === 'electron') return // Electron : binaire, dépendances de téléchargement non livrées
  for (const d of Object.keys(p.dependencies || {})) walk(d, top)
}
for (const r of ROOTS) walk(r, r)
const rows = [...seen].sort(([a], [b]) => a.localeCompare(b))
const count = {}
for (const [, v] of rows) count[v.license] = (count[v.license] || 0) + 1
const summary = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`).join(', ')
writeFileSync(join(root, '..', 'THIRD_PARTY_NOTICES.md'), `# Composants tiers

FrigateView est distribué sous licence AGPL-3.0-or-later (voir \`LICENSE\`), avec les conditions supplémentaires de \`ADDITIONAL_TERMS.md\`.
Il s'appuie sur les composants ci-dessous, chacun sous sa propre licence, toutes compatibles avec l'AGPL.
Fichier généré par \`npm run licenses\` (dossier \`code\`) : à relancer après tout changement de dépendances.

## Moteur et logiciels associés

| Composant | Licence | Usage |
|---|---|---|
| Electron (Chromium, Node.js, FFmpeg) | MIT ; Chromium : BSD-3-Clause et autres, liste complète dans \`LICENSES.chromium.html\` livré avec l'app | exécution de l'application |
| Frigate NVR (serveur, non livré) | MIT | serveur de vidéosurveillance interrogé par l'app |

FrigateView est un projet indépendant, sans lien avec les auteurs de Frigate.

## Dépendances npm livrées (${rows.length})

Synthèse : ${summary}.

| Paquet | Version | Licence |
|---|---|---|
${rows.map(([n, v]) => `| ${n} | ${v.version} | ${v.license} |`).join('\n')}
`)
console.log(`${rows.length} paquets → THIRD_PARTY_NOTICES.md`)
