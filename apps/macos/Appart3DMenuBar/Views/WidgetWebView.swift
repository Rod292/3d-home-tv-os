import AppKit
import SwiftUI
import WebKit

/// Possède l'unique WKWebView de l'app : créée une fois, gardée en vie entre les ouvertures du popover
/// (pas de rechargement à chaque clic sur l'icône).
@MainActor
@Observable
final class WidgetWebController: NSObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    private(set) var state: LoadState = .idle
    @ObservationIgnored let webView: WKWebView
    @ObservationIgnored private var loadedURL: URL?

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // garde cookies / localStorage (appairage, préférences)
        config.preferences.isElementFullscreenEnabled = false
        config.mediaTypesRequiringUserActionForPlayback = .all
        // WebGL est actif par défaut dans WKWebView.
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 380, height: 680), configuration: config)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsMagnification = false
        // Fond transparent : le matériau du popover apparaît pendant le chargement.
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        #if DEBUG
        webView.isInspectable = true
        #endif
    }

    var desiredURL: URL? { AppSettings.webURL(widget: true) }

    /// Charge l'interface si elle n'est pas déjà affichée (ou si l'URL a changé / le dernier chargement a échoué).
    func ensureLoaded() {
        guard let url = desiredURL else {
            state = .failed("Adresse du bridge invalide — voir Réglages.")
            return
        }
        switch state {
        case .loaded, .loading:
            if url == loadedURL { return }
        case .idle, .failed:
            break
        }
        load(url)
    }

    func reload() {
        if let url = desiredURL { load(url) }
    }

    private func load(_ url: URL) {
        loadedURL = url
        state = .loading
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 15))
    }

    private func isInternal(_ url: URL) -> Bool {
        guard let base = AppSettings.baseURL(from: AppSettings.bridgeURL) else { return false }
        return url.host() == base.host() && url.port == base.port
    }
}

extension WidgetWebController: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        state = .loaded
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fail(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fail(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        state = .idle
        ensureLoaded()
    }

    private func fail(_ error: Error) {
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        state = .failed(error.localizedDescription)
    }

    /// Les liens externes s'ouvrent dans le navigateur par défaut.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .allow }
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "about" || scheme == "blob" || scheme == "data" { return .allow }
        if navigationAction.targetFrame?.isMainFrame == false || isInternal(url) { return .allow }
        NSWorkspace.shared.open(url)
        return .cancel
    }

    /// target="_blank" / window.open → navigateur.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }
}

/// Insère la WKWebView partagée dans la hiérarchie SwiftUI.
struct WidgetWebView: NSViewRepresentable {
    let controller: WidgetWebController

    func makeNSView(context: Context) -> NSView {
        let container = NSView()
        attach(to: container)
        return container
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        if controller.webView.superview !== nsView { attach(to: nsView) }
    }

    private func attach(to container: NSView) {
        let webView = controller.webView
        webView.removeFromSuperview()
        webView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
    }
}
