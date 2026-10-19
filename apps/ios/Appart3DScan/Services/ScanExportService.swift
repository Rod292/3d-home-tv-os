import Foundation
import RoomPlan

/// Écrit l'enveloppe et les USDZ dans le dossier du projet et renvoie les métadonnées à enregistrer.
/// Fonctions non isolées : l'encodage (parfois plusieurs Mo) se fait hors du thread principal.
enum ScanExportService {
    enum ExportError: LocalizedError {
        case demoMissing

        var errorDescription: String? {
            switch self {
            case .demoMissing: "Le fichier de démonstration est introuvable dans l'application."
            }
        }
    }

    static func exportCapture(
        id: UUID,
        name: String,
        structure: CapturedStructure?,
        rooms: [CapturedRoom],
        roomNames: [String],
        folder: URL
    ) async throws -> ScanProject {
        let envelope = EnvelopeExporter.makeEnvelope(structure: structure, rooms: rooms, roomNames: roomNames)
        let data = try EnvelopeExporter.encode(envelope)
        let envelopeName = EnvelopeExporter.fileName(for: name)
        try data.write(to: folder.appending(path: envelopeName), options: .atomic)

        // USDZ paramétrique : pratique pour Aperçu / Reality Composer, non utilisé par l'importeur web.
        var usdzNames: [String] = []
        let base = EnvelopeExporter.sanitizedBaseName(name)
        if let structure {
            let fileName = "\(base).usdz"
            if (try? structure.export(to: folder.appending(path: fileName), exportOptions: .parametric)) != nil {
                usdzNames.append(fileName)
            }
        } else {
            for (index, room) in rooms.enumerated() {
                let roomName = EnvelopeExporter.sanitizedBaseName(envelope.roomNames[index])
                let fileName = "\(base) - \(index + 1) \(roomName).usdz"
                if (try? room.export(to: folder.appending(path: fileName), exportOptions: .parametric)) != nil {
                    usdzNames.append(fileName)
                }
            }
        }

        return ScanProject(
            id: id,
            name: name,
            createdAt: .now,
            roomNames: envelope.roomNames,
            summary: try ScanSummary.from(envelopeData: data),
            envelopeFileName: envelopeName,
            usdzFileNames: usdzNames,
            isDemo: false
        )
    }

    /// Copie l'enveloppe d'exemple embarquée (mode démo, utilisable sur simulateur).
    ///
    /// `Resources/sample.appart3d.json` est écrit à la main (2 pièces : Séjour 5 × 4 m, Chambre 3,5 × 3 m,
    /// mur partagé) pour imiter la sortie `JSONEncoder` de `CapturedStructure` / `CapturedRoom`.
    /// La sortie Codable réelle de RoomPlan peut différer légèrement (clés, attributs, précision des nombres).
    static func exportDemo(id: UUID, name: String, folder: URL, bundle: Bundle = .main) throws -> ScanProject {
        guard let url = bundle.url(forResource: "sample.appart3d", withExtension: "json") else {
            throw ExportError.demoMissing
        }
        let data = try Data(contentsOf: url)
        let envelopeName = EnvelopeExporter.fileName(for: name)
        try data.write(to: folder.appending(path: envelopeName), options: .atomic)
        let roomNames = (try JSONSerialization.jsonObject(with: data) as? [String: Any])?["roomNames"] as? [String] ?? []
        return ScanProject(
            id: id,
            name: name,
            createdAt: .now,
            roomNames: roomNames,
            summary: try ScanSummary.from(envelopeData: data),
            envelopeFileName: envelopeName,
            usdzFileNames: [],
            isDemo: true
        )
    }
}
