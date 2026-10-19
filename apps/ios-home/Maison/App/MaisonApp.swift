import SwiftUI

@main
struct MaisonApp: App {
    @State private var store = HomeStore()
    @State private var kiosk = KioskController()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        MaisonShortcuts.updateAppShortcutParameters()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(kiosk)
                .preferredColorScheme(.dark)
                .tint(Theme.amber)
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: store.start()
            case .background: store.stop()
            default: break
            }
        }
    }
}

struct RootView: View {
    @Environment(HomeStore.self) private var store
    @Environment(KioskController.self) private var kiosk
    @State private var showOnboarding = false

    private var needsOnboarding: Bool {
        if ProcessInfo.processInfo.arguments.contains("-onboarding") { return true }
        return !store.isMock && !store.isPaired
    }

    var body: some View {
        if ProcessInfo.processInfo.arguments.contains("-landscapePreview") {
            // Aperçu paysage pour les captures (le simulateur sans interface ne peut pas pivoter).
            GeometryReader { geo in
                content
                    .frame(width: geo.size.height, height: geo.size.width)
                    .rotationEffect(.degrees(90))
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
            }
            .ignoresSafeArea()
        } else {
            content
        }
    }

    private var content: some View {
        ZStack {
            if needsOnboarding {
                OnboardingView()
                    .transition(.opacity.combined(with: .scale(scale: 1.04)))
            } else {
                HomeView()
                    .transition(.opacity)
            }
        }
        .animation(.smooth(duration: 0.5), value: needsOnboarding)
        .background(TouchObserver { kiosk.touched() })
        .onChange(of: needsOnboarding, initial: true) { _, onboarding in kiosk.suspended = onboarding }
        .task {
            #if DEBUG
            // Tests d'intégration : `-pair <url> <code> [service]` appaire sans passer par l'interface.
            let args = ProcessInfo.processInfo.arguments
            if let i = args.firstIndex(of: "-pair"), i + 2 < args.count, let url = PairLink.baseURL(from: args[i + 1]) {
                do {
                    let r = try await BridgeClient.pair(baseURL: url, code: args[i + 2], deviceName: "Simulateur")
                    store.didPair(bridgeURL: url, response: r, serviceName: i + 3 < args.count ? args[i + 3] : nil)
                } catch {
                    store.showToast(HomeError.wrap(error).localizedDescription)
                }
            }
            #endif
        }
        .onAppear {
            // Captures d'écran iPad : `-landscape` force l'orientation paysage.
            guard ProcessInfo.processInfo.arguments.contains("-landscape"),
                  let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight)) { _ in }
        }
    }
}
