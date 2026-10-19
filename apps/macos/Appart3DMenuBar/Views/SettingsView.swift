import ServiceManagement
import SwiftUI

struct SettingsView: View {
    let store: HomeStore
    let web: WidgetWebController

    @AppStorage(AppSettings.bridgeURLKey) private var bridgeURL = AppSettings.defaultBridgeURL
    @AppStorage(AppSettings.scenePathKey) private var scenePath = AppSettings.defaultScenePath

    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled
    @State private var loginItemMessage: String?
    @State private var testResult: TestResult?
    @State private var testing = false
    @State private var applyTask: Task<Void, Never>?

    enum TestResult {
        case success(String)
        case failure(String)
    }

    var body: some View {
        Form {
            Section("Home bridge") {
                TextField("Adresse du bridge", text: $bridgeURL, prompt: Text(AppSettings.defaultBridgeURL))
                    .textContentType(.URL)
                TextField("Scène", text: $scenePath, prompt: Text(AppSettings.defaultScenePath))
                HStack {
                    Button("Tester la connexion") { Task { await testConnection() } }
                        .disabled(testing)
                    if testing { ProgressView().controlSize(.small) }
                    Spacer()
                    Button("Valeurs par défaut") {
                        bridgeURL = AppSettings.defaultBridgeURL
                        scenePath = AppSettings.defaultScenePath
                    }
                }
                if let testResult {
                    switch testResult {
                    case .success(let text):
                        Label(text, systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    case .failure(let text):
                        Label(text, systemImage: "xmark.octagon.fill").foregroundStyle(.red)
                    }
                }
            }

            Section("Système") {
                Toggle("Lancer au démarrage", isOn: Binding(
                    get: { launchAtLogin },
                    set: { setLaunchAtLogin($0) }
                ))
                if let loginItemMessage {
                    HStack {
                        Text(loginItemMessage).font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Button("Ouvrir Ouverture…") { SMAppService.openSystemSettingsLoginItems() }
                            .controlSize(.small)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .fixedSize(horizontal: false, vertical: true)
        .onChange(of: bridgeURL) { scheduleApply() }
        .onChange(of: scenePath) { scheduleApply() }
        .onAppear { refreshLoginItemState() }
    }

    /// Applique les réglages après une courte pause de frappe.
    private func scheduleApply() {
        testResult = nil
        applyTask?.cancel()
        applyTask = Task {
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled else { return }
            store.restart()
            web.reload()
        }
    }

    private func testConnection() async {
        testing = true
        defer { testing = false }
        do {
            let snapshot = try await BridgeClient(bridgeURL: bridgeURL).fetchSnapshot(timeout: 5)
            let n = snapshot.devices.count
            let home = snapshot.home.isEmpty ? "Maison" : snapshot.home
            testResult = .success("\(home) — \(n) appareil\(n > 1 ? "s" : ""), \(snapshot.lightsOnCount) allumé\(snapshot.lightsOnCount > 1 ? "s" : "")")
        } catch {
            testResult = .failure(error.localizedDescription)
        }
    }

    private func setLaunchAtLogin(_ enabled: Bool) {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            loginItemMessage = error.localizedDescription
        }
        refreshLoginItemState()
    }

    private func refreshLoginItemState() {
        let status = SMAppService.mainApp.status
        launchAtLogin = status == .enabled
        if status == .requiresApproval {
            loginItemMessage = "À autoriser dans Réglages Système › Général › Ouverture."
        } else if status == .enabled || status == .notRegistered {
            loginItemMessage = nil
        }
    }
}
