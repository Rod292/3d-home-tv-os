import SwiftUI
import WebKit

/// Maquette 3D animée servie par le pont, dans une WKWebView transparente et sans défilement.
struct ApartmentWebView: UIViewRepresentable {
    var url: URL
    var token: String?
    var controller: EmbedController

    func makeCoordinator() -> Coordinator { Coordinator(controller: controller) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = .all
        config.userContentController.add(WeakScriptHandler(context.coordinator), name: "appart3d")
        // Garantit un fond transparent même avant le chargement des styles de la page.
        let css = "html,body{background:transparent!important;overscroll-behavior:none;}"
        let script = WKUserScript(
            source: "var s=document.createElement('style');s.textContent='\(css)';document.documentElement.appendChild(s);",
            injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        config.userContentController.addUserScript(script)

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.navigationDelegate = context.coordinator
        web.allowsLinkPreview = false
        web.underPageBackgroundColor = .clear
        controller.webView = web
        controller.load(url: url, token: token, in: web)
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        controller.webView = web
        controller.load(url: url, token: token, in: web)
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "appart3d")
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let controller: EmbedController
        init(controller: EmbedController) { self.controller = controller }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let event = EmbedEvent.from(messageBody: message.body) else { return }
            controller.handle(event)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            controller.didFail()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            controller.didFail()
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async -> WKNavigationResponsePolicy {
            if let http = navigationResponse.response as? HTTPURLResponse, http.statusCode >= 400 {
                controller.didFail()
                return .cancel
            }
            return .allow
        }
    }
}

/// Évite le cycle de rétention WKUserContentController → handler.
@MainActor
final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: (any WKScriptMessageHandler)?
    init(_ target: any WKScriptMessageHandler) { self.target = target }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
