import SwiftUI

/// Symboles et teintes des appareils et scènes (partagés app / widgets / intents).
enum DeviceStyle {
    static func symbol(for d: Device) -> String {
        symbol(kind: d.kind, name: d.name)
    }

    static func symbol(kind: DeviceKind, name: String) -> String {
        let n = name.lowercased()
        switch kind {
        case .light:
            if n.contains("ambilight") { return "sparkles.tv.fill" }
            if n.contains("bandeau") || n.contains("ruban") || n.contains("strip") { return "light.strip.2.fill" }
            if n.contains("lampadaire") { return "lamp.floor.fill" }
            if n.contains("lustre") || n.contains("suspension") { return "chandelier.fill" }
            if n.contains("bureau") { return "lamp.desk.fill" }
            return "lightbulb.fill"
        case .plug:
            if n.contains("lampe") || n.contains("varmblixt") { return "lamp.table.fill" }
            return "powerplug.fill"
        case .fan: return "fan.fill"
        case .tv: return "tv.fill"
        case .remote: return "av.remote.fill"
        case .speaker: return "homepodmini.fill"
        case .unknown: return "questionmark.square.dashed"
        }
    }

    static func sceneSymbol(_ icon: String) -> String {
        switch icon {
        case "sun": "sun.max.fill"
        case "sofa": "sofa.fill"
        case "film": "popcorn.fill"
        case "moon": "moon.stars.fill"
        case "door": "door.left.hand.open"
        default: "sparkles"
        }
    }

    static func sceneSymbol(forId id: String) -> String {
        sceneSymbol(HomeScene.defaults.first { $0.id == id }?.icon ?? "")
    }

    /// Teinte de la scène (puce, widget).
    static func sceneTint(_ id: String) -> Color {
        switch id {
        case "bright": Color(hex: "#ffd36b")
        case "cozy": Color(hex: "#ff9a4d")
        case "movie": Color(hex: "#8b6bff")
        case "night": Color(hex: "#6f8cff")
        case "away": Color(hex: "#9aa3b5")
        default: Theme.amber
        }
    }

    /// Couleur affichée pour un appareil allumé (couleur de la lampe, sinon teinte par type).
    static func glow(for d: Device) -> Color {
        guard d.state.on == true, d.state.reachable else { return .clear }
        switch d.kind {
        case .light:
            if let hex = d.state.color { return Color(hex: hex) }
            if let k = d.state.kelvin { return Color(hex: ColorMath.kelvinToHex(k)) }
            return Theme.amber
        case .plug: return Theme.amber
        case .fan: return Color(hex: "#7fd6ff")
        case .tv: return Color(hex: "#8b9bff")
        case .speaker: return Color(hex: "#d77dff")
        default: return Theme.amber
        }
    }
}

enum Theme {
    static let navy = Color(hex: "#070b1f")
    static let midnight = Color(hex: "#0d1233")
    static let plum = Color(hex: "#2a1240")
    static let deepPlum = Color(hex: "#170a26")
    static let amber = Color(hex: "#ffb45e")
    static let ember = Color(hex: "#ff7a45")
    static let cream = Color(hex: "#fff4e6")

    /// Fond de l'app : navy → prune, qui se réchauffe quand des lumières sont allumées (warmth 0…1).
    static func backgroundColors(warmth: Double) -> [Color] {
        let w = min(1, max(0, warmth))
        return [
            Color(hex: "#090d26").mix(with: Color(hex: "#2a1630"), by: w * 0.75),
            Color(hex: "#1a0f35").mix(with: Color(hex: "#4a1f3a"), by: w * 0.7),
            Color(hex: "#2a1240").mix(with: Color(hex: "#5c2a2e"), by: w * 0.65),
        ]
    }

    /// Fond qui suit le soleil : prune profond la nuit (day 0), bleu poudré → pêche le jour (day 1),
    /// lueur dorée au crépuscule (dusk 0…1). Tons moyens : le texte blanc reste lisible.
    static func backgroundColors(warmth: Double, day: Double, dusk: Double = 0) -> [Color] {
        let w = min(1, max(0, warmth))
        let d = min(1, max(0, day))
        let k = min(1, max(0, dusk)) * 0.7
        let night = backgroundColors(warmth: w)
        let dayStops = [
            Color(hex: "#2f4677").mix(with: Color(hex: "#3d3f6e"), by: w * 0.4),
            Color(hex: "#5d5a8a").mix(with: Color(hex: "#71557a"), by: w * 0.4),
            Color(hex: "#9a6f78").mix(with: Color(hex: "#a8665e"), by: w * 0.4),
        ]
        let duskStops = [Color(hex: "#2e2a5e"), Color(hex: "#7a4566"), Color(hex: "#c4744f")]
        return zip(zip(night, dayStops), duskStops).map { pair, golden in
            pair.0.mix(with: pair.1, by: d).mix(with: golden, by: k)
        }
    }
}

extension Color {
    init(hex: String) {
        let c = ColorMath.rgb(hex) ?? (1, 0.7, 0.4)
        self.init(.sRGB, red: c.r, green: c.g, blue: c.b, opacity: 1)
    }
}
