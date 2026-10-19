import AppIntents
import Foundation
import WidgetKit

// App Intents de Maison, compilés dans l'app ET dans l'extension de widgets (boutons interactifs, contrôles).
// Ils tournent sans ouvrir l'app (openAppWhenRun = false), répondent par un dialogue court et
// échouent proprement hors du Wi-Fi de la maison.

struct MaisonIntentError: Error, CustomLocalizedStringResourceConvertible {
    var message: String
    var localizedStringResource: LocalizedStringResource { LocalizedStringResource(stringLiteral: message) }

    init(_ error: Error) {
        message = HomeError.wrap(error).shortMessage
    }
}

enum IntentRunner {
    static func actions() throws -> HomeActions {
        guard let client = HomeEnvironment.makeClient(timeout: 3.5) else { throw MaisonIntentError(HomeError.notPaired) }
        return HomeActions(client: client)
    }

    /// Exécute une opération, enregistre l'état obtenu et rafraîchit widgets et contrôles.
    static func run<T: Sendable>(_ body: @Sendable (HomeActions) async throws -> T) async throws -> T {
        do {
            let result = try await body(try actions())
            return result
        } catch let error as MaisonIntentError {
            throw error
        } catch {
            throw MaisonIntentError(error)
        }
    }

    static func didChange(_ snapshot: HomeSnapshot?) {
        if let snapshot { SharedStore.lastSnapshot = snapshot }
        WidgetCenter.shared.reloadAllTimelines()
        ControlCenter.shared.reloadAllControls()
        NotificationCenter.default.post(name: .maisonHomeDidChange, object: nil)
    }
}

extension Notification.Name {
    static let maisonHomeDidChange = Notification.Name("maisonHomeDidChange")
}

// MARK: - Scènes

enum SceneOption: String, AppEnum, CaseIterable, Sendable {
    case bright, cozy, movie, night, away

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Scène" }

    static var caseDisplayRepresentations: [SceneOption: DisplayRepresentation] {
        [
            .bright: DisplayRepresentation(title: "Lumineux", image: .init(systemName: "sun.max.fill")),
            .cozy: DisplayRepresentation(title: "Cosy", image: .init(systemName: "sofa.fill")),
            .movie: DisplayRepresentation(title: "Film", image: .init(systemName: "popcorn.fill")),
            .night: DisplayRepresentation(title: "Nuit", image: .init(systemName: "moon.stars.fill")),
            .away: DisplayRepresentation(title: "Absent", image: .init(systemName: "door.left.hand.open")),
        ]
    }

    var title: String {
        HomeScene.defaults.first { $0.id == rawValue }?.name ?? rawValue
    }

    var symbol: String { DeviceStyle.sceneSymbol(forId: rawValue) }
}

// MARK: - Appareils

struct DeviceEntity: AppEntity, Sendable {
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Appareil" }
    static var defaultQuery: DeviceQuery { DeviceQuery() }

    var id: String
    var name: String
    var room: String
    var kind: String

    init(_ d: Device) {
        id = d.id
        name = d.name
        room = d.room
        kind = d.kind.rawValue
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(room)",
                              image: .init(systemName: DeviceStyle.symbol(kind: DeviceKind(rawValue: kind), name: name)))
    }
}

struct DeviceQuery: EntityStringQuery {
    /// Appareils depuis le pont (réponse rapide), sinon le dernier état connu.
    static func devices() async -> [Device] {
        if let client = HomeEnvironment.makeClient(timeout: 3), let snap = try? await client.snapshot() {
            SharedStore.lastSnapshot = snap
            return snap.devices.filter(\.isSupported)
        }
        return (SharedStore.lastSnapshot ?? (SharedStore.isMock ? MockHomeHub.initialSnapshot() : nil))?
            .devices.filter(\.isSupported) ?? []
    }

    func entities(for identifiers: [String]) async throws -> [DeviceEntity] {
        let known = SharedStore.lastSnapshot?.devices ?? []
        var found = identifiers.compactMap { id in known.first { $0.id == id } }
        if found.count < identifiers.count {
            let fresh = await Self.devices()
            found = identifiers.compactMap { id in fresh.first { $0.id == id } }
        }
        return found.map(DeviceEntity.init)
    }

    func suggestedEntities() async throws -> [DeviceEntity] {
        await Self.devices().map(DeviceEntity.init)
    }

    func entities(matching string: String) async throws -> [DeviceEntity] {
        let needle = string.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        return await Self.devices()
            .filter { $0.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current).contains(needle) }
            .map(DeviceEntity.init)
    }
}

// MARK: - Applis de la télé

struct TvAppEntity: AppEntity, Sendable {
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Appli TV" }
    static var defaultQuery: TvAppQuery { TvAppQuery() }

    /// Paquet Android.
    var id: String
    var label: String

    init(_ app: TvApp) {
        id = app.id
        label = app.label
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(label)", image: .init(systemName: TvAppStyle.brand(id: id, label: label).symbol))
    }
}

struct TvAppQuery: EntityStringQuery {
    /// Télé et applis installées depuis le pont (réponse rapide), sinon le dernier état connu.
    static func tvAndApps() async -> (tv: Device, apps: [TvApp])? {
        let devices = await DeviceQuery.devices()
        guard let tv = devices.first(where: { $0.kind == .tv && !$0.capabilities.tvApps.isEmpty }) else { return nil }
        return (tv, tv.capabilities.tvApps)
    }

    func entities(for identifiers: [String]) async throws -> [TvAppEntity] {
        let known = (SharedStore.lastSnapshot?.devices ?? []).first { $0.kind == .tv }?.capabilities.tvApps ?? []
        var found = identifiers.compactMap { id in known.first { $0.id == id } }
        if found.count < identifiers.count, let fresh = await Self.tvAndApps()?.apps {
            found = identifiers.compactMap { id in fresh.first { $0.id == id } }
        }
        return found.map(TvAppEntity.init)
    }

    func suggestedEntities() async throws -> [TvAppEntity] {
        (await Self.tvAndApps()?.apps ?? []).map(TvAppEntity.init)
    }

    func entities(matching string: String) async throws -> [TvAppEntity] {
        let fold = { (s: String) in s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current) }
        let needle = fold(string)
        return (await Self.tvAndApps()?.apps ?? []).filter { fold($0.label).contains(needle) }.map(TvAppEntity.init)
    }
}

// MARK: - Intents

struct ToggleLightsIntent: AppIntent {
    static let title: LocalizedStringResource = "Basculer les lumières"
    static let description = IntentDescription("Éteint toutes les lumières si l'une d'elles est allumée, sinon rallume la dernière ambiance (ou Lumineux).")
    static let openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let last = SharedStore.lastSceneId
        let (outcome, snap) = try await IntentRunner.run { try await $0.toggleLights(lastSceneId: last) }
        IntentRunner.didChange(snap)
        switch outcome {
        case .turnedOff(let n):
            return .result(dialog: "\(n <= 1 ? "Lumière éteinte" : "Lumières éteintes")")
        case .scene(_, let name):
            return .result(dialog: "Ambiance \(name)")
        }
    }
}

struct RunSceneIntent: AppIntent {
    static let title: LocalizedStringResource = "Lancer une scène"
    static let description = IntentDescription("Lance une ambiance : Lumineux, Cosy, Film, Nuit ou Absent.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Scène", default: .cozy)
    var scene: SceneOption

    static var parameterSummary: some ParameterSummary {
        Summary("Lancer \(\.$scene)")
    }

    init() {}
    init(scene: SceneOption) { self.scene = scene }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let id = scene.rawValue
        let snap = try await IntentRunner.run { try await $0.runScene(id) }
        SharedStore.lastSceneId = id
        IntentRunner.didChange(snap)
        return .result(dialog: "\(scene == .away ? "Mode Absent activé" : "Ambiance \(scene.title)")")
    }
}

struct ToggleDeviceIntent: AppIntent {
    static let title: LocalizedStringResource = "Basculer un appareil"
    static let description = IntentDescription("Allume ou éteint une lampe, la télé ou le ventilateur.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Appareil")
    var device: DeviceEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Basculer \(\.$device)")
    }

    init() {}
    init(device: DeviceEntity) { self.device = device }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let id = device.id
        let updated = try await IntentRunner.run { try await $0.toggle(deviceId: id) }
        var snap = SharedStore.lastSnapshot
        snap?.upsert(updated)
        IntentRunner.didChange(snap)
        guard updated.state.reachable else {
            return .result(dialog: "\(updated.name) est injoignable (interrupteur coupé ?)")
        }
        let feminine = updated.kind == .light || updated.kind == .plug || updated.kind == .tv
        let word = updated.state.on == true ? (feminine ? "allumée" : "allumé") : (feminine ? "éteinte" : "éteint")
        return .result(dialog: "\(updated.name) \(word)")
    }
}

struct SetBrightnessIntent: AppIntent {
    static let title: LocalizedStringResource = "Régler la luminosité"
    static let description = IntentDescription("Règle la luminosité d'une lampe, ou de toutes les lampes allumées.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Luminosité", default: 50, inclusiveRange: (0, 100))
    var brightness: Int

    @Parameter(title: "Lampe", description: "Laisser vide pour toutes les lampes allumées.")
    var device: DeviceEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("Régler \(\.$device) à \(\.$brightness) %")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let value = HomeReducer.clamp(brightness)
        let target = device?.id
        let snap: HomeSnapshot = try await IntentRunner.run { actions in
            var snap = try await actions.client.snapshot()
            let ids: [String]
            if let target {
                ids = [target]
            } else {
                let dimmable = snap.devices.filter { $0.kind == .light && $0.capabilities.brightness == true && $0.state.reachable }
                let lit = dimmable.filter { $0.state.on == true }
                ids = (lit.isEmpty ? dimmable : lit).map(\.id)
            }
            for id in ids { snap.upsert(try await actions.setBrightness(value, deviceId: id)) }
            return snap
        }
        IntentRunner.didChange(snap)
        let name = device?.name ?? "Lumières"
        return .result(dialog: "\(name) à \(value) %")
    }
}

struct OpenTvAppIntent: AppIntent {
    static let title: LocalizedStringResource = "Ouvrir une appli sur la TV"
    static let description = IntentDescription("Ouvre une appli (Netflix, YouTube, myCANAL…) sur la télé, en l'allumant si besoin.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "Appli")
    var app: TvAppEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Ouvrir \(\.$app) sur la TV")
    }

    init() {}
    init(app: TvAppEntity) { self.app = app }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let appId = app.id
        let label = app.label
        let updated = try await IntentRunner.run { actions in
            let snap = try await actions.client.snapshot()
            guard let tv = snap.devices.first(where: { $0.kind == .tv }) else { throw HomeError.http(404, "aucune télé") }
            return try await actions.client.perform(.button("app:\(appId)"), on: tv.id)
        }
        var snap = SharedStore.lastSnapshot
        snap?.upsert(updated)
        IntentRunner.didChange(snap)
        return .result(dialog: "\(label) sur la TV")
    }
}

struct AllOffIntent: AppIntent {
    static let title: LocalizedStringResource = "Tout éteindre"
    static let description = IntentDescription("Éteint les lumières, la télé et le ventilateur.")
    static let openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let snap = try await IntentRunner.run { try await $0.allOff() }
        IntentRunner.didChange(snap)
        return .result(dialog: "Tout est éteint")
    }
}

/// Contrôle « Lumières » (Centre de contrôle, écran verrouillé, bouton Action).
struct SetLightsIntent: SetValueIntent {
    static let title: LocalizedStringResource = "Allumer ou éteindre les lumières"
    static let openAppWhenRun: Bool = false
    static let isDiscoverable: Bool = false

    @Parameter(title: "Allumées")
    var value: Bool

    init() {}

    func perform() async throws -> some IntentResult {
        let on = value
        let last = SharedStore.lastSceneId
        let snap = try await IntentRunner.run { try await $0.setLights(on: on, lastSceneId: last) }
        IntentRunner.didChange(snap)
        return .result()
    }
}

/// Configuration d'un bouton de scène dans le Centre de contrôle.
struct SceneControlConfiguration: ControlConfigurationIntent {
    static let title: LocalizedStringResource = "Scène Maison"
    static let isDiscoverable: Bool = false

    @Parameter(title: "Scène", default: .cozy)
    var scene: SceneOption

    init() {}
}
