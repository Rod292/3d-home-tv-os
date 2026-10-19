import Foundation

/// Actions de haut niveau partagées par l'app, les App Intents, les widgets et les contrôles.
/// Testable avec un faux client.
struct HomeActions: Sendable {
    var client: HomeClient

    enum ToggleOutcome: Equatable, Sendable {
        case turnedOff(count: Int)
        case scene(id: String, name: String)
    }

    /// Ce que ferait « Basculer les lumières » : tout éteindre si une lumière est allumée,
    /// sinon la dernière scène (ou Lumineux).
    static func togglePlan(for snapshot: HomeSnapshot, lastSceneId: String?) -> ToggleOutcome {
        if snapshot.anyLightOn { return .turnedOff(count: snapshot.lightsOnCount) }
        let lightScenes: Set<String> = ["bright", "cozy", "movie"]
        let id = lastSceneId.flatMap { lightScenes.contains($0) ? $0 : nil } ?? "bright"
        let name = snapshot.scenes.first { $0.id == id }?.name ?? HomeScene.defaults.first { $0.id == id }?.name ?? "Lumineux"
        return .scene(id: id, name: name)
    }

    @discardableResult
    func toggleLights(lastSceneId: String?) async throws -> (ToggleOutcome, HomeSnapshot) {
        let snap = try await client.snapshot()
        let outcome = Self.togglePlan(for: snap, lastSceneId: lastSceneId)
        switch outcome {
        case .turnedOff:
            let after = try await lightsOff(in: snap)
            return (outcome, after)
        case .scene(let id, _):
            return (outcome, try await client.activateScene(id))
        }
    }

    /// Allume (dernière scène / Lumineux) ou éteint toutes les lumières (contrôle « Lumières »).
    @discardableResult
    func setLights(on: Bool, lastSceneId: String?) async throws -> HomeSnapshot {
        let snap = try await client.snapshot()
        if on {
            guard !snap.anyLightOn else { return snap }
            guard case .scene(let id, _) = Self.togglePlan(for: snap, lastSceneId: lastSceneId) else { return snap }
            return try await client.activateScene(id)
        }
        return try await lightsOff(in: snap)
    }

    /// Éteint lampes et prises allumées (en parallèle).
    func lightsOff(in snap: HomeSnapshot) async throws -> HomeSnapshot {
        let targets = snap.devices.filter { $0.kind.countsAsLight && $0.state.on != false && $0.state.reachable }
        return try await powerOff(targets, in: snap)
    }

    /// « Tout éteindre » : lumières, télé, ventilateur (scène Absent si disponible).
    @discardableResult
    func allOff() async throws -> HomeSnapshot {
        let snap = try await client.snapshot()
        if snap.scenes.contains(where: { $0.id == "away" }) {
            return try await client.activateScene("away")
        }
        let targets = snap.devices.filter { $0.isSupported && $0.state.on == true && $0.state.reachable }
        return try await powerOff(targets, in: snap)
    }

    private func powerOff(_ targets: [Device], in snap: HomeSnapshot) async throws -> HomeSnapshot {
        var result = snap
        let client = self.client
        try await withThrowingTaskGroup(of: Device.self) { group in
            for d in targets {
                group.addTask { try await client.perform(.power(false), on: d.id) }
            }
            for try await d in group { result.upsert(d) }
        }
        return result
    }

    @discardableResult
    func runScene(_ id: String) async throws -> HomeSnapshot {
        try await client.activateScene(id)
    }

    /// Bascule un appareil ; renvoie son nouvel état.
    func toggle(deviceId: String) async throws -> Device {
        try await client.perform(.toggle, on: deviceId)
    }

    func setBrightness(_ value: Int, deviceId: String) async throws -> Device {
        try await client.perform(.brightness(HomeReducer.clamp(value)), on: deviceId)
    }
}

enum HomeText {
    /// « 2 lumières allumées », « 1 lumière allumée », « Tout est éteint ».
    static func lightsSummary(_ count: Int) -> String {
        switch count {
        case 0: "Tout est éteint"
        case 1: "1 lumière allumée"
        default: "\(count) lumières allumées"
        }
    }

    static func deviceState(_ d: Device) -> String {
        guard d.state.reachable else { return "Injoignable" }
        switch d.kind {
        case .light:
            guard d.state.on == true else { return d.state.on == nil ? "Inconnu" : "Éteinte" }
            if let b = d.state.brightness { return "\(Int(b.rounded())) %" }
            return "Allumée"
        case .plug:
            return d.state.on == true ? "Allumée" : d.state.on == nil ? "Inconnu" : "Éteinte"
        case .fan:
            guard d.state.on == true else { return "Arrêté" }
            let steps = max(1, d.capabilities.speedSteps ?? 6)
            return "Vitesse \(FanMath.step(for: d.state.speed ?? 0, steps: steps))"
        case .tv:
            guard d.state.on == true else { return d.state.on == nil ? "Inconnu" : "Éteinte" }
            return d.state.media?.app ?? d.state.media?.channel ?? d.state.source ?? "Allumée"
        case .speaker:
            switch d.state.media?.state {
            case .playing: return d.state.media?.title.map { "♪ \($0)" } ?? "Lecture"
            case .paused: return "En pause"
            default: return d.state.on == nil ? "Inconnu" : "En veille"
            }
        default:
            return d.state.on == true ? "Allumé" : "Éteint"
        }
    }
}

enum FanMath {
    /// Vitesse 0...100 → cran 0...steps.
    static func step(for speed: Double, steps: Int) -> Int {
        guard speed > 0 else { return 0 }
        return min(steps, max(1, Int((speed / 100 * Double(steps)).rounded())))
    }

    /// Cran → pourcentage envoyé au bridge.
    static func speed(forStep step: Int, steps: Int) -> Int {
        guard step > 0 else { return 0 }
        return Int((Double(min(step, steps)) / Double(steps) * 100).rounded())
    }
}
