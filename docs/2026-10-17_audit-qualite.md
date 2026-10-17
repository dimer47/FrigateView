# Audit qualité FrigateView — 2026-10-17

Lecture seule du code (commit c260233). Chemins relatifs à `code/`.

## Synthèse

- Code compact (~3 500 lignes), lisible, bien commenté en français
- Sécurité de base correcte : contextIsolation, CSP, safeStorage, épinglage de certificat, chemins d'écriture limités
- Points faibles : IPC `http` sans restriction d'hôte, `openExternal` sans filtre, fenêtres murs sans garde de navigation, Fuses Electron absents
- Robustesse : plusieurs courses asynchrones (WebRTC, relecture, polling qui se chevauche), croissance mémoire sur un mur 24/7
- Aucun test automatisé ; CI de release seulement
- **Note globale : 6,5/10**

## Problèmes

### Critique

- Aucun point critique vérifié (pas de RCE directe, pas de secret en clair dans le dépôt)

### Important

1. **`src/main/index.js:244-247`** — `shell.openExternal(url)` sans filtre de schéma
   - Échec : un lien `file:///…`, `smb://…` ou schéma personnalisé (contenu Frigate injecté, XSS future) exécute/ouvre une ressource locale
   - Correctif : n'accepter que `https?:` (`new URL(url).protocol`)

2. **`src/main/index.js:297-303`** — fenêtres murs sans `setWindowOpenHandler` ni `will-navigate`
   - Échec : `window.open` dans un mur ouvre une fenêtre Electron qui hérite du preload (`window.native` complet)
   - Correctif : factoriser dans `baseOptions`/une fonction `harden(win)` : refus `window.open`, `will-navigate` bloqué hors page locale, pour toutes les fenêtres

3. **`src/main/index.js:72-95`** — IPC `http` : URL, méthode et en-têtes libres, cookies de session joints
   - Échec : tout code exécuté dans le renderer (XSS via donnée Frigate, dépendance compromise) peut requêter n'importe quel hôte du LAN (SSRF) ou l'API Frigate en admin
   - Correctif : n'autoriser que l'origine du serveur configuré (+ ports go2rtc en mode local), refuser le reste côté main

4. **`src/main/index.js:235`** — `sandbox: false`
   - Le preload n'utilise que `contextBridge`/`ipcRenderer` (`src/preload/index.js:1`) : sandbox inutilement désactivée
   - Correctif : `sandbox: true` (`pathJoin` du preload reste compatible)

5. **`package.json` (build)** — Fuses Electron non configurés (RunAsNode, NODE_OPTIONS, `--inspect`, intégrité ASAR)
   - Échec : app non signée → un logiciel local peut lancer `FrigateView.exe` avec `ELECTRON_RUN_AS_NODE=1` et lire `credentials.bin` déchiffrable par l'utilisateur (DPAPI)
   - Correctif : `electronFuses` dans electron-builder (runAsNode off, nodeOptions off, nodeCliInspect off, onlyLoadAppFromAsar on)

6. **`src/main/index.js:138-146`** — flux d'écriture du téléchargement sans gestion d'erreur
   - Échec : disque plein / dossier en lecture seule → `'error'` non écouté sur `createWriteStream` → exception non capturée dans le processus principal ; pas non plus de gestion de la contre-pression (`out.write` ignoré)
   - Correctif : `out.on('error', …)` → abort + `rmSync` + `done({ok:false})` ; `pipeline(res, out)`

7. **`src/renderer/src/components/CameraCell.vue:58-79`** — course dans `startVideo`
   - Échec : `stopVideo()` (changement de caméra, passage en relecture, démontage) pendant l'`await connectWebRTC` → la connexion arrive ensuite, est assignée à `pc` et reste ouverte ; flux fantôme, fuite RTCPeerConnection
   - Correctif : jeton de génération (`const gen = ++seq`) ; si `gen` a changé au retour → `pc.close()`

8. **`src/renderer/src/components/CameraCell.vue:109-131`** — course dans `loadChunk`
   - Échec : changement de `camId` pendant `getRecordings` → segments de l'ancienne caméra, mais `vodUrl` construit avec la nouvelle (`props.camId` relu après l'await) → décalage temps/vidéo
   - Correctif : capturer `cam` avant l'await, abandonner si `cam !== props.camId`

9. **`src/renderer/src/stores/server.js:90-109`** + **`services/frigate.js:78`** — polls qui se chevauchent
   - Échec : intervalle 3 s (stats affichées) ou 10 s, timeout 12 s → plusieurs `poll()` simultanés ; à l'expiration de session, plusieurs `relogin()` en parallèle → risque de 429 « trop de tentatives » côté Frigate
   - Correctif : drapeau `_polling` (ignorer si en cours) et `relogin` mutualisé (promesse partagée)

10. **`src/renderer/src/App.vue:62-70`** + `server.js` — chaque mur fait sa propre connexion et son polling `/api/stats`
    - Échec : 3 écrans → 3 relogin concurrents à l'expiration de session, 3× la charge de polling
    - Correctif : polling/état serveur dans la fenêtre principale seulement, diffusé aux murs par IPC

11. **`src/renderer/src/stores/events.js:59-66, 95-109`** — liste d'événements sans borne
    - Échec : mur allumé des semaines avec le WebSocket actif → `items` ne fait que grossir (refresh 2 j ne tourne que si WS coupé) ; `unseenCount`, `filtered`, `markSeen` en O(n), menu reconstruit à chaque changement
    - Correctif : purge des événements > 2 jours à chaque upsert ou toutes les heures

12. **`src/renderer/src/components/CameraCell.vue:44-52`** — snapshots 1/s sans garde « requête en cours »
    - Échec : serveur lent ou lien saturé → requêtes qui s'empilent (N caméras × 1/s), aggravant la saturation
    - Correctif : ne lancer une image que si la précédente est terminée (`loading` flag)

13. **`docs/2026-07-04_session-maquette.md:123, 179-183, 241-252`** — dépôt public : IP internes, inventaire caméras, nom d'utilisateur MQTT, chemins de config SSH du serveur
    - `.gitignore` exclut `docs/serveur-*.md`, mais la section « Mise à jour 2026-10-17 — Serveur Frigate » a été ajoutée dans un fichier suivi
    - Idem `docs/api-frigate-reference.md:3-12, 147`
    - Correctif : déplacer ces sections dans `docs/serveur-*.md` (ignoré) ; envisager de purger l'historique si jugé sensible

### Mineur

- **`src/main/index.js:57-65`** — `cert:trust` accepte n'importe quel couple hôte/empreinte du renderer ; empreinte indexée par hôte, pas par hôte:port. Correctif : ne valider que l'empreinte issue du dernier `cert:probe` pour cet hôte
- **`src/main/index.js:89`** — détection d'erreur certificat par heuristique (`seenCerts`) : un `ERR_FAILED` réseau après un certificat refusé peut être affiché comme erreur de certificat. À garder en tête lors du diagnostic
- **`src/main/index.js:77`** — `redirect: 'manual'` sans écouteur `'redirect'` : une redirection bloque la requête jusqu'au timeout (à vérifier sur Electron 44). Correctif : écouter `redirect` et `abort` explicite
- **`src/main/index.js:83`** — taille de réponse non bornée (tout en mémoire). Correctif : plafond (ex. 20 Mo)
- **`src/main/index.js:120-124`** — `writeFileSync` sans try/catch → promesse rejetée, toast générique. Correctif : try/catch, retourner `false`
- **`src/main/index.js:103-106`** — `allowedPaths` jamais purgé ; un dossier choisi reste inscriptible (tout nom de fichier) jusqu'à la fermeture. Correctif : retirer après usage
- **`src/main/index.js:195-200`** — `settings:set` fusionne n'importe quel objet du renderer, sans validation de schéma
- **`src/main/index.js:301`** — `close` d'un mur → `syncWalls()` puis `applySettings()` : double reconstruction menu/tray (sans gravité)
- **`src/main/index.js:278`** — libellé « Écran » codé en dur (non traduit)
- **`src/main/updater.js:19-23`** — macOS : boîte de dialogue « mise à jour disponible » réaffichée toutes les 6 h tant que l'utilisateur n'a pas installé. Correctif : mémoriser la version déjà signalée
- **`src/main/updater.js:39`** — `setInterval` non conservé (sans conséquence, vie de l'app)
- **`src/renderer/src/services/webrtc.js:40-47`** — `pc` non fermé si `createOffer`/`setRemoteDescription` lève. Correctif : `try/finally` → `pc.close()` en cas d'échec
- **`src/renderer/src/services/webrtc.js:4, 48-51`** — `workingEndpoint` global : mémorisé pour la 1re caméra qui répond, appliqué à toutes
- **`src/renderer/src/services/frigate.js:80-85`** — `getOnline` : code mort (remplacé par `onlineFromStats`)
- **`src/renderer/src/stores/events.js:106`** — `setTimeout` de surbrillance non annulé à `stop()`
- **`src/renderer/src/stores/timeline.js:46, 141`** — `chunks` (cache par caméra × heure) jamais purgé : croissance lente sur un mur 24/7
- **`src/renderer/src/stores/media.js:24`** — commentaire de `hasAudio` collé à celui de `audioCam` ; `downloads` non borné
- **`src/renderer/src/stores/media.js:35-36`** — `frames.get(cam)?.()` appelé deux fois
- **`src/renderer/src/App.vue:86`** — libellé « Voir » codé en dur (non traduit)
- **`src/renderer/src/App.vue:133-140`** — watcher `deep` + `JSON.parse(JSON.stringify())` à chaque changement (léger, débouncé côté main)
- **`src/renderer/index.html:6-7`** — CSP large (`http: https: ws:` pour img/media/connect, `style-src 'unsafe-inline'`) : nécessaire faute d'hôte connu à la compilation ; acceptable
- **`build/adhoc-sign.cjs:9`** — `codesign --deep` déprécié par Apple ; fonctionne encore pour l'ad hoc
- **`.github/workflows/release.yml:10-11`** — `contents: write` au niveau du workflow (le job `build` n'en a pas besoin) ; actions non épinglées par SHA. Correctif : `permissions` par job, épingler les actions
- **`.github/workflows/release.yml`** — aucun `npm audit` / build de vérification sur les PR
- **`src/main/index.js`** (589 lignes) — mélange certificats, HTTP, fichiers, réglages, fenêtres, menu, tray, métriques. Découpage suggéré : `cert.js`, `http.js`, `files.js`, `windows.js`, `menu.js`, `tray.js`
- **`src/renderer/src/components/CameraCell.vue`** (265 lignes) — trois responsabilités (snapshots, WebRTC, HLS) : extraire en composables `useSnapshots`, `useWebRTC`, `useHlsPlayback`

## Mise à jour automatique

- Windows non signé : electron-updater vérifie le sha512 de `latest.yml`, pas l'éditeur → la sécurité repose entièrement sur le compte GitHub `dimer47` (activer 2FA, protéger les tags)
- SmartScreen « éditeur inconnu » à chaque nouvelle version
- macOS ad hoc : mise à jour manuelle via la page des releases, correctement gérée (`autoDownload = !mac`)

## Points forts

- `contextIsolation: true`, pont `window.native` étroit et nommé
- Écriture disque limitée aux chemins choisis dans une boîte de dialogue (`index.js:103-125`)
- Certificat auto-signé épinglé par empreinte, refus en cas de changement (`index.js:31-40`)
- Mot de passe chiffré par safeStorage, jamais en localStorage (`server.js:10, 43`)
- Injection du cookie limitée à l'hôte de la requête (`index.js:544`)
- Mode authentifié : jamais de contournement vers go2rtc direct (`webrtc.js:13`)
- Nettoyage soigné au démontage des composants (`CameraCell.vue:222`, `TimelinePanel.vue:158`)
- Coupure serveur déclarée après 3 échecs : évite les faux positifs sous charge vidéo
- Faux serveur `dev/mock-frigate.mjs` + mode smoke (`FV_SMOKE`) : bonne base pour des tests
- Commentaires utiles (le « pourquoi », pas le « quoi »)

## Tests : stratégie minimale

- **Unitaires (Vitest)**, fonctions pures sans Electron :
  - `services/frigate.js` : `baseUrl`, `isInternal`, `thumbUrl`, URLs encodées
  - `stores/timeline.js` : `mergeRanges`, `reviewType`, `seek`/`tick`/`goLive`, `zoom`
  - `CameraCell` `toOffset` (à extraire en module)
  - `stores/events.js` : `upsert` (tri, doublons), `filtered`
  - `shared/langs.js` : `resolveLang`, `translate` ; clés manquantes entre les 10 locales
- **Main process** : extraire `allowedIn`, validation d'URL de l'IPC `http` en fonctions pures, testées
- **Intégration (Playwright `_electron`)** contre `mock-frigate.mjs` : connexion, grille affichée, session expirée → écran de connexion, serveur coupé → état « lost » puis retour
- **CI** : workflow `test.yml` sur push/PR (Vitest + `electron-vite build`), Playwright sur Ubuntu avec xvfb

## Plan d'action

1. Filtrer `openExternal` (https uniquement) et durcir toutes les fenêtres (murs compris)
2. Restreindre l'IPC `http` à l'origine du serveur configuré
3. Retirer IP/infra du dépôt public (`docs/2026-07-04_session-maquette.md`, `docs/api-frigate-reference.md`)
4. Activer les Fuses Electron et `sandbox: true`
5. Gestion d'erreur du flux de téléchargement
6. Courses `startVideo` / `loadChunk` (jeton de génération)
7. Polling : garde anti-chevauchement, relogin mutualisé, murs alimentés par la fenêtre principale
8. Purges mémoire 24/7 (événements, chunks timeline) + garde snapshots
9. Tests Vitest sur les fonctions pures + workflow CI de test
10. Découpage `index.js` et `CameraCell.vue`, nettoyage code mort et chaînes non traduites
