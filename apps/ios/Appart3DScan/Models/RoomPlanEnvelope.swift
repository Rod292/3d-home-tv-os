import Foundation

/// Enveloppe `.appart3d.json` — contrat iOS → web (voir docs/ARCHITECTURE.md § « RoomPlan envelope »).
///
/// Générique sur les types de structure et de pièce afin que l'encodage soit testable sans RoomPlan :
/// dans l'app on utilise `RoomPlanEnvelope<CapturedStructure, CapturedRoom>` et les valeurs Codable de
/// RoomPlan sont **embarquées telles quelles** (aucune recopie champ par champ).
struct RoomPlanEnvelope<Structure: Encodable & Sendable, Room: Encodable & Sendable>: Encodable, Sendable {
    static var formatIdentifier: String { "appart3d.roomplan" }
    static var currentVersion: Int { 1 }

    let format: String
    let version: Int
    /// ISO 8601, ex. `2026-10-09T12:00:00Z`.
    let capturedAt: String
    /// Identifiant machine (`utsname.machine`), ex. `iPhone17,1`.
    let device: String
    let appVersion: String
    /// Résultat fusionné multi-pièces (StructureBuilder). Encodé `null` quand la fusion a échoué.
    let structure: Structure?
    /// Chaque pièce scannée, toujours présent.
    let rooms: [Room]
    /// Noms donnés par l'utilisateur, alignés sur `rooms` (même longueur, même ordre).
    let roomNames: [String]

    init(capturedAt: String, device: String, appVersion: String, structure: Structure?, rooms: [Room], roomNames: [String]) {
        self.format = Self.formatIdentifier
        self.version = Self.currentVersion
        self.capturedAt = capturedAt
        self.device = device
        self.appVersion = appVersion
        self.structure = structure
        self.rooms = rooms
        self.roomNames = roomNames
    }

    private enum CodingKeys: String, CodingKey {
        case format, version, capturedAt, device, appVersion, structure, rooms, roomNames
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(format, forKey: .format)
        try c.encode(version, forKey: .version)
        try c.encode(capturedAt, forKey: .capturedAt)
        try c.encode(device, forKey: .device)
        try c.encode(appVersion, forKey: .appVersion)
        // `encode` (et non `encodeIfPresent`) : la clé est toujours présente, avec `null` si absente.
        try c.encode(structure, forKey: .structure)
        try c.encode(rooms, forKey: .rooms)
        try c.encode(roomNames, forKey: .roomNames)
    }
}

/// Placeholder quand aucune structure fusionnée n'existe (sert uniquement de paramètre générique).
struct NoStructure: Encodable, Sendable {}
