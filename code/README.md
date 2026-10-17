# FrigateView — application de bureau

Electron + Vue 3 + Pinia + Tailwind CSS 4. Maquette de référence : `../mockups/monitor-mockup.html`.

## Commandes

- `npm install` : installer
- `npm run dev` : lancer en développement
- `npm run mock` : faux serveur Frigate — `127.0.0.1` port `5051` avec compte (admin/admin, viewer/viewer), port `5050` sans compte
- `npm run dist:win` : installateur Windows
- `npm run dist:mac` : dmg macOS (puce Apple et Intel), signé ad hoc sans clé du trousseau

## Structure

- `src/main` : processus principal (fenêtre, requêtes vers Frigate, certificat approuvé par empreinte, mot de passe chiffré, cookie de session joint aux images)
- `src/preload` : pont sécurisé `window.native`
- `src/renderer/src/services` : API Frigate, WebRTC go2rtc
- `src/renderer/src/stores` : serveur, layouts, interface (Pinia, sauvegarde locale)
- `src/renderer/src/components` : écran de connexion, barre d'outils, barre latérale, grille, case caméra

## Avancement

- Phase 1 : connexion, caméras, layouts, grille avec images 1/s ✅
- Phase 2 : direct WebRTC avec repli sur les images ✅ (à valider sur le vrai serveur)
- Phase 3 : timeline (enregistrements, mouvement, alertes) et relecture HLS synchronisée ✅
- Phase 4 : panneau des événements (revues Frigate, recherche, vus, détail avec clip, temps réel par le WebSocket Frigate) ✅
- Phase 5 : notifications Windows, zone de notification, démarrage avec Windows, murs vidéo multi-écrans, réglages, installateur x64 ✅

## Fonctions vidéo

- Capture d'image (bouton appareil photo sur la case, Ctrl+Shift+S) : image affichée à sa résolution d'origine
- Export de clip MP4 (ciseaux sur la case ou la timeline, Ctrl+Shift+E) : caméras, début, durée ; plusieurs caméras = un fichier chacune dans un dossier
- Clip d'un événement : bouton « Télécharger le clip » dans le détail
- Son : bouton haut-parleur, une caméra à la fois (seulement si le flux contient de l'audio)
- PTZ : commandes sur la caméra agrandie, si Frigate a une config ONVIF pour elle
- Timeline : vignette de l'instant survolé
- Murs vidéo : mode vidéo ou images 1/s par écran (Réglages → Écrans) ; images conseillées avec plusieurs murs

## Connexion

- Port 8971 (par défaut) : HTTPS + compte Frigate (rôles `admin` / `viewer`)
- Certificat auto-signé : empreinte affichée, à approuver une fois (`trusted-certs.json` dans le dossier utilisateur)
- « Rester connecté » : mot de passe chiffré par le système (DPAPI sous Windows), reconnexion automatique si la session expire
- Port 5000 : accès interne sans compte, déconseillé (avertissement affiché)

## Langues

- 10 langues : anglais, chinois simplifié, hindi, espagnol, arabe (droite à gauche), français, bengali, portugais (Brésil), russe, indonésien
- Fichiers : `src/shared/locales/*.json`, communs à la fenêtre et au processus principal (menu, icône, notifications)
- Le français (`fr.json`) est la langue source ; une clé absente d'une traduction s'affiche en anglais, puis en français
- Choix : Réglages → Général → Langue ; par défaut, la langue du système
- Pluriels au format vue-i18n : `singulier | pluriel`

## Releases et mises à jour

- Pousser un tag : `git tag v0.2.0 && git push origin v0.2.0`
- GitHub Actions construit Windows et macOS, puis publie la release (`.github/workflows/release.yml`)
- Version de l'app = numéro du tag
- Windows : mise à jour téléchargée en arrière-plan, installée au redémarrage
- macOS : nouvelle version signalée, téléchargement du dmg depuis la release (mise à jour en place impossible sans certificat Apple)
- Menu Aide → Rechercher des mises à jour

## Installation sans certificat

- Windows : alerte SmartScreen « éditeur inconnu » → « Informations complémentaires » → « Exécuter quand même »
- Éditeur affiché dans les propriétés du fichier et dans « Programmes et fonctionnalités » : IDSynergy
- macOS : au premier lancement, clic droit sur l'app → Ouvrir → Ouvrir
- macOS, si « endommagée » : `xattr -dr com.apple.quarantine /Applications/FrigateView.app`
