import Foundation

enum BridgeError: LocalizedError {
    case invalidURL
    case http(Int)

    var errorDescription: String? {
        switch self {
        case .invalidURL: "Adresse du bridge invalide."
        case .http(let code): "Le bridge a répondu HTTP \(code)."
        }
    }
}

/// Client HTTP du home bridge (localhost : pas d'authentification).
struct BridgeClient: Sendable {
    var bridgeURL: String

    static let decoder = JSONDecoder()

    func fetchSnapshot(timeout: TimeInterval = 4) async throws -> HomeSnapshot {
        guard let url = AppSettings.apiURL(HomeAPI.snapshot, bridge: bridgeURL) else { throw BridgeError.invalidURL }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw BridgeError.http(http.statusCode)
        }
        return try Self.decoder.decode(HomeSnapshot.self, from: data)
    }

    /// Ouvre le flux SSE et transmet chaque événement décodé. Se termine quand le flux se ferme.
    func streamEvents(onOpen: @MainActor () -> Void, onEvent: @MainActor (HomeEvent) -> Void) async throws {
        guard let url = AppSettings.apiURL(HomeAPI.events, bridge: bridgeURL) else { throw BridgeError.invalidURL }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 90)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw BridgeError.http(http.statusCode)
        }
        await onOpen()
        // `bytes.lines` ignore les lignes vides (séparateurs d'événements SSE) : découpage manuel.
        var parser = SSEParser()
        var buffer: [UInt8] = []
        for try await byte in bytes {
            if byte == UInt8(ascii: "\n") {
                let line = String(decoding: buffer, as: UTF8.self)
                buffer.removeAll(keepingCapacity: true)
                if let payload = parser.feed(line: line),
                   let event = try? Self.decoder.decode(HomeEvent.self, from: Data(payload.utf8)) {
                    await onEvent(event)
                }
            } else {
                buffer.append(byte)
            }
        }
    }
}
