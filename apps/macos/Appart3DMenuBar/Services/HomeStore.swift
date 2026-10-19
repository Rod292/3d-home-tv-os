import Foundation
import Observation

/// État de la maison pour la barre des menus : SSE (préféré) avec repli sur un sondage toutes les 5 s.
@MainActor
@Observable
final class HomeStore {
    enum Connection: Equatable {
        case connecting
        case live      // flux SSE ouvert
        case polling   // SSE indisponible, sondage HTTP OK
        case unreachable(String)
    }

    private(set) var snapshot: HomeSnapshot?
    private(set) var connection: Connection = .connecting

    private var task: Task<Void, Never>?
    static let pollInterval: Duration = .seconds(5)

    var lightsOn: Int { snapshot?.lightsOnCount ?? 0 }
    var isReachable: Bool {
        if case .unreachable = connection { return false }
        return snapshot != nil
    }

    init(autoStart: Bool = true) {
        if autoStart { start() }
    }

    func start() {
        task?.cancel()
        task = Task { [weak self] in await self?.run() }
    }

    /// À appeler quand l'adresse du bridge change.
    func restart() {
        snapshot = nil
        connection = .connecting
        start()
    }

    private func run() async {
        var sseFailures = 0
        while !Task.isCancelled {
            let client = BridgeClient(bridgeURL: AppSettings.bridgeURL)
            do {
                let fresh = try await client.fetchSnapshot()
                snapshot = fresh
                if connection != .live { connection = .polling }
            } catch {
                if Task.isCancelled { return }
                connection = .unreachable(error.localizedDescription)
                try? await Task.sleep(for: Self.pollInterval)
                continue
            }

            // Tentative SSE ; après plusieurs échecs, on reste en sondage et on réessaie le SSE de temps en temps.
            if sseFailures < 3 || sseFailures % 12 == 0 {
                var opened = false
                do {
                    try await client.streamEvents(
                        onOpen: { [weak self] in
                            opened = true
                            sseFailures = 0
                            self?.connection = .live
                        },
                        onEvent: { [weak self] event in self?.apply(event) }
                    )
                    // Flux fermé par le serveur : reconnexion rapide.
                } catch {
                    if Task.isCancelled { return }
                    // Coupure après ouverture (veille, redémarrage du bridge) : pas compté comme un échec SSE.
                    if !opened { sseFailures += 1 }
                }
                if connection == .live { connection = .polling }
                try? await Task.sleep(for: .seconds(1))
            } else {
                sseFailures += 1
                try? await Task.sleep(for: Self.pollInterval)
            }
        }
    }

    func apply(_ event: HomeEvent) {
        switch event {
        case .snapshot(let s): snapshot = s
        case .device(let d):
            if snapshot == nil { snapshot = HomeSnapshot(home: "", devices: []) }
            snapshot?.upsert(d)
        case .error, .unknown: break
        }
    }
}
