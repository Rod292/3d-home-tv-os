import Foundation

/// Réglages persistés (UserDefaults / @AppStorage).
enum AppSettings {
    static let bridgeURLKey = "bridgeURL"
    static let scenePathKey = "scenePath"

    static let defaultBridgeURL = "http://localhost:8787"
    static let defaultScenePath = "/shared/demo-apartment.json"

    static var bridgeURL: String {
        UserDefaults.standard.string(forKey: bridgeURLKey).flatMap { $0.isEmpty ? nil : $0 } ?? defaultBridgeURL
    }

    static var scenePath: String {
        UserDefaults.standard.string(forKey: scenePathKey) ?? defaultScenePath
    }

    /// URL de base normalisée (sans « / » final ; « http:// » ajouté si absent).
    static func baseURL(from string: String) -> URL? {
        var s = string.trimmingCharacters(in: .whitespacesAndNewlines)
        while s.hasSuffix("/") { s.removeLast() }
        if s.isEmpty { return nil }
        if !s.contains("://") { s = "http://" + s }
        guard let url = URL(string: s), url.host() != nil else { return nil }
        return url
    }

    static func apiURL(_ path: String, bridge: String = bridgeURL) -> URL? {
        guard let base = baseURL(from: bridge) else { return nil }
        return URL(string: base.absoluteString + path)
    }

    /// URL de l'interface web : `<bridge>/?widget=1&scene=<scenePath>` (widget = mise en page compacte).
    static func webURL(widget: Bool, bridge: String = bridgeURL, scene: String = scenePath) -> URL? {
        guard let base = baseURL(from: bridge),
              var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return nil }
        components.path = "/"
        var items: [URLQueryItem] = []
        if widget { items.append(URLQueryItem(name: "widget", value: "1")) }
        let trimmedScene = scene.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedScene.isEmpty { items.append(URLQueryItem(name: "scene", value: trimmedScene)) }
        components.queryItems = items.isEmpty ? nil : items
        return components.url
    }
}
