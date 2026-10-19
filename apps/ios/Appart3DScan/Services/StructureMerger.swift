import Foundation
import RoomPlan

/// Fusion multi-pièces via `StructureBuilder` (iOS 17). En cas d'échec on garde les pièces seules.
enum StructureMerger {
    struct Outcome: Sendable {
        var structure: CapturedStructure?
        /// Message affichable quand la fusion a échoué.
        var warning: String?
    }

    static func merge(_ rooms: [CapturedRoom]) async -> Outcome {
        guard !rooms.isEmpty else { return Outcome(structure: nil, warning: "Aucune pièce à fusionner.") }
        do {
            let builder = StructureBuilder(options: [.beautifyObjects])
            let structure = try await builder.capturedStructure(from: rooms)
            return Outcome(structure: structure, warning: nil)
        } catch {
            return Outcome(
                structure: nil,
                warning: "La fusion des pièces a échoué (\(error.localizedDescription)). "
                    + "Les pièces sont exportées séparément ; leur alignement peut être approximatif."
            )
        }
    }
}
