import Foundation

/// Erreurs présentées à l'utilisateur (français).
enum HomeError: LocalizedError, Equatable, Sendable {
    case notPaired
    case invalidURL
    case unauthorized
    case offline
    case http(Int, String?)
    case badCode
    case tooManyAttempts
    case decoding

    var errorDescription: String? {
        switch self {
        case .notPaired: "Maison n'est pas encore associée à votre pont. Ouvrez l'app pour l'appairer."
        case .invalidURL: "Adresse du pont invalide."
        case .unauthorized: "Accès refusé par le pont : associez à nouveau l'iPhone."
        case .offline: "Maison injoignable. Êtes-vous sur le Wi-Fi de la maison ?"
        case .http(let code, let message): message.map { "Le pont a répondu : \($0)" } ?? "Le pont a répondu HTTP \(code)."
        case .badCode: "Code incorrect. Vérifiez les 6 chiffres affichés sur le Mac."
        case .tooManyAttempts: "Trop d'essais. Patientez une minute avant de réessayer."
        case .decoding: "Réponse inattendue du pont."
        }
    }

    /// Message court pour un dialogue Siri / Raccourcis.
    var shortMessage: String {
        switch self {
        case .offline: "Maison injoignable — pas sur le Wi-Fi de la maison ?"
        case .notPaired: "Ouvrez Maison pour l'associer à votre pont."
        default: errorDescription ?? "Erreur"
        }
    }

    static func wrap(_ error: Error) -> HomeError {
        if let e = error as? HomeError { return e }
        if error is URLError { return .offline }
        if error is DecodingError { return .decoding }
        return .offline
    }
}

/// Accès à la maison (bridge réel ou simulation).
protocol HomeClient: Sendable {
    func snapshot() async throws -> HomeSnapshot
    func perform(_ action: DeviceAction, on deviceId: String) async throws -> Device
    func activateScene(_ sceneId: String) async throws -> HomeSnapshot
    /// Ordre partagé des tuiles (tous les identifiants) ; renvoie la maison dans ce nouvel ordre.
    func setOrder(_ ids: [String]) async throws -> HomeSnapshot
    /// Flux d'événements (se termine à la fermeture de la connexion ; lève une erreur en cas d'échec).
    func events() -> AsyncThrowingStream<HomeEvent, Error>
}

extension HomeClient {
    /// Client sans ordre partagé (faux clients de test, pont trop ancien).
    func setOrder(_ ids: [String]) async throws -> HomeSnapshot { throw HomeError.http(404, "ordre non pris en charge") }
}

enum HomeEnvironment {
    /// Client à utiliser selon les réglages partagés (nil = pas appairé).
    static func makeClient(timeout: TimeInterval = 6) -> HomeClient? {
        if SharedStore.isMock { return MockHomeClient() }
        guard let url = SharedStore.bridgeURL, let token = TokenStore.token else { return nil }
        // Intents / widgets (délai court) : découverte courte pour rester sous ~8 s au total.
        return ResilientBridgeClient(base: BridgeClient(baseURL: url, token: token, timeout: timeout),
                                     rediscoveryTimeout: timeout < 5 ? 2.5 : 4)
    }
}

/// Client du pont qui, si le pont ne répond plus, le retrouve par Bonjour (nouvelle IP après un
/// redémarrage de la box), mémorise la nouvelle adresse et réessaie une fois.
struct ResilientBridgeClient: HomeClient {
    var base: BridgeClient
    var rediscoveryTimeout: TimeInterval = 3

    /// Client pointé sur l'adresse mémorisée la plus récente (elle a pu changer depuis la création).
    private var current: BridgeClient {
        var c = base
        if let url = SharedStore.bridgeURL { c.baseURL = url }
        return c
    }

    private func withRetry<T: Sendable>(_ body: @Sendable (BridgeClient) async throws -> T) async throws -> T {
        do {
            return try await body(current)
        } catch HomeError.offline {
            guard let moved = await relocate() else { throw HomeError.offline }
            return try await body(moved)
        }
    }

    /// Nouvelle adresse du pont si elle a changé (enregistrée pour l'app, les widgets et les intents).
    func relocate() async -> BridgeClient? {
        let now = current
        guard let found = await BridgeResolver.rediscover(timeout: rediscoveryTimeout), found.url != now.baseURL else { return nil }
        var moved = now
        moved.baseURL = found.url
        // On n'adopte la nouvelle adresse que si ce pont accepte notre jeton (pas un autre pont du réseau).
        guard (try? await moved.snapshot()) != nil else { return nil }
        SharedStore.bridgeURL = found.url
        if SharedStore.bridgeServiceName == nil { SharedStore.bridgeServiceName = found.serviceName }
        NotificationCenter.default.post(name: .maisonBridgeMoved, object: nil)
        return moved
    }

    func snapshot() async throws -> HomeSnapshot {
        try await withRetry { try await $0.snapshot() }
    }

    func perform(_ action: DeviceAction, on deviceId: String) async throws -> Device {
        try await withRetry { try await $0.perform(action, on: deviceId) }
    }

    func activateScene(_ sceneId: String) async throws -> HomeSnapshot {
        try await withRetry { try await $0.activateScene(sceneId) }
    }

    func setOrder(_ ids: [String]) async throws -> HomeSnapshot {
        try await withRetry { try await $0.setOrder(ids) }
    }

    func events() -> AsyncThrowingStream<HomeEvent, Error> {
        // Le flux suit l'adresse courante ; HomeStore relance la découverte en cas d'échec.
        current.events()
    }
}

extension Notification.Name {
    static let maisonBridgeMoved = Notification.Name("maisonBridgeMoved")
}

/// Client HTTP du home bridge (`Authorization: Bearer <token>`).
struct BridgeClient: HomeClient {
    var baseURL: URL
    var token: String?
    var timeout: TimeInterval = 6

    static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = false
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForResource = 60 * 60 * 24
        return URLSession(configuration: config)
    }()

    func url(_ path: String) throws -> URL {
        var base = baseURL.absoluteString
        while base.hasSuffix("/") { base.removeLast() }
        guard let url = URL(string: base + path) else { throw HomeError.invalidURL }
        return url
    }

    private func request(_ path: String, method: String = "GET", body: Data? = nil, timeout: TimeInterval? = nil) throws -> URLRequest {
        var r = URLRequest(url: try url(path), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout ?? self.timeout)
        r.httpMethod = method
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            r.httpBody = body
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return r
    }

    private func send<T: Decodable>(_ r: URLRequest, as: T.Type) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await Self.session.data(for: r)
        } catch {
            throw HomeError.wrap(error)
        }
        try Self.check(response, data: data)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw HomeError.decoding
        }
    }

    static func check(_ response: URLResponse, data: Data?) throws {
        guard let http = response as? HTTPURLResponse else { return }
        switch http.statusCode {
        case 200..<300: return
        case 401, 403: throw HomeError.unauthorized
        case 429: throw HomeError.tooManyAttempts
        default:
            let message = data.flatMap { try? JSONDecoder().decode([String: String].self, from: $0)["error"] }
            throw HomeError.http(http.statusCode, message)
        }
    }

    func snapshot() async throws -> HomeSnapshot {
        try await send(try request(HomeAPI.snapshot), as: HomeSnapshot.self)
    }

    func perform(_ action: DeviceAction, on deviceId: String) async throws -> Device {
        let body = try JSONEncoder().encode(action)
        return try await send(try request(HomeAPI.action(deviceId), method: "POST", body: body), as: Device.self)
    }

    func activateScene(_ sceneId: String) async throws -> HomeSnapshot {
        // Une scène pilote plusieurs appareils : délai plus long.
        try await send(try request(HomeAPI.scene(sceneId), method: "POST", body: Data("{}".utf8), timeout: max(timeout, 10)),
                       as: HomeSnapshot.self)
    }

    func setOrder(_ ids: [String]) async throws -> HomeSnapshot {
        let body = try JSONEncoder().encode(["order": ids])
        return try await send(try request(HomeAPI.order, method: "PUT", body: body), as: HomeSnapshot.self)
    }

    /// Échange le code à 6 chiffres contre le jeton (POST /api/pair, sans authentification).
    static func pair(baseURL: URL, code: String, deviceName: String?) async throws -> PairResponse {
        let client = BridgeClient(baseURL: baseURL, token: nil, timeout: 8)
        let body = try JSONEncoder().encode(PairRequest(code: code, deviceName: deviceName))
        var r = try client.request(HomeAPI.pair, method: "POST", body: body)
        r.timeoutInterval = 8
        do {
            return try await client.send(r, as: PairResponse.self)
        } catch HomeError.unauthorized {
            throw HomeError.badCode
        }
    }

    func events() -> AsyncThrowingStream<HomeEvent, Error> {
        let request: URLRequest
        do {
            var r = try self.request(HomeAPI.events, timeout: 120)
            r.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            request = r
        } catch {
            return AsyncThrowingStream { $0.finish(throwing: error) }
        }
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let (bytes, response) = try await Self.session.bytes(for: request)
                    try Self.check(response, data: nil)
                    // `bytes.lines` ignore les lignes vides (séparateurs SSE) : découpage manuel.
                    var parser = SSEParser()
                    var buffer: [UInt8] = []
                    buffer.reserveCapacity(4096)
                    for try await byte in bytes {
                        if byte == UInt8(ascii: "\n") {
                            let line = String(decoding: buffer, as: UTF8.self)
                            buffer.removeAll(keepingCapacity: true)
                            if let payload = parser.feed(line: line),
                               let event = try? JSONDecoder().decode(HomeEvent.self, from: Data(payload.utf8)) {
                                continuation.yield(event)
                            }
                        } else {
                            buffer.append(byte)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: HomeError.wrap(error))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
