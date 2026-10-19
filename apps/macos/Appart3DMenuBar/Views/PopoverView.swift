import AppKit
import SwiftUI

/// Contenu de la fenêtre du MenuBarExtra : interface web (widget) + pied de page natif.
struct PopoverView: View {
    let store: HomeStore
    let web: WidgetWebController
    @Environment(\.openSettings) private var openSettings

    static let size = CGSize(width: 380, height: 720)

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                WidgetWebView(controller: web)
                    .opacity(web.state == .loaded ? 1 : 0.001)
                overlay
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .padding([.horizontal, .top], 6)

            footer
        }
        .frame(width: Self.size.width, height: Self.size.height)
        .onAppear { web.ensureLoaded() }
        .onChange(of: store.isReachable) { _, reachable in
            // Le bridge revient : on recharge l'interface si elle était en erreur.
            if reachable, case .failed = web.state { web.reload() }
        }
    }

    @ViewBuilder private var overlay: some View {
        switch web.state {
        case .idle, .loading:
            VStack(spacing: 10) {
                ProgressView().controlSize(.small)
                Text("Chargement de l'appartement…").font(.callout).foregroundStyle(.secondary)
            }
        case .failed(let message):
            UnreachableView(message: message, retry: web.reload, openSettings: showSettings)
        case .loaded:
            EmptyView()
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            StatusDot(store: store)
            Spacer(minLength: 4)
            Button {
                if let url = AppSettings.webURL(widget: false) { NSWorkspace.shared.open(url) }
            } label: {
                Label("Ouvrir dans le navigateur", systemImage: "safari")
            }
            .help("Ouvrir Appart3D dans le navigateur")
            Button { web.reload() } label: { Image(systemName: "arrow.clockwise") }
                .help("Recharger")
            Button { showSettings() } label: { Image(systemName: "gearshape") }
                .help("Réglages…")
            Button { NSApp.terminate(nil) } label: { Image(systemName: "power") }
                .help("Quitter Appart3D")
        }
        .labelStyle(.titleAndIcon)
        .buttonStyle(.borderless)
        .font(.callout)
        .padding(.horizontal, 12)
        .frame(height: 34)
    }

    private func showSettings() {
        NSApp.activate()
        openSettings()
    }
}

private struct StatusDot: View {
    let store: HomeStore

    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(text).foregroundStyle(.secondary).lineLimit(1)
        }
        .font(.caption)
        .help(help)
    }

    private var color: Color {
        switch store.connection {
        case .live: .green
        case .polling: .yellow
        case .connecting: .gray
        case .unreachable: .red
        }
    }

    private var text: String {
        guard store.isReachable else { return "Hors ligne" }
        let n = store.lightsOn
        return n == 0 ? "Tout éteint" : "\(n) allumée\(n > 1 ? "s" : "")"
    }

    private var help: String {
        switch store.connection {
        case .live: "Connecté au bridge (temps réel)"
        case .polling: "Connecté au bridge (actualisation toutes les 5 s)"
        case .connecting: "Connexion au bridge…"
        case .unreachable(let message): "Bridge injoignable : \(message)"
        }
    }
}

private struct UnreachableView: View {
    let message: String
    let retry: () -> Void
    let openSettings: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "house.slash")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(.secondary)
            Text("Bridge injoignable").font(.headline)
            Text(message)
                .font(.caption).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Text(AppSettings.bridgeURL)
                .font(.caption.monospaced()).foregroundStyle(.tertiary)
            Text("Démarrez-le avec :\npnpm --filter @appart3d/home-bridge start")
                .font(.caption).multilineTextAlignment(.center)
                .textSelection(.enabled)
                .padding(.top, 4)
            HStack {
                Button("Réessayer", action: retry).keyboardShortcut(.defaultAction)
                Button("Réglages…", action: openSettings)
            }
            .padding(.top, 4)
        }
        .padding(24)
    }
}
