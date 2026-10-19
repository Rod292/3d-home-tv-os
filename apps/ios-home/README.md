# Maison — l'app iPhone d'Appart3D

Application iPhone native (SwiftUI, iOS 18+, Swift 6) pour piloter l'appartement via le **pont domotique**
(`apps/home-bridge`, sur le Mac) : lumières Hue, télé Philips + Ambilight, ventilateur Windcalm.
Elle remplace le raccourci Philips Hue du **bouton Action**, et ajoute des **contrôles** au Centre de contrôle
et des **widgets**.

- Maquette 3D animée de l'appartement en tête d'écran (page `<pont>/?view=3d&scene=…`, WKWebView transparente) ;
  toucher un objet ouvre la fiche de l'appareil, ouvrir une fiche centre la caméra dessus.
- Scènes (Lumineux, Cosy, Film, Nuit, Absent), filtre par pièce, tuiles d'appareils (toucher = allumer/éteindre,
  appui long ou chevron = réglages).
- Fiches : lampe (grand pourcentage, curseur vertical façon Hue, couleurs, blancs), prise, ventilateur (6 vitesses,
  lumière), télé (marche, volume, sources, télécommande).
- Temps réel (SSE `/api/home/events`, reconnexion automatique), bandeau hors ligne.
- App Intents + raccourcis, contrôles iOS 18, widgets d'écran d'accueil et d'écran verrouillé.

## Structure

```
apps/ios-home/
├── project.yml            # source de vérité XcodeGen
├── Shared/                # compilé dans l'app ET l'extension
│   ├── Models/            # miroir Swift du contrat @appart3d/home
│   ├── Networking/        # BridgeClient (HTTP + SSE), MockHomeClient (démo), SSEParser
│   ├── Storage/           # App Group (réglages, dernier état) + jeton (trousseau partagé)
│   ├── Logic/             # réducteur optimiste, plans de scènes, HomeActions, lien d'appairage
│   ├── Intents/           # App Intents (scènes, appareils, luminosité, tout éteindre, contrôles)
│   └── Design/            # couleurs, symboles
├── Maison/                # l'app (vues, HomeStore, WKWebView, Bonjour, scanner QR, raccourcis)
├── MaisonWidgets/         # extension WidgetKit : contrôles + widgets
├── MaisonTests/           # tests unitaires (Swift Testing)
└── scripts/make-icon.swift
```

## Compiler et lancer

Prérequis : Xcode 16+ (testé avec Xcode 27), [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`).

```sh
cd apps/ios-home
xcodegen generate
open Maison.xcodeproj
```

### Simulateur (aucune signature requise)

```sh
xcodebuild -project Maison.xcodeproj -scheme Maison \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build build
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/Maison.app
xcrun simctl launch booted com.example.appart3d.home -mock     # mode démo
```

Tests : `xcodebuild … test` (même destination).

### Sur votre iPhone

1. Brancher l'iPhone (ou l'appairer en Wi-Fi dans Xcode › Window › Devices) et activer le **mode développeur**
   (Réglages › Confidentialité et sécurité › Mode développeur).
2. Dans Xcode, schéma **Maison**, destination = l'iPhone, puis ⌘R.
3. Signature : automatique, avec **votre** équipe Apple (`DEVELOPMENT_TEAM` dans `project.yml`). Xcode crée les identifiants
   `com.example.appart3d.home` et `com.example.appart3d.home.widgets` et l'App Group `group.com.example.appart3d`
   (cible › Signing & Capabilities : si Xcode signale l'App Group, cliquer sur « + » pour l'enregistrer dans le compte).
   - Avec un **compte gratuit** (Personal Team), les App Groups et extensions fonctionnent, mais le profil expire
     au bout de 7 jours : relancer depuis Xcode.
4. Au premier lancement, accepter **« Maison souhaite trouver des appareils sur votre réseau local »**
   (indispensable : sans cela ni l'app, ni les widgets, ni le bouton Action ne joignent le pont).

## Appairage

1. Sur le Mac : `pnpm --filter @appart3d/home-bridge pair` → affiche le code à 6 chiffres et un QR code
   (`http://<ip>:8787/pair?code=XXXXXX`).
2. Dans l'app : **Commencer** → le pont apparaît via Bonjour (« Chez Alex et Sam ») → saisir le code ;
   ou **Scanner le QR code** (appairage en un geste) ; ou **Saisir l'adresse à la main**.
3. L'app appelle `POST /api/pair` et garde le jeton dans le trousseau (groupe partagé avec l'extension) ;
   il est envoyé en `Authorization: Bearer` et posé en cookie `appart3d_home` pour la maquette 3D.

Le QR code encode le nom du Mac (`http://my-macbook-pro.local:8787/pair?code=…`) : l'adresse reste valable
si la box redistribue les IP. Si le pont ne répond plus (nouvelle IP), l'app, les intents et les widgets le
**retrouvent par Bonjour** (service mémorisé à l'appairage, sinon le premier pont réel), vérifient que le jeton y est
accepté, enregistrent la nouvelle adresse et réessaient (≈ 8 s au maximum pour un intent) ; la maquette 3D est
rechargée avec le cookie posé pour le nouvel hôte.

Les ponts de test (nom contenant « simulation » ou « test ») sont listés à part et ignorés lors de la redécouverte. Réglages › **Associer à nouveau**
efface le jeton. Nouveau code côté Mac : `pnpm --filter @appart3d/home-bridge pair --rotate`.

## Bouton Action (remplace le raccourci Hue)

Méthode 1 — raccourci de l'app :
1. Réglages › **Bouton Action**.
2. Faire défiler jusqu'à **Raccourci**.
3. **Choisir un raccourci** › section **Maison** › **Basculer les lumières**.
   (Tout éteint → dernière ambiance ou Lumineux ; sinon tout s'éteint.) On peut aussi choisir
   « Lancer une scène », « Tout éteindre »…

Méthode 2 — contrôle :
1. Réglages › Bouton Action › **Commandes** › **Choisir une commande**.
2. Chercher **Maison** › **Lumières** (bascule) ou **Scène** (choisir l'ambiance).

L'app n'a pas besoin d'être ouverte : les intents s'exécutent en arrière-plan et affichent une réponse courte
(« Lumières éteintes », « Ambiance Cosy »). Hors du Wi-Fi : « Maison injoignable — pas sur le Wi-Fi de la maison ? ».

## Centre de contrôle et écran verrouillé

Centre de contrôle › appui long sur un espace vide › **Ajouter une commande** › **Maison** :
- **Lumières** : bascule toutes les lumières (état allumé/éteint affiché) ;
- **Scène** : bouton d'ambiance configurable (Lumineux, Cosy, Film, Nuit, Absent) — en ajouter plusieurs.

Écran verrouillé : appui long › Personnaliser › remplacer la lampe torche / l'appareil photo par une commande Maison.

## Widgets

Écran d'accueil › appui long › **+** › **Maison** :
- **Maison** (petit/moyen) : nombre de lumières allumées + bouton Allumer/Éteindre (+ Lumineux/Cosy en moyen) ;
  aussi en accessoire d'écran verrouillé (rectangulaire, circulaire).
- **Ambiances** (petit/moyen) : boutons de scènes interactifs + « Tout ».

Les widgets se rafraîchissent toutes les 15 min et immédiatement après chaque action (app, intents, contrôles).

## iPad : panneau mural

L'app est universelle. Sur iPad :
- **paysage** : grande maquette 3D à gauche (≈ 60 %), colonne de commandes à droite ;
- **portrait** : maquette en haut, tuiles en grille de 3–4 colonnes ;
- les fiches d'appareil s'ouvrent en feuille centrée ; Split View / Stage Manager : la mise en page s'adapte à la
  largeur de la fenêtre (colonne unique sous ~820 pt de large).

**Mode écran mural** (Réglages › Écran mural ; activé par défaut sur iPad, désactivé sur iPhone) :
- l'écran ne se met jamais en veille tant que l'app est au premier plan ;
- après **45 s** sans toucher, fondu vers un économiseur : maquette qui tourne lentement, grande horloge, date,
  « Chez Alex et Sam », état (« 2 lumières allumées · Ventilateur vitesse 2 ») ;
- la nuit (19 h – 7 h) : ambiance assombrie et luminosité de l'écran réduite à 20 % (rétablie au retour) ;
- un seul toucher n'importe où revient aux commandes, **sans déclencher d'action**.

Pour un vrai panneau fixe :
1. Réglages › Luminosité et affichage › **Verrouillage automatique : Jamais**.
2. Laisser l'iPad **en charge** en permanence (idéalement avec la recharge optimisée / limite à 80 %).
3. Réglages › Accessibilité › **Accès guidé** : activer, définir un code ; ouvrir Maison puis **triple-clic** sur le
   bouton supérieur › Démarrer. L'iPad reste verrouillé sur l'app (triple-clic + code pour sortir).

## Mode démo

Argument de lancement `-mock` (schéma Xcode › Run › Arguments) ou Réglages › **Mode démo** : maison simulée en
mémoire (mêmes appareils et identifiants que les vrais), aucun appareil réel n'est piloté. La maquette est alors
une illustration native ; Réglages › « Maquette web publique » charge la maquette servie par votre pont.
`-onboarding` force l'écran d'accueil, `-detail <id>` ouvre une fiche, `-screensaver` affiche l'économiseur,
`-landscapePreview` simule le paysage (captures d'écran sur simulateur sans interface).

## Dépannage

- **« Pas sur le Wi-Fi de la maison ? »** : l'iPhone doit être sur le même réseau que le Mac ; vérifier que le pont
  tourne (`pnpm --filter @appart3d/home-bridge start`) et l'adresse dans Réglages (ex. `http://192.168.1.20:8787`).
- **Le pont n'apparaît pas / rien ne répond** : Réglages iOS › Confidentialité et sécurité › **Réseau local** ›
  activer **Maison**. Si l'invite n'est jamais apparue, supprimer et réinstaller l'app.
- **Bouton Action / contrôles sans effet** : ouvrir l'app une fois après l'installation (autorisation réseau local),
  vérifier que l'app est appairée ; les intents ont un délai de 5 s pour échouer proprement.
- **« Accès refusé par le pont »** : le jeton a changé (config du pont réinitialisée) → Réglages › Associer à nouveau.
- **Maquette 3D vide** : l'app affiche l'illustration native tant que la page 3D n'a pas envoyé `ready`
  (pont ancien, scène introuvable…). Recharger en relançant l'app.
- **Lampe grisée « Injoignable (interrupteur coupé ?) »** : l'interrupteur mural coupe l'alimentation de l'ampoule Hue.
- Mac en veille : le pont s'arrête avec lui (désactiver la mise en veille ou utiliser `caffeinate`).

## Icône

`swift scripts/make-icon.swift` régénère l'icône (variantes claire, sombre, teintée) et les couleurs des catalogues.
