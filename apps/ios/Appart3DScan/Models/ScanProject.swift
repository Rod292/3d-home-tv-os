import Foundation

/// Un « appartement » : une session de scan de N pièces, exportée et sauvegardée dans Documents.
/// Persisté en `projet.json` à côté de l'enveloppe et des USDZ, dans `Documents/Projets/<id>/`.
struct ScanProject: Codable, Identifiable, Hashable, Sendable {
    var id: UUID
    var name: String
    var createdAt: Date
    var roomNames: [String]
    var summary: ScanSummary
    /// Nom du fichier `<nom>.appart3d.json` dans le dossier du projet.
    var envelopeFileName: String
    /// USDZ paramétriques (structure fusionnée, ou une par pièce si la fusion a échoué).
    var usdzFileNames: [String]
    var isDemo: Bool
}
