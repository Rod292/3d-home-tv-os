# Appart3D Scan (iOS)

App SwiftUI qui scanne un appartement pièce par pièce avec **RoomPlan** (iPhone/iPad avec LiDAR) et exporte un
fichier `.appart3d.json` à déposer dans l'application web Appart3D. Le format est décrit dans
`docs/ARCHITECTURE.md` (« RoomPlan envelope »).

- iOS 17.0 minimum (StructureBuilder / multi-pièces), Swift 6, SwiftUI, aucune dépendance tierce.
- Le projet Xcode est généré par **XcodeGen** : la source de vérité est `project.yml`.

## Ouvrir le projet

```sh
brew install xcodegen        # si besoin
cd apps/ios
xcodegen generate            # (re)crée Appart3DScan.xcodeproj
open Appart3DScan.xcodeproj
```

Relancez `xcodegen generate` après avoir ajouté/supprimé des fichiers ou modifié `project.yml`.

## Équipe de signature

Aucune équipe n'est définie (`DEVELOPMENT_TEAM` vide). Pour installer sur un iPhone :
Xcode → cible **Appart3DScan** → *Signing & Capabilities* → choisissez votre *Team*. Si le bundle id
`com.example.appart3d.scan` est déjà pris, remplacez-le (par ex. `com.votrenom.appart3d.scan`).
Pour éviter de perdre ce réglage à chaque régénération, vous pouvez aussi renseigner `DEVELOPMENT_TEAM`
dans `project.yml`. Les builds simulateur ne nécessitent pas de signature.

## Lancer sur un iPhone LiDAR

1. iPhone 12 Pro ou plus récent (ou iPad Pro avec LiDAR), iOS 17+, mode développeur activé.
2. Sélectionnez l'appareil dans Xcode puis ⌘R. Autorisez l'accès à la caméra.
3. **Nouvel appartement** → nommez-le → **Démarrer le scan**. Balayez murs, sol et meubles lentement,
   puis **Terminer cette pièce**.
4. Nommez la pièce (Séjour, Chambre, Cuisine…) puis **Scanner une autre pièce** — sans quitter l'écran :
   la session ARKit continue, toutes les pièces partagent la même origine. Marchez jusqu'à la pièce suivante
   en gardant la caméra active.
5. **Terminer l'appartement** : fusion avec `StructureBuilder` (si elle échoue, les pièces sont exportées seules),
   puis export et résumé.

Sur le simulateur (ou un iPhone sans LiDAR), l'app affiche « Appareil non compatible » ; le **Mode démo**
charge un exemple embarqué (`Appart3DScan/Resources/sample.appart3d.json`) pour tester le résumé et l'export.
Argument de lancement de dév : `-openDemo` ouvre directement la démo.

## Export

Chaque appartement est enregistré dans `Documents/Projets/<id>/` :

- `<nom>.appart3d.json` — l'enveloppe (format `appart3d.roomplan`, version 1) avec `structure`
  (CapturedStructure encodée par `JSONEncoder`, ou `null`), `rooms` (CapturedRoom) et `roomNames` ;
- `<nom>.usdz` — modèle paramétrique (ou un USDZ par pièce si la fusion a échoué) ;
- `projet.json` — métadonnées pour la liste.

Depuis le résumé : **Partager** → AirDrop vers le Mac → glissez le fichier `.appart3d.json` dans l'application
web. Les fichiers sont aussi visibles dans l'app Fichiers (« Sur mon iPhone › Appart3D Scan »).
Le bouton « Envoyer en ligne » utilise `StubScanUploader` (protocole `ScanUploader`) en attendant un backend.

## Build et tests en ligne de commande

```sh
cd apps/ios
xcodegen generate
xcodebuild -scheme Appart3DScan -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build build
xcodebuild test -scheme Appart3DScan -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath build
```

## Structure

```
Appart3DScan/
  App/        Appart3DScanApp, Theme (palette crème / terracotta / sauge / bleu ardoise)
  Models/     RoomPlanEnvelope (générique, Encodable), ScanProject, ScanSummary, FrenchLabels
  Services/   ScanSession (multi-pièces, @MainActor), RoomCaptureCoordinator (délégués RoomPlan),
              StructureMerger, EnvelopeExporter, ScanExportService, ProjectStore, ScanUploader, DeviceInfo
  Views/      HomeView, ScanTipsCard, ScanFlowView, RoomCaptureContainer, RoomNamingSheet,
              ProjectSummaryView, UnsupportedDeviceView, FlowLayout
  Resources/  sample.appart3d.json (démo, écrit à la main)
Appart3DScanTests/  EnvelopeExporterTests (Swift Testing)
```
