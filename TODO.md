# À faire — FrigateView

## Fonctionnalités

- [x] Parcours de l'objet suivi : chronologie et trajet dans l'image
- [x] Notifications d'alerte générales : par caméra, zone ou type d'objet

## Tests en conditions réelles

- [ ] Coupure réseau : mettre Frigate en pause sur le serveur de test (`docker pause frigate-test`), relancer, mesurer le temps de reprise dans l'app
- [ ] Changement de résolution du Mac : fenêtre principale et mur vidéo recalés
- [ ] Brancher / débrancher un second écran : mur vidéo ouvert / fermé, fenêtre principale ramenée sur un écran visible
- [ ] Relancer l'app avec un mur vidéo actif : la fenêtre principale ne s'ouvre pas sous le mur

## Améliorations possibles

- [x] Murs vidéo sous Windows : reconnaître l'écran aussi par son nom et sa position (l'identifiant d'écran peut changer après un redémarrage, le mur ne se rouvrirait pas)
