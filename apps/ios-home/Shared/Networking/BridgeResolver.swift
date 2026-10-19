import Foundation
import Network

/// Retrouve le pont sur le Wi-Fi par Bonjour quand son adresse a changé (box redémarrée, nouvelle IP).
/// Utilisé par l'app, les intents et les widgets.
enum BridgeResolver {
    /// Nom de service à ignorer (ponts de test / simulation).
    static func isTestService(_ name: String) -> Bool {
        let n = name.lowercased()
        return n.contains("simulation") || n.contains("test")
    }

    /// Cherche le pont (service mémorisé en priorité) et renvoie sa nouvelle URL, en `timeout` secondes au plus.
    static func rediscover(timeout: TimeInterval = 3) async -> (url: URL, serviceName: String?)? {
        let preferred = SharedStore.bridgeServiceName
        let deadline = Date().addingTimeInterval(timeout)
        guard let endpoint = await browse(preferred: preferred, timeout: timeout * 0.6) else { return nil }
        let remaining = max(0.5, deadline.timeIntervalSinceNow)
        guard let url = try? await resolve(endpoint, timeout: remaining) else { return nil }
        var name: String?
        if case let .service(n, _, _, _) = endpoint { name = n }
        return (url, name)
    }

    /// Parcourt `_appart3d._tcp` et renvoie le meilleur service trouvé avant l'échéance.
    static func browse(preferred: String?, timeout: TimeInterval) async -> NWEndpoint? {
        let params = NWParameters.tcp
        params.includePeerToPeer = false
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: HomeAPI.bonjourService, domain: nil), using: params)
        let once = ResumeOnce()
        let queue = DispatchQueue(label: "maison.bonjour")
        return await withCheckedContinuation { (cont: CheckedContinuation<NWEndpoint?, Never>) in
            let best = BestResult()
            browser.browseResultsChangedHandler = { results, _ in
                for r in results {
                    guard case let .service(name, _, _, _) = r.endpoint, !isTestService(name) else { continue }
                    if name == preferred {
                        if once.claim() { cont.resume(returning: r.endpoint); browser.cancel() }
                        return
                    }
                    best.set(r.endpoint)
                }
                // Pas de service mémorisé : le premier pont réel suffit.
                if preferred == nil, let e = best.get(), once.claim() {
                    cont.resume(returning: e)
                    browser.cancel()
                }
            }
            browser.stateUpdateHandler = { state in
                if case .failed = state, once.claim() { cont.resume(returning: nil) }
            }
            browser.start(queue: queue)
            queue.asyncAfter(deadline: .now() + timeout) {
                if once.claim() { cont.resume(returning: best.get()) }
                browser.cancel()
            }
        }
    }

    /// Résout un service en URL http://<ipv4>:<port>.
    static func resolve(_ endpoint: NWEndpoint, timeout: TimeInterval = 6) async throws -> URL {
        let params = NWParameters.tcp
        if let ip = params.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
            ip.version = .v4
        }
        let connection = NWConnection(to: endpoint, using: params)
        let once = ResumeOnce()
        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    if case let .hostPort(host, port)? = connection.currentPath?.remoteEndpoint {
                        var h: String
                        switch host {
                        case .ipv4(let a): h = "\(a)"
                        case .ipv6(let a): h = "[\(a)]"
                        case .name(let n, _): h = n
                        @unknown default: h = "\(host)"
                        }
                        if let pct = h.firstIndex(of: "%") { h = String(h[..<pct]) + (h.hasPrefix("[") ? "]" : "") }
                        if once.claim(), let url = URL(string: "http://\(h):\(port.rawValue)") {
                            cont.resume(returning: url)
                        }
                    } else if once.claim() {
                        cont.resume(throwing: HomeError.offline)
                    }
                    connection.cancel()
                case .failed, .cancelled:
                    if once.claim() { cont.resume(throwing: HomeError.offline) }
                case .waiting:
                    if once.claim() { cont.resume(throwing: HomeError.offline) }
                    connection.cancel()
                default: break
                }
            }
            connection.start(queue: .global())
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
                if once.claim() { cont.resume(throwing: HomeError.offline) }
                connection.cancel()
            }
        }
    }
}

final class BestResult: @unchecked Sendable {
    private let lock = NSLock()
    private var value: NWEndpoint?
    func set(_ e: NWEndpoint) { lock.lock(); if value == nil { value = e }; lock.unlock() }
    func get() -> NWEndpoint? { lock.lock(); defer { lock.unlock() }; return value }
}


final class ResumeOnce: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false
    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if done { return false }
        done = true
        return true
    }
}
