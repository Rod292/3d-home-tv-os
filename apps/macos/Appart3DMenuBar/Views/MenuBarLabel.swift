import SwiftUI

/// Icône de la barre des menus : maison (pleine si une lumière est allumée) + nombre de lumières allumées.
struct MenuBarLabel: View {
    let store: HomeStore

    var body: some View {
        let count = store.lightsOn
        HStack(spacing: 3) {
            Image(systemName: Self.symbolName(reachable: store.isReachable, lightsOn: count))
            if store.isReachable && count > 0 {
                Text("\(count)").monospacedDigit()
            }
        }
        .accessibilityLabel(Self.accessibilityText(reachable: store.isReachable, lightsOn: count))
    }

    nonisolated static func symbolName(reachable: Bool, lightsOn: Int) -> String {
        guard reachable else { return "house.slash" }
        return lightsOn > 0 ? "house.fill" : "house"
    }

    nonisolated static func accessibilityText(reachable: Bool, lightsOn: Int) -> String {
        guard reachable else { return "Appart3D — bridge injoignable" }
        switch lightsOn {
        case 0: return "Appart3D — tout est éteint"
        case 1: return "Appart3D — 1 lumière allumée"
        default: return "Appart3D — \(lightsOn) lumières allumées"
        }
    }
}
