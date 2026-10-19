import AppIntents

/// Raccourcis proposés automatiquement (app Raccourcis, Siri, Spotlight, bouton Action › Raccourci › Maison).
struct MaisonShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ToggleLightsIntent(),
            phrases: [
                "Basculer les lumières avec \(.applicationName)",
                "Allume ou éteins les lumières avec \(.applicationName)",
                "Lumières \(.applicationName)",
            ],
            shortTitle: "Basculer les lumières",
            systemImageName: "lightbulb.2.fill"
        )
        AppShortcut(
            intent: RunSceneIntent(),
            phrases: [
                "Lancer \(\.$scene) avec \(.applicationName)",
                "Ambiance \(\.$scene) dans \(.applicationName)",
                "Lancer une scène \(.applicationName)",
            ],
            shortTitle: "Lancer une scène",
            systemImageName: "sparkles"
        )
        AppShortcut(
            intent: AllOffIntent(),
            phrases: [
                "Tout éteindre avec \(.applicationName)",
                "Tout éteindre dans \(.applicationName)",
            ],
            shortTitle: "Tout éteindre",
            systemImageName: "power"
        )
        AppShortcut(
            intent: ToggleDeviceIntent(),
            phrases: [
                "Basculer un appareil avec \(.applicationName)",
                "Basculer \(\.$device) avec \(.applicationName)",
            ],
            shortTitle: "Basculer un appareil",
            systemImageName: "switch.2"
        )
        AppShortcut(
            intent: OpenTvAppIntent(),
            phrases: [
                "Ouvrir une appli sur la TV avec \(.applicationName)",
                "Ouvrir \(\.$app) sur la TV avec \(.applicationName)",
                "Mets \(\.$app) sur la télé avec \(.applicationName)",
            ],
            shortTitle: "Ouvrir une appli TV",
            systemImageName: "play.tv.fill"
        )
        AppShortcut(
            intent: SetBrightnessIntent(),
            phrases: [
                "Régler la luminosité avec \(.applicationName)",
            ],
            shortTitle: "Régler la luminosité",
            systemImageName: "sun.max.fill"
        )
    }

    static var shortcutTileColor: ShortcutTileColor { .orange }
}
