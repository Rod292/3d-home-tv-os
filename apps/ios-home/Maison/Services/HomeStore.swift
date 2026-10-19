import Foundation
import Observation
import WidgetKit

/// État de la maison pour l'app : instantané + flux SSE (reconnexion), mises à jour optimistes.
@MainActor
@Observable
final class HomeStore {
    enum Connection: Equatable {
        case idle
        case connecting
        case live
        case offline(String)
    }

    private(set) var snapshot: HomeSnapshot?
    private(set) var connection: Connection = .idle
    /// Message d'erreur transitoire (toast).
    var toast: String?
    private(set) var isMock: Bool
    private(set) var isPaired: Bool
    /// Scène en cours d'activation (indicateur sur la puce).
    private(set) var pendingScene: String?
    private(set) var lastSceneId: String?
    /// Adresse courante du pont (peut changer après une redécouverte Bonjour).
    private(set) var bridgeURL: URL?
    /// Mode « Organiser » : ordre local prioritaire sur les snapshots poussés tant qu'il n'est pas envoyé.
    private(set) var reordering = false
    @ObservationIgnored private var orderAtStart: [String] = []
    @ObservationIgnored private var orderTask: Task<Void, Never>?

    @ObservationIgnored private var client: HomeClient?
    @ObservationIgnored private var streamTask: Task<Void, Never>?
    @ObservationIgnored private var inFlight: [String: Int] = [:]
    @ObservationIgnored private var throttles: [String: Throttle] = [:]
    @ObservationIgnored private var toastTask: Task<Void, Never>?
    @ObservationIgnored private var observer: NSObjectProtocol?
    @ObservationIgnored private var movedObserver: NSObjectProtocol?

    init() {
        isMock = SharedStore.isMock
        isPaired = SharedStore.isPaired
        snapshot = SharedStore.lastSnapshot ?? (SharedStore.isMock ? SharedStore.mockSnapshot ?? MockHomeHub.initialSnapshot() : nil)
        lastSceneId = SharedStore.lastSceneId
        bridgeURL = SharedStore.bridgeURL
        client = HomeEnvironment.makeClient()
        movedObserver = NotificationCenter.default.addObserver(forName: .maisonBridgeMoved, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.bridgeURL = SharedStore.bridgeURL }
        }
        observer = NotificationCenter.default.addObserver(forName: .maisonHomeDidChange, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }

    /// Test / aperçu : client injecté.
    init(client: HomeClient, snapshot: HomeSnapshot?) {
        isMock = true
        isPaired = true
        self.client = client
        self.snapshot = snapshot
    }

    var homeName: String {
        let name = snapshot?.home ?? ""
        return name.isEmpty ? SharedStore.homeName : name
    }

    var lightsOn: Int { snapshot?.lightsOnCount ?? 0 }
    /// Soleil vu par le pont (nil : pont ancien, démo, jamais connecté).
    var sun: SunInfo? { snapshot?.sun }
    var isOffline: Bool { if case .offline = connection { true } else { false } }
    var devices: [Device] { snapshot?.devices.filter(\.isSupported) ?? [] }
    var scenes: [HomeScene] {
        let s = snapshot?.scenes ?? []
        return s.isEmpty ? HomeScene.defaults : s
    }

    /// Pièces dans l'ordre Salon, Cuisine, Chambre puis les autres.
    var rooms: [String] {
        let order = ["Salon", "Cuisine", "Chambre"]
        let all = Set(devices.map(\.room).filter { !$0.isEmpty })
        return order.filter(all.contains) + all.subtracting(order).sorted()
    }

    func device(_ id: String) -> Device? { snapshot?.device(id) }

    /// Chaleur de l'ambiance (0…1) pour le fond : proportion de lumières allumées × luminosité.
    var warmth: Double {
        let lights = devices.filter { $0.kind.countsAsLight && $0.state.reachable }
        guard !lights.isEmpty else { return 0 }
        let sum = lights.reduce(0.0) { acc, d in
            guard d.state.on == true else { return acc }
            return acc + max(0.35, (d.state.brightness ?? 80) / 100)
        }
        return min(1, sum / Double(max(2, lights.count)) * 1.6)
    }

    // MARK: Cycle de vie

    func reconfigure() {
        isMock = SharedStore.isMock
        isPaired = SharedStore.isPaired
        bridgeURL = SharedStore.bridgeURL
        client = HomeEnvironment.makeClient()
        snapshot = isMock ? (SharedStore.mockSnapshot ?? MockHomeHub.initialSnapshot()) : SharedStore.lastSnapshot
        connection = .idle
        start()
    }

    func start() {
        streamTask?.cancel()
        guard let client else {
            connection = .idle
            return
        }
        connection = .connecting
        streamTask = Task { [weak self] in await self?.run(client) }
    }

    func stop() {
        streamTask?.cancel()
        streamTask = nil
    }

    func refresh() async {
        guard let client else { return }
        do {
            let fresh = try await client.snapshot()
            setSnapshot(fresh)
            if connection != .live { connection = .live }
        } catch {
            connection = .offline(HomeError.wrap(error).localizedDescription)
        }
    }

    private func run(_ client: HomeClient) async {
        var backoff: Double = 1
        var failures = 0
        while !Task.isCancelled {
            do {
                let fresh = try await client.snapshot()
                setSnapshot(fresh)
                connection = .live
                backoff = 1
                failures = 0
                bridgeURL = SharedStore.bridgeURL
                for try await event in client.events() {
                    apply(event)
                    if connection != .live { connection = .live }
                }
                // Flux fermé par le serveur : reconnexion rapide.
                try? await Task.sleep(for: .seconds(1))
            } catch {
                if Task.isCancelled { return }
                let e = HomeError.wrap(error)
                connection = .offline(e.localizedDescription)
                if e == .unauthorized {
                    isPaired = false
                }
                failures += 1
                // Le flux SSE est tombé (ou l'instantané échoue) : le pont a peut-être changé d'adresse.
                if e == .offline, failures % 3 == 2, let resilient = client as? ResilientBridgeClient {
                    if await resilient.relocate() != nil {
                        bridgeURL = SharedStore.bridgeURL
                        backoff = 0.5
                    }
                }
                try? await Task.sleep(for: .seconds(backoff))
                backoff = min(backoff * 2, 15)
            }
        }
    }

    func apply(_ event: HomeEvent) {
        switch event {
        case .snapshot(let s):
            // Ne pas écraser les mises à jour optimistes en cours.
            var merged = s
            for (id, n) in inFlight where n > 0 {
                if let mine = snapshot?.device(id) { merged.upsert(mine) }
            }
            if reordering || orderTask != nil, let mine = snapshot?.devices.map(\.id) {
                merged.devices = DeviceOrder.apply(mine, to: merged.devices)
            }
            setSnapshot(merged)
        case .device(let d):
            guard (inFlight[d.id] ?? 0) == 0 else { return }
            if snapshot == nil { snapshot = HomeSnapshot(home: "", devices: []) }
            snapshot?.upsert(d)
            persist()
        case .error, .unknown:
            break
        }
    }

    private func setSnapshot(_ s: HomeSnapshot) {
        snapshot = s
        persist()
    }

    @ObservationIgnored private var persistTask: Task<Void, Never>?

    /// Sauvegarde (débouncée) pour les widgets et le mode hors ligne.
    private func persist() {
        persistTask?.cancel()
        persistTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled, let snap = self?.snapshot else { return }
            SharedStore.lastSnapshot = snap
            if !SharedStore.homeName.isEmpty, !snap.home.isEmpty { SharedStore.homeName = snap.home }
            WidgetCenter.shared.reloadAllTimelines()
            ControlCenter.shared.reloadAllControls()
        }
    }

    // MARK: Actions

    /// Action optimiste : l'écran change tout de suite, la réponse du bridge fait foi ; retour arrière en cas d'échec.
    func perform(_ action: DeviceAction, on id: String) {
        guard let client, let before = snapshot?.device(id) else { return }
        guard before.state.reachable else {
            showToast("\(before.name) est injoignable (interrupteur coupé ?)")
            return
        }
        snapshot = HomeReducer.apply(action, deviceId: id, to: snapshot!)
        inFlight[id, default: 0] += 1
        Task {
            defer { inFlight[id, default: 1] -= 1 }
            do {
                let updated = try await client.perform(action, on: id)
                if inFlight[id] == 1 { snapshot?.upsert(updated) }
                persist()
            } catch {
                if inFlight[id] == 1 { snapshot?.upsert(before) }
                showToast(HomeError.wrap(error).localizedDescription)
            }
        }
    }

    func toggle(_ id: String) { perform(.toggle, on: id) }

    /// Envoi limité (curseurs) : au plus une requête toutes les 150 ms, la dernière valeur est toujours envoyée.
    func performThrottled(_ action: DeviceAction, on id: String, key: String) {
        guard let client else { return }
        if let snap = snapshot { snapshot = HomeReducer.apply(action, deviceId: id, to: snap) }
        let throttle = throttles[id + key] ?? Throttle()
        throttles[id + key] = throttle
        throttle.latest = action
        guard throttle.task == nil else { return }
        inFlight[id, default: 0] += 1
        throttle.task = Task { [weak self] in
            var sent: DeviceAction?
            while let next = throttle.latest, next != sent {
                sent = next
                do {
                    _ = try await client.perform(next, on: id)
                } catch {
                    self?.showToast(HomeError.wrap(error).localizedDescription)
                    break
                }
                try? await Task.sleep(for: .milliseconds(150))
            }
            throttle.task = nil
            throttle.latest = nil
            self?.inFlight[id, default: 1] -= 1
            // Resynchroniser l'appareil depuis le bridge après le geste.
            if let fresh = try? await client.snapshot().device(id), self?.inFlight[id] == 0 {
                self?.snapshot?.upsert(fresh)
                self?.persist()
            }
        }
    }

    func runScene(_ id: String) {
        guard let client, let snap = snapshot else { return }
        let before = snap
        snapshot = HomeReducer.apply(scene: id, to: snap)
        pendingScene = id
        lastSceneId = id
        SharedStore.lastSceneId = id
        Task {
            do {
                let fresh = try await client.activateScene(id)
                setSnapshot(fresh)
            } catch {
                snapshot = before
                showToast(HomeError.wrap(error).localizedDescription)
            }
            if pendingScene == id { pendingScene = nil }
        }
    }

    // MARK: Ordre des tuiles

    func beginReordering() {
        orderAtStart = snapshot?.devices.map(\.id) ?? []
        reordering = true
    }

    /// Fin du mode « Organiser » : envoie l'ordre s'il a changé.
    func endReordering() {
        reordering = false
        commitOrder()
    }

    /// Déplacement local, en direct pendant le glisser (relatif aux voisins dans l'ordre global).
    func moveDevice(_ id: String, onto target: String) {
        guard var snap = snapshot else { return }
        let order = DeviceOrder.move(id, onto: target, in: snap.devices.map(\.id))
        guard order != snap.devices.map(\.id) else { return }
        snap.devices = DeviceOrder.apply(order, to: snap.devices)
        snapshot = snap
    }

    /// Envoie l'ordre global complet (tous les identifiants) ; retour arrière en cas d'échec.
    func commitOrder() {
        guard let client, let snap = snapshot else { return }
        let order = snap.devices.map(\.id)
        guard order != orderAtStart else { return }
        let previous = orderAtStart
        orderAtStart = order
        persist()
        orderTask?.cancel()
        orderTask = Task { [weak self] in
            do {
                let fresh = try await client.setOrder(order)
                guard let self, !Task.isCancelled else { return }
                // L'ordre renvoyé fait foi ; l'état des appareils en cours d'action reste le nôtre.
                if !self.reordering { self.apply(.snapshot(fresh)) }
            } catch {
                guard let self, !Task.isCancelled else { return }
                if var s = self.snapshot {
                    s.devices = DeviceOrder.apply(previous, to: s.devices)
                    self.snapshot = s
                }
                self.orderAtStart = previous
                self.showToast(HomeError.wrap(error).localizedDescription)
            }
            self?.orderTask = nil
        }
    }

    /// Bouton global : tout éteindre si une lumière est allumée, sinon la dernière ambiance.
    func toggleAllLights() {
        guard let snap = snapshot else { return }
        switch HomeActions.togglePlan(for: snap, lastSceneId: SharedStore.lastSceneId) {
        case .scene(let id, _):
            runScene(id)
        case .turnedOff:
            for d in snap.devices where d.kind.countsAsLight && d.state.on == true && d.state.reachable {
                perform(.power(false), on: d.id)
            }
        }
    }

    func showToast(_ message: String) {
        toast = message
        toastTask?.cancel()
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(3.5))
            if !Task.isCancelled { self?.toast = nil }
        }
    }

    // MARK: Appairage

    func didPair(bridgeURL: URL, response: PairResponse, serviceName: String? = nil) {
        SharedStore.bridgeURL = bridgeURL
        SharedStore.bridgeServiceName = serviceName
        TokenStore.token = response.token
        SharedStore.homeName = response.home
        SharedStore.mockModeSetting = false
        reconfigure()
    }

    func enableDemo(_ on: Bool) {
        SharedStore.mockModeSetting = on
        reconfigure()
    }

    func forgetPairing() {
        SharedStore.forgetPairing()
        reconfigure()
    }
}

@MainActor
final class Throttle {
    var latest: DeviceAction?
    var task: Task<Void, Never>?
}
