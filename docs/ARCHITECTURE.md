# Appart3D — Architecture (MVP)

Scanner son appartement (iPhone LiDAR) → maquette 3D « maison de poupée » stylisée et éditable dans le navigateur.

## Principe clé
On ne stylise PAS un maillage scanné. On **reconstruit** l'appartement depuis des données sémantiques
(murs, ouvertures, pièces, objets + catégorie + dimensions) et on remplace chaque objet par un modèle
stylisé paramétrique du catalogue. → léger, propre, éditable.

## Monorepo (pnpm workspaces)
| Chemin | Rôle |
|---|---|
| `packages/scene` | **Contrat** : types `Scene`, géométrie, validation, appartement démo. Toute évolution passe par ici. |
| `packages/catalog` | Meubles procéduraux stylisés (R3F) + thème/matériaux + liste `CATALOG`. |
| `packages/roomplan-import` | Enveloppe RoomPlan (JSON exporté par l'app iOS) → `Scene`. |
| `apps/web` | Visualiseur / éditeur : Vite + React + react-three-fiber + drei + zustand. |
| `apps/ios` | App SwiftUI de scan (RoomPlan), projet généré par XcodeGen. |

## Conventions de scène
Mètres, radians, Y vers le haut, sol = plan XZ. Un objet est positionné par le centre de son emprise au sol
et « regarde » +Z quand `rotationY = 0`. Détails dans `packages/scene/src/types.ts`.

## RoomPlan envelope (contrat iOS → web)
Fichier `.appart3d.json` exporté par l'app iOS :

```jsonc
{
  "format": "appart3d.roomplan",
  "version": 1,
  "capturedAt": "2026-10-09T12:00:00Z",
  "device": "iPhone17,1",
  "appVersion": "0.1.0",
  // Résultat fusionné multi-pièces (iOS 17+ StructureBuilder), encodé tel quel par JSONEncoder (Codable). Peut être null.
  "structure": { /* CapturedStructure */ },
  // Chaque pièce scannée individuellement (CapturedRoom Codable), toujours présent.
  "rooms": [ { /* CapturedRoom */ } ],
  // Noms donnés par l'utilisateur, alignés sur `rooms`.
  "roomNames": ["Séjour", "Chambre"]
}
```
L'importeur privilégie `structure` et se rabat sur `rooms`.

## Style visuel (original)
Maquette isométrique chaleureuse : palette crème / terracotta / sauge / bleu ardoise, ombrage « toon » 3 tons,
formes basses-polys arrondies, ombres douces, murs côté caméra abaissés (cutaway). Aucun asset ni code
repris d'un site tiers.

## Plus tard
Backend (Supabase : comptes, projets, stockage, partage), enrichissement IA des objets à partir de photos,
objets uniques générés (image-to-3D), éditeur dans l'app iOS.
