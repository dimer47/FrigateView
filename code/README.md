# FrigateView — application de bureau

Electron + Vue 3 + Pinia + Tailwind CSS 4. Maquette de référence : `../mockups/monitor-mockup.html`.

## Commandes

- `npm install` : installer
- `npm run dev` : lancer en développement
- `npm run mock` : faux serveur Frigate — `127.0.0.1` port `5051` avec compte (admin/admin, viewer/viewer), port `5050` sans compte
- `npm run dist:win` : installateur Windows

## Structure

- `src/main` : processus principal (fenêtre, requêtes vers Frigate, certificat approuvé par empreinte, mot de passe chiffré, cookie de session joint aux images)
- `src/preload` : pont sécurisé `window.native`
- `src/renderer/src/services` : API Frigate, WebRTC go2rtc
- `src/renderer/src/stores` : serveur, layouts, interface (Pinia, sauvegarde locale)
- `src/renderer/src/components` : écran de connexion, barre d'outils, barre latérale, grille, case caméra

## Avancement

- Phase 1 : connexion, caméras, layouts, grille avec images 1/s ✅
- Phase 2 : direct WebRTC avec repli sur les images ✅ (à valider sur le vrai serveur)
- Phase 3 : timeline et relecture HLS
- Phase 4 : événements (API + MQTT)
- Phase 5 : multi-écrans, notifications, zone de notification

## Connexion

- Port 8971 (par défaut) : HTTPS + compte Frigate (rôles `admin` / `viewer`)
- Certificat auto-signé : empreinte affichée, à approuver une fois (`trusted-certs.json` dans le dossier utilisateur)
- « Rester connecté » : mot de passe chiffré par le système (DPAPI sous Windows), reconnexion automatique si la session expire
- Port 5000 : accès interne sans compte, déconseillé (avertissement affiché)
