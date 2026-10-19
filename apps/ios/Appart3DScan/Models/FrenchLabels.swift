import Foundation

/// Libellés français et SF Symbols pour les catégories RoomPlan.
enum FrenchLabels {
    static let roomSuggestions = ["Séjour", "Chambre", "Cuisine", "Salle de bain", "WC", "Entrée", "Bureau"]

    static func objectName(_ key: String) -> String {
        switch key {
        case "storage": "Rangement"
        case "refrigerator": "Réfrigérateur"
        case "stove": "Plaque de cuisson"
        case "bed": "Lit"
        case "sink": "Évier / lavabo"
        case "washerDryer": "Lave-linge"
        case "toilet": "WC"
        case "bathtub": "Baignoire"
        case "oven": "Four"
        case "dishwasher": "Lave-vaisselle"
        case "table": "Table"
        case "sofa": "Canapé"
        case "chair": "Chaise"
        case "fireplace": "Cheminée"
        case "television": "Télévision"
        case "stairs": "Escalier"
        default: "Autre"
        }
    }

    static func objectSymbol(_ key: String) -> String {
        switch key {
        case "storage": "cabinet"
        case "refrigerator": "refrigerator"
        case "stove": "stove"
        case "bed": "bed.double"
        case "sink": "sink"
        case "washerDryer": "washer"
        case "toilet": "toilet"
        case "bathtub": "bathtub"
        case "oven": "oven"
        case "dishwasher": "dishwasher"
        case "table": "table.furniture"
        case "sofa": "sofa"
        case "chair": "chair"
        case "fireplace": "fireplace"
        case "television": "tv"
        case "stairs": "stairs"
        default: "cube"
        }
    }

    static func plural(_ count: Int, _ singular: String, _ plural: String? = nil) -> String {
        "\(count) " + (count > 1 ? (plural ?? singular + "s") : singular)
    }
}
