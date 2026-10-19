import Foundation
import Observation
import WebKit

/// Pont natif ↔ maquette 3D web (`window.appart3dEmbed` / `messageHandlers.appart3d`).
@MainActor
@Observable
final class EmbedController {
    private(set) var isReady = false
    private(set) var failed = false
    /// Appareils touchés dans la maquette (l'app ouvre la fiche correspondante).
    var onItemTapped: ((_ itemId: String, _ deviceIds: [String]) -> Void)?

    @ObservationIgnored weak var webView: WKWebView?
    @ObservationIgnored private var queue: [EmbedCommand] = []
    @ObservationIgnored private var loadedURL: URL?
    /// Web view that received `loadedURL`: SwiftUI recreates the web view when the layout changes
    /// (iPad rotation, kiosk), and a fresh one must load the page again.
    @ObservationIgnored private weak var loadedIn: WKWebView?

    func send(_ command: EmbedCommand) {
        guard isReady, let webView else {
            // On ne garde que la dernière commande de chaque type.
            queue.removeAll { Self.sameKind($0, command) }
            queue.append(command)
            return
        }
        let js = "window.appart3dEmbed && window.appart3dEmbed.post(\(command.json));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func handle(_ event: EmbedEvent) {
        switch event {
        case .ready:
            isReady = true
            failed = false
            let pending = queue
            queue.removeAll()
            pending.forEach(send)
        case .itemTapped(let itemId, let deviceIds):
            onItemTapped?(itemId, deviceIds)
        case .error:
            break
        case .unknown:
            break
        }
    }

    func didFail() {
        failed = true
        isReady = false
    }

    func didStartLoading() {
        isReady = false
        failed = false
    }

    /// Charge la maquette après avoir posé le cookie d'authentification pour l'hôte du pont.
    func load(url: URL, token: String?, in webView: WKWebView) {
        guard loadedURL != url || loadedIn !== webView else { return }
        loadedURL = url
        loadedIn = webView
        didStartLoading()
        let request = URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 15)
        guard let token, let host = url.host() else {
            webView.load(request)
            return
        }
        var props: [HTTPCookiePropertyKey: Any] = [
            .name: HomeAPI.cookieName,
            .value: token,
            .domain: host,
            .path: "/",
            .expires: Date().addingTimeInterval(60 * 60 * 24 * 365),
        ]
        props[HTTPCookiePropertyKey("SameSite")] = "Lax"
        guard let cookie = HTTPCookie(properties: props) else {
            webView.load(request)
            return
        }
        webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) { [weak webView] in
            webView?.load(request)
        }
    }

    func reload() {
        loadedURL = nil
    }

    private static func sameKind(_ a: EmbedCommand, _ b: EmbedCommand) -> Bool {
        switch (a, b) {
        case (.focusItem, .focusItem), (.highlightDevice, .highlightDevice), (.setNight, .setNight),
             (.overview, .overview), (.autoRotate, .autoRotate), (.setDaylight, .setDaylight), (.frame, .frame): true
        case (.setNight, .setDaylight), (.setDaylight, .setNight): true
        case (.overview, .focusItem), (.focusItem, .overview), (.frame, .focusItem), (.focusItem, .frame),
             (.frame, .overview), (.overview, .frame): true
        default: false
        }
    }

    /// URL de la maquette : `<bridge>/?view=3d&scene=…&daylight=…&frame=…` (ou la démo publique).
    nonisolated static func sceneURL(bridge: URL?, demo: Bool, daylight: DaylightMode = .auto, frame: FrameTarget = .living) -> URL? {
        let base: URL
        if demo {
            base = HomeAPI.publicDemoURL
        } else {
            guard let bridge, var comps = URLComponents(url: bridge, resolvingAgainstBaseURL: false) else { return nil }
            comps.path = "/"
            comps.queryItems = [URLQueryItem(name: "view", value: "3d"), URLQueryItem(name: "scene", value: HomeAPI.defaultScenePath)]
            guard let u = comps.url else { return nil }
            base = u
        }
        guard var c = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return base }
        var items = (c.queryItems ?? []).filter { !["daylight", "frame", "night"].contains($0.name) }
        items.append(URLQueryItem(name: "daylight", value: daylight.rawValue))
        items.append(URLQueryItem(name: "frame", value: frame.rawValue))
        c.queryItems = items
        return c.url ?? base
    }
}
