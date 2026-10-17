# 🎥 FrigateView

![Version](https://img.shields.io/github/v/release/dimer47/FrigateView?color=red&style=flat-square) ![Last update](https://img.shields.io/github/last-commit/dimer47/FrigateView?color=yellow&label=Derni%C3%A8re%20mise%20%C3%A0%20jour&style=flat-square) ![Tests](https://img.shields.io/github/actions/workflow/status/dimer47/FrigateView/test.yml?label=tests&style=flat-square) ![License](https://img.shields.io/badge/licence-AGPL--3.0-blue?style=flat-square) ![Electron](https://img.shields.io/badge/Electron-44-47848F?style=flat-square&logo=electron&logoColor=white) ![Vue](https://img.shields.io/badge/Vue.js-3-4FC08D?style=flat-square&logo=vue.js&logoColor=white) ![Windows](https://img.shields.io/badge/Windows-x64-0078D6?style=flat-square&logo=windows&logoColor=white) ![macOS](https://img.shields.io/badge/macOS-Apple%20%26%20Intel-000000?style=flat-square&logo=apple&logoColor=white)

**Poste de surveillance de bureau pour Frigate NVR.** 📺
Vos caméras en direct, la relecture synchronisée, les événements et les murs vidéo multi-écrans, dans une vraie application Windows et macOS.

![Grille de caméras](docs/screenshots/grille.png)

## 🎉 Fonctionnalités

- 📡 **Direct WebRTC** (go2rtc), repli automatique sur les images 1/s
- 🧩 **Layouts** : grilles de caméras par glisser-déposer, caméra agrandie, plein écran
- 🕰️ **Timeline** : enregistrements, mouvement, alertes ; relecture synchronisée de toutes les caméras, vitesse réglable, vignette au survol
- 🔔 **Événements** en temps réel : recherche (plaque, visage, zone), vus / non vus, détail avec clip
- 🖥️ **Murs vidéo** : un layout par écran, en vidéo ou en images, sans limite d'écrans
- ✂️ **Export de clips MP4** : plage début → fin, plusieurs caméras d'un coup, clic droit sur un événement de la timeline
- 📸 **Capture d'image** à la résolution d'origine
- 🔊 **Son** des caméras, 🕹️ **PTZ** (caméras motorisées ONVIF)
- 📊 **Statistiques** serveur et flux : CPU, débit, images par seconde
- 🔐 **Connexion sécurisée** : HTTPS, certificat auto-signé épinglé par empreinte, mot de passe chiffré par le système
- 🔔 **Notifications** du système, zone de notification, démarrage avec la session
- 🔄 **Mise à jour automatique** depuis les releases GitHub
- 🌍 **10 langues** : français, anglais, espagnol, portugais, russe, chinois, arabe, hindi, bengali, indonésien

## 🖼️ Aperçu

| Grille et événements | Export de clip |
|---|---|
| ![Grille](docs/screenshots/grille.png) | ![Export](docs/screenshots/export.png) |

> 📸 Captures prises sur le faux serveur de développement (`npm run mock`), images de test.

## 📍 Installation

Télécharger la dernière version : **[Releases](https://github.com/dimer47/FrigateView/releases/latest)**

| Système | Fichier |
|---|---|
| Windows 10 / 11 (x64) | `FrigateView-Setup-x.y.z.exe` |
| macOS puce Apple | `FrigateView-x.y.z-arm64.dmg` |
| macOS Intel | `FrigateView-x.y.z-x64.dmg` |

L'application n'est pas signée par un certificat payant :

- 🪟 **Windows** : alerte SmartScreen « éditeur inconnu » → *Informations complémentaires* → *Exécuter quand même*
- 🍎 **macOS** : premier lancement par clic droit sur l'app → *Ouvrir* → *Ouvrir*
- 🍎 Si macOS la dit « endommagée » : `xattr -dr com.apple.quarantine /Applications/FrigateView.app`

## 🔌 Connexion à Frigate

| Port | Mode |
|---|---|
| `8971` (recommandé) | HTTPS + compte Frigate (`admin` ou `viewer`) |
| `5000` | accès interne sans compte, déconseillé (avertissement affiché) |

- 🔑 Certificat auto-signé : empreinte affichée, à approuver une seule fois ; refus s'il change
- 💾 « Rester connecté » : mot de passe chiffré par le système (DPAPI, Trousseau), reconnexion automatique

## ⌨️ Raccourcis

| Raccourci | Action |
|---|---|
| `Espace` | lecture / pause |
| `Ctrl/Cmd + Maj + S` | capture d'image |
| `Ctrl/Cmd + Maj + E` | export de clip |
| `Ctrl/Cmd + Maj + M` | son |
| Clic droit sur la timeline | exporter l'événement visé |

## 🧮 Technique

- Electron 44 + electron-vite, Vue 3, Pinia, Tailwind CSS 4
- `code/src/main` processus principal : requêtes Frigate, certificats, fichiers, fenêtres et murs, menu, mises à jour
- `code/src/preload` pont `window.native` (sandbox, isolation du contexte)
- `code/src/renderer` interface : services Frigate et WebRTC, stores, composants
- Sécurité : requêtes limitées au serveur Frigate courant, navigation bloquée, Fuses Electron activés
- Releases : GitHub Actions construit Windows et macOS à chaque tag `v*`

## 🤝 Contribuer

```bash
cd code
npm install
npm run mock     # faux serveur Frigate (127.0.0.1:5050 sans compte, :5051 avec admin/admin)
npm run dev      # application en développement
npm test         # tests Vitest
```

- 📦 Paquets : `npm run dist:win`, `npm run dist:mac`
- 🌍 Traductions : `code/src/shared/locales/*.json`, le français est la langue source
- 📖 Détails : [`code/README.md`](code/README.md)

## 📄 Licence

- **AGPL-3.0-or-later** ([`LICENSE`](LICENSE)), avec deux conditions supplémentaires ([`ADDITIONAL_TERMS.md`](ADDITIONAL_TERMS.md)) qui s'appliquent aux copies et versions modifiées :
  - garder la mention d'origine du projet
  - signaler toute version modifiée comme « version alternative de FrigateView »
- Une version modifiée distribuée reste libre, avec son code source
- Composants tiers : [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), aussi dans l'app (Aide → À propos → Licences)
- Projet indépendant, sans lien avec les auteurs de [Frigate](https://github.com/blakeblackshear/frigate)
