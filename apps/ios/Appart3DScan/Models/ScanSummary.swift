import Foundation

/// Résumé lisible d'un scan, calculé à partir du JSON de l'enveloppe.
///
/// On lit le JSON (et non les types RoomPlan) pour que le même code serve aux vrais scans et au mode démo,
/// et pour être tolérant aux petites variations de l'encodage Codable de RoomPlan.
struct ScanSummary: Codable, Hashable, Sendable {
    var roomCount: Int
    var walls: Int
    var doors: Int
    var windows: Int
    var openings: Int
    /// Clé de catégorie RoomPlan (`sofa`, `table`…) → nombre.
    var objectsByCategory: [String: Int]
    /// `true` si les comptes proviennent de la structure fusionnée (sinon somme des pièces).
    var fromMergedStructure: Bool

    var objectCount: Int { objectsByCategory.values.reduce(0, +) }

    enum ParseError: Error { case notAnEnvelope }

    static func from(envelopeData data: Data) throws -> ScanSummary {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              root["format"] as? String == "appart3d.roomplan" else { throw ParseError.notAnEnvelope }
        let rooms = root["rooms"] as? [[String: Any]] ?? []
        let structure = root["structure"] as? [String: Any]
        let containers = structure.map { [$0] } ?? rooms

        var summary = ScanSummary(roomCount: rooms.count, walls: 0, doors: 0, windows: 0, openings: 0,
                                  objectsByCategory: [:], fromMergedStructure: structure != nil)
        for container in containers {
            summary.walls += (container["walls"] as? [Any])?.count ?? 0
            summary.doors += (container["doors"] as? [Any])?.count ?? 0
            summary.windows += (container["windows"] as? [Any])?.count ?? 0
            summary.openings += (container["openings"] as? [Any])?.count ?? 0
            for object in container["objects"] as? [[String: Any]] ?? [] {
                let key = categoryKey(object["category"]) ?? "unknown"
                summary.objectsByCategory[key, default: 0] += 1
            }
        }
        return summary
    }

    /// RoomPlan encode ses enums comme `{"sofa":{}}` ; on accepte aussi une simple chaîne.
    static func categoryKey(_ value: Any?) -> String? {
        if let string = value as? String { return string }
        if let dict = value as? [String: Any] { return dict.keys.sorted().first }
        return nil
    }
}
