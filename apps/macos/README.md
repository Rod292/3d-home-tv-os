# Appart3D — app de barre des menus (macOS)

Une icône maison dans la barre des menus affiche le nombre de lumières allumées
(`house.fill` + « 2 »). Un clic dessus ouvre une fenêtre de 380 × 720 qui montre l'appartement en 3D
et les commandes de la maison.

L'app est une **coquille native**. L'interface elle-même est la mise en page « widget » de l'app web
(`?widget=1`), servie par le **home bridge** (`apps/home-bridge`, par défaut `http://localhost:8787`).

- SwiftUI `MenuBarExtra` (style fenêtre), sans icône dans le Dock (`LSUIElement`), macOS 15+, Swift 6, aucune dépendance.
- Badge : flux SSE `GET /api/home/events`, avec reconnexion automatique. Si le flux ne répond pas, l'app
  interroge `GET /api/home` toutes les 5 s. Le compte inclut les appareils `light`/`plug` dont `state.on == true`.
  Si le bridge est injoignable, l'icône devient `house.slash`.
- Fenêtre : une `WKWebView` (WebGL, fond transparent, coins arrondis) qui charge
  `<bridge>/?widget=1&scene=<scène>`. Elle reste en vie entre deux ouvertures et ne se recharge donc pas à chaque clic.
  Pied de page : état de la connexion, *Ouvrir dans le navigateur*, recharger, *Réglages…*, *Quitter*.
- Réglages : adresse du bridge, chemin de la scène, *Lancer au démarrage* (`SMAppService.mainApp`),
  *Tester la connexion* (nom du logement + nombre d'appareils).

## Structure

```
apps/macos/
├── project.yml                  # source de vérité XcodeGen
├── Appart3DMenuBar/
│   ├── App/                     # @main : MenuBarExtra + Settings
│   ├── Models/HomeSnapshot.swift# miroir du contrat packages/home (HomeSnapshot, Device, HomeEvent)
│   ├── Services/                # BridgeClient (HTTP + SSE), SSEParser, HomeStore, AppSettings
│   ├── Views/                   # MenuBarLabel, PopoverView, WidgetWebView, SettingsView
│   └── Resources/Assets.xcassets# AppIcon (généré par scripts/make-icon.swift)
├── Appart3DMenuBarTests/        # tests (décodage, compte des lumières, SSE, URLs) + fixture JSON
└── scripts/make-icon.swift      # régénère les PNG de l'icône
```

## Compiler

Prérequis : Xcode 16 ou plus récent, et [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`).

```sh
cd apps/macos
xcodegen generate                 # régénère Appart3DMenuBar.xcodeproj depuis project.yml
xcodebuild -scheme Appart3DMenuBar -destination 'platform=macOS' -derivedDataPath build build
xcodebuild test -scheme Appart3DMenuBar -destination 'platform=macOS' -derivedDataPath build
```

En Debug, l'app est signée **ad hoc** (`CODE_SIGN_IDENTITY = "-"`), ce qui évite d'avoir besoin d'un profil.
En Release, la signature est automatique avec votre équipe Apple (`DEVELOPMENT_TEAM` dans `project.yml`).

Pour régénérer l'icône : `swift scripts/make-icon.swift`.

## Lancer

```sh
open build/Build/Products/Debug/Appart3D.app
```

Vous pouvez aussi ouvrir `Appart3DMenuBar.xcodeproj` dans Xcode et lancer le schéma `Appart3DMenuBar` (⌘R).
L'icône apparaît dans la barre des menus. L'app n'a ni fenêtre ni icône dans le Dock.
Pour la quitter, utilisez le bouton ⏻ dans le pied de page.

## Installer dans /Applications

```sh
xcodebuild -scheme Appart3DMenuBar -configuration Release -destination 'platform=macOS' -derivedDataPath build build
ditto build/Build/Products/Release/Appart3D.app /Applications/Appart3D.app
open /Applications/Appart3D.app
```

La signature Release a besoin d'un compte développeur connecté dans Xcode.
Sans compte, installez plutôt la version Debug, qui est signée ad hoc.

## Lancer au démarrage

Ouvrez *Réglages…*, puis activez **Lancer au démarrage**. L'app s'enregistre via `SMAppService.mainApp`.

- Installez d'abord l'app dans `/Applications`. Un élément d'ouverture enregistré depuis le dossier `build/`
  pointerait sur cette copie temporaire.
- Si macOS demande une validation, allez dans Réglages Système › Général › Ouverture.
  Le bouton *Ouvrir Ouverture…* y mène directement.

## Dépannage

**L'icône est barrée (`house.slash`) ou la fenêtre affiche « Bridge injoignable ».** Le home bridge ne tourne pas,
ou l'adresse configurée n'est pas la bonne.

1. Démarrez le bridge depuis la racine du dépôt :
   ```sh
   pnpm --filter @appart3d/home-bridge start
   ```
   Pour qu'il démarre tout seul à chaque session, installez l'agent launchd fourni dans
   `apps/home-bridge/scripts/` (voir le README du bridge).
2. Vérifiez qu'il répond : `curl http://localhost:8787/api/home`.
3. Dans *Réglages…*, vérifiez l'adresse (par défaut `http://localhost:8787`), puis cliquez sur **Tester la connexion**.
   Le bridge peut aussi tourner sur un autre Mac du réseau local, par exemple `http://mac-mini.local:8787`.
   Les requêtes HTTP vers le réseau local sont autorisées par App Transport Security.
   Attention : seul `localhost` est accessible sans authentification.
4. Une fois le bridge revenu, le badge se met à jour tout seul. La fenêtre se recharge aussi d'elle-même
   (vous pouvez forcer avec le bouton ↻).

**La 3D reste vide.** Vérifiez le chemin de la scène dans les Réglages (par défaut `/shared/demo-apartment.json`).
Vérifiez aussi que `<bridge>/?widget=1` s'ouvre dans un navigateur, avec le bouton *Ouvrir dans le navigateur*.
En Debug, la web view peut être inspectée avec Safari › Développement.

**Le badge ne change pas tout de suite.** Le point coloré du pied de page indique le mode de mise à jour :
vert = temps réel (SSE), jaune = actualisation toutes les 5 s, rouge = hors ligne.
