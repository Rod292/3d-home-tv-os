import Foundation

/// Construction et encodage de l'enveloppe `.appart3d.json`. Pur et sans dépendance à RoomPlan → testable.
enum EnvelopeExporter {
    static let fileExtension = "appart3d.json"

    static func makeEnvelope<S, R>(
        structure: S?,
        rooms: [R],
        roomNames: [String],
        capturedAt: Date = .now,
        device: String = DeviceInfo.machineIdentifier,
        appVersion: String = DeviceInfo.appVersion
    ) -> RoomPlanEnvelope<S, R> {
        RoomPlanEnvelope(
            capturedAt: isoString(capturedAt),
            device: device,
            appVersion: appVersion,
            structure: structure,
            rooms: rooms,
            roomNames: alignedNames(roomNames, count: rooms.count)
        )
    }

    static func encode<S, R>(_ envelope: RoomPlanEnvelope<S, R>) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(envelope)
    }

    /// Garantit `roomNames.count == rooms.count` : complète par « Pièce N », tronque l'excédent,
    /// remplace les noms vides.
    static func alignedNames(_ names: [String], count: Int) -> [String] {
        (0..<count).map { index in
            let name = index < names.count ? names[index].trimmingCharacters(in: .whitespacesAndNewlines) : ""
            return name.isEmpty ? "Pièce \(index + 1)" : name
        }
    }

    /// ISO 8601 en UTC, sans fractions de seconde : `2026-10-09T12:00:00Z`.
    static func isoString(_ date: Date) -> String {
        date.ISO8601Format() // style par défaut : UTC, suffixe « Z », pas de fractions
    }

    /// `Mon appart / 2e` → `Mon appart - 2e.appart3d.json`. Conserve accents et espaces.
    static func fileName(for projectName: String, extension ext: String = fileExtension) -> String {
        "\(sanitizedBaseName(projectName)).\(ext)"
    }

    static func sanitizedBaseName(_ projectName: String) -> String {
        let forbidden = CharacterSet(charactersIn: "/\\:?%*|\"<>").union(.newlines).union(.controlCharacters)
        let cleaned = projectName.unicodeScalars
            .map { forbidden.contains($0) ? "-" : String($0) }
            .joined()
            .trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: ".")))
        return cleaned.isEmpty ? "appartement" : String(cleaned.prefix(80))
    }
}
