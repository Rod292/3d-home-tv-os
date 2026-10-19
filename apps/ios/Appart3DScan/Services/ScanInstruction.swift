import RoomPlan

/// Copie Sendable de `RoomCaptureSession.Instruction` avec un texte français.
enum ScanInstruction: Sendable, Equatable {
    case normal, moveCloseToWall, moveAwayFromWall, slowDown, turnOnLight, lowTexture

    init(_ instruction: RoomCaptureSession.Instruction) {
        switch instruction {
        case .moveCloseToWall: self = .moveCloseToWall
        case .moveAwayFromWall: self = .moveAwayFromWall
        case .slowDown: self = .slowDown
        case .turnOnLight: self = .turnOnLight
        case .lowTexture: self = .lowTexture
        default: self = .normal
        }
    }

    var message: String? {
        switch self {
        case .normal: nil
        case .moveCloseToWall: "Rapprochez-vous du mur"
        case .moveAwayFromWall: "Éloignez-vous un peu du mur"
        case .slowDown: "Ralentissez"
        case .turnOnLight: "Allumez la lumière"
        case .lowTexture: "Surface peu texturée : visez des zones plus détaillées"
        }
    }

    var symbol: String {
        switch self {
        case .normal: "checkmark.circle"
        case .moveCloseToWall: "arrow.up.forward"
        case .moveAwayFromWall: "arrow.down.backward"
        case .slowDown: "tortoise"
        case .turnOnLight: "lightbulb"
        case .lowTexture: "square.dashed"
        }
    }
}
