import AppIntents
import SwiftUI
import WidgetKit

@main
struct MaisonWidgetsBundle: WidgetBundle {
    var body: some Widget {
        HomeStatusWidget()
        SceneButtonsWidget()
        LightsControl()
        SceneControl()
    }
}

// MARK: - Contrôles (Centre de contrôle, écran verrouillé, bouton Action)

struct LightsControl: ControlWidget {
    static let kind = "com.example.appart3d.home.lights"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind, provider: LightsValueProvider()) { isOn in
            ControlWidgetToggle("Lumières", isOn: isOn, action: SetLightsIntent()) { on in
                Label(on ? "Allumées" : "Éteintes", systemImage: on ? "lightbulb.2.fill" : "lightbulb.2")
            }
            .tint(.orange)
        }
        .displayName("Lumières")
        .description("Allume ou éteint toutes les lumières de la maison.")
    }
}

struct LightsValueProvider: ControlValueProvider {
    var previewValue: Bool { true }

    func currentValue() async throws -> Bool {
        if let client = HomeEnvironment.makeClient(timeout: 3), let snap = try? await client.snapshot() {
            SharedStore.lastSnapshot = snap
            return snap.anyLightOn
        }
        return SharedStore.lastSnapshot?.anyLightOn ?? false
    }
}

struct SceneControl: ControlWidget {
    static let kind = "com.example.appart3d.home.scene"

    var body: some ControlWidgetConfiguration {
        AppIntentControlConfiguration(kind: Self.kind, intent: SceneControlConfiguration.self) { config in
            ControlWidgetButton(action: RunSceneIntent(scene: config.scene)) {
                Label(config.scene.title, systemImage: config.scene.symbol)
            }
            .tint(DeviceStyle.sceneTint(config.scene.rawValue))
        }
        .displayName("Scène")
        .description("Lance une ambiance Maison.")
        .promptsForUserConfiguration()
    }
}

// MARK: - Timeline

struct HomeEntry: TimelineEntry {
    var date: Date
    var snapshot: HomeSnapshot?
    var offline: Bool
}

struct HomeProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeEntry {
        HomeEntry(date: .now, snapshot: MockHomeHub.initialSnapshot(), offline: false)
    }

    func getSnapshot(in context: Context, completion: @escaping @Sendable (HomeEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        Task { completion(await Self.load()) }
    }

    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<HomeEntry>) -> Void) {
        Task {
            let entry = await Self.load()
            completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(15 * 60))))
        }
    }

    static func load() async -> HomeEntry {
        if let client = HomeEnvironment.makeClient(timeout: 4) {
            if let snap = try? await client.snapshot() {
                SharedStore.lastSnapshot = snap
                return HomeEntry(date: .now, snapshot: snap, offline: false)
            }
            return HomeEntry(date: .now, snapshot: SharedStore.lastSnapshot, offline: true)
        }
        return HomeEntry(date: .now, snapshot: nil, offline: false)
    }
}

// MARK: - Widgets d'écran d'accueil

struct HomeStatusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.example.appart3d.home.status", provider: HomeProvider()) { entry in
            StatusWidgetView(entry: entry)
                .containerBackground(for: .widget) { WidgetBackground(warm: entry.snapshot?.anyLightOn ?? false) }
        }
        .configurationDisplayName("Maison")
        .description("Lumières allumées et bascule rapide.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
    }
}

struct SceneButtonsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.example.appart3d.home.scenes", provider: HomeProvider()) { entry in
            ScenesWidgetView(entry: entry)
                .containerBackground(for: .widget) { WidgetBackground(warm: entry.snapshot?.anyLightOn ?? false) }
        }
        .configurationDisplayName("Ambiances")
        .description("Lancez une scène d'un geste.")
        .supportedFamilies([.systemMedium, .systemSmall])
    }
}

struct WidgetBackground: View {
    var warm: Bool
    var body: some View {
        ZStack {
            LinearGradient(colors: Theme.backgroundColors(warmth: warm ? 0.8 : 0), startPoint: .topLeading, endPoint: .bottomTrailing)
            if warm {
                RadialGradient(colors: [Theme.amber.opacity(0.45), .clear], center: .topLeading, startRadius: 0, endRadius: 180)
            }
        }
    }
}

struct StatusWidgetView: View {
    var entry: HomeEntry
    @Environment(\.widgetFamily) private var family

    private var count: Int { entry.snapshot?.lightsOnCount ?? 0 }
    private var name: String { entry.snapshot?.home ?? SharedStore.homeName }
    private var subtitle: String {
        entry.snapshot == nil ? "Ouvrez Maison pour l'appairer" : HomeText.lightsSummary(count)
    }

    var body: some View {
        switch family {
        case .accessoryCircular:
            Button(intent: ToggleLightsIntent()) {
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 0) {
                        Image(systemName: count > 0 ? "lightbulb.2.fill" : "lightbulb.2")
                            .font(.title3)
                        Text("\(count)").font(.caption.bold())
                    }
                }
            }
            .buttonStyle(.plain)
            .widgetAccentable()
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label(name, systemImage: "house.fill").font(.headline).widgetAccentable()
                Text(subtitle).font(.caption)
                if entry.offline { Text("Hors ligne").font(.caption2).foregroundStyle(.secondary) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .systemMedium:
            HStack(spacing: 16) {
                statusColumn
                Spacer(minLength: 0)
                VStack(spacing: 10) {
                    sceneButton(.bright)
                    sceneButton(.cozy)
                }
                .frame(width: 128)
            }
        default:
            statusColumn
        }
    }

    private var statusColumn: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "house.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.amber)
                Spacer()
                if entry.offline {
                    Image(systemName: "wifi.exclamationmark").font(.caption).foregroundStyle(.white.opacity(0.6))
                }
            }
            Spacer(minLength: 0)
            Text(count > 0 ? "\(count)" : "—")
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .contentTransition(.numericText())
            Text(subtitle)
                .font(.system(.caption, design: .rounded).weight(.medium))
                .foregroundStyle(.white.opacity(0.75))
                .lineLimit(2)
            Button(intent: ToggleLightsIntent()) {
                Label(count > 0 ? "Éteindre" : "Allumer", systemImage: "power")
                    .font(.system(.caption, design: .rounded).weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(count > 0 ? Theme.amber.opacity(0.9) : .white.opacity(0.16)))
                    .foregroundStyle(count > 0 ? Color.black.opacity(0.8) : .white)
            }
            .buttonStyle(.plain)
        }
    }

    private func sceneButton(_ scene: SceneOption) -> some View {
        SceneWidgetButton(scene: scene)
    }
}

struct SceneWidgetButton: View {
    var scene: SceneOption
    var body: some View {
        Button(intent: RunSceneIntent(scene: scene)) {
            HStack(spacing: 8) {
                Image(systemName: scene.symbol)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(DeviceStyle.sceneTint(scene.rawValue))
                    .frame(width: 22)
                Text(scene.title)
                    .font(.system(.footnote, design: .rounded).weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.white.opacity(0.12)))
        }
        .buttonStyle(.plain)
    }
}

struct ScenesWidgetView: View {
    var entry: HomeEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let scenes: [SceneOption] = family == .systemSmall ? [.bright, .cozy, .night] : [.bright, .cozy, .movie, .night, .away]
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Ambiances")
                    .font(.system(.subheadline, design: .rounded).weight(.bold))
                    .foregroundStyle(.white)
                Spacer()
                Text(HomeText.lightsSummary(entry.snapshot?.lightsOnCount ?? 0))
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(.white.opacity(0.65))
                    .lineLimit(1)
            }
            if family == .systemSmall {
                ForEach(scenes, id: \.self) { SceneWidgetButton(scene: $0) }
            } else {
                Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                    GridRow {
                        SceneWidgetButton(scene: .bright)
                        SceneWidgetButton(scene: .cozy)
                        SceneWidgetButton(scene: .movie)
                    }
                    GridRow {
                        SceneWidgetButton(scene: .night)
                        SceneWidgetButton(scene: .away)
                        Button(intent: AllOffIntent()) {
                            HStack(spacing: 8) {
                                Image(systemName: "power").font(.system(size: 14, weight: .bold))
                                Text("Tout").font(.system(.footnote, design: .rounded).weight(.semibold))
                                Spacer(minLength: 0)
                            }
                            .foregroundStyle(.black.opacity(0.8))
                            .padding(.horizontal, 10)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.amber))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}
