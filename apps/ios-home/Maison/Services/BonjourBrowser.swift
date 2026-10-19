import Foundation
import Network
import Observation

/// Découverte du pont sur le Wi-Fi (Bonjour `_appart3d._tcp`, TXT home=<nom>).
@MainActor
@Observable
final class BonjourBrowser {
    struct Found: Identifiable, Hashable {
        var id: String { name }
        var name: String
        var home: String?
        var endpoint: NWEndpoint
        /// Ponts de test/simulation (« … (simulation) ») : affichés à part.
        var isSimulation: Bool { BridgeResolver.isTestService(name) }
        var title: String { home ?? name }
    }

    private(set) var results: [Found] = []
    private(set) var state: String = "idle"
    private(set) var denied = false
    @ObservationIgnored private var browser: NWBrowser?

    var primary: [Found] { results.filter { !$0.isSimulation } }
    var simulations: [Found] { results.filter(\.isSimulation) }

    func start() {
        stop()
        let params = NWParameters.tcp
        params.includePeerToPeer = false
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: HomeAPI.bonjourService, domain: nil), using: params)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            let found: [Found] = results.compactMap { r in
                guard case let .service(name, _, _, _) = r.endpoint else { return nil }
                var home: String?
                if case let .bonjour(txt) = r.metadata { home = txt["home"] }
                return Found(name: name, home: home, endpoint: r.endpoint)
            }
            Task { @MainActor in self?.results = found.sorted { $0.name < $1.name } }
        }
        browser.stateUpdateHandler = { [weak self] state in
            Task { @MainActor in
                switch state {
                case .ready: self?.state = "ready"
                case .waiting(let error), .failed(let error):
                    self?.state = "failed"
                    if case .dns(let code) = error, code == -65570 { self?.denied = true } // kDNSServiceErr_PolicyDenied
                default: break
                }
            }
        }
        browser.start(queue: .main)
        self.browser = browser
        state = "searching"
    }

    func stop() {
        browser?.cancel()
        browser = nil
    }

    /// Résout un service en URL http://<ipv4>:<port>.
    nonisolated static func resolve(_ endpoint: NWEndpoint) async throws -> URL {
        try await BridgeResolver.resolve(endpoint)
    }
}
