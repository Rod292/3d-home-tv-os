import SwiftUI

struct SettingsView: View {
    @Environment(HomeStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(KioskController.self) private var kiosk
    @AppStorage("maison.night3D", store: SharedStore.defaults) private var night3D = "auto"
    @AppStorage("maison.webDemo", store: SharedStore.defaults) private var webDemo = false
    @State private var bridgeText = SharedStore.bridgeURL?.absoluteString ?? ""
    @State private var confirmForget = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Maison", value: store.homeName)
                    LabeledContent("État") {
                        HStack(spacing: 6) {
                            Circle().fill(statusColor).frame(width: 8, height: 8)
                            Text(statusText)
                        }
                    }
                    TextField("http://192.168.1.20:8787", text: $bridgeText)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit(saveBridge)
                        .disabled(store.isMock)
                    Button("Associer à nouveau", systemImage: "link.badge.plus") { confirmForget = true }
                } header: {
                    Text("Pont domotique")
                } footer: {
                    Text("Adresse du Mac sur le Wi-Fi de la maison. Le jeton d'accès est conservé dans le trousseau.")
                }

                Section {
                    Toggle("Mode démo", systemImage: "theatermasks.fill", isOn: Binding(
                        get: { SharedStore.mockModeSetting || SharedStore.launchedWithMock },
                        set: { store.enableDemo($0) }))
                    if store.isMock {
                        Toggle("Maquette web publique", systemImage: "globe", isOn: $webDemo)
                        Button("Réinitialiser la maison simulée", systemImage: "arrow.counterclockwise") {
                            Task {
                                await MockHomeHub.shared.reset()
                                await store.refresh()
                            }
                        }
                    }
                } header: {
                    Text("Démo")
                } footer: {
                    Text("Appareils simulés en mémoire : rien n'est piloté pour de vrai.")
                }

                Section {
                    Toggle("Mode écran mural", systemImage: "rectangle.inset.filled.on.rectangle", isOn: Binding(
                        get: { kiosk.enabled }, set: { kiosk.enabled = $0 }))
                } header: {
                    Text("Écran mural")
                } footer: {
                    Text("L'écran ne se met jamais en veille ; après 45 s sans toucher, un économiseur affiche l'heure et la maquette (luminosité réduite la nuit). Un toucher revient aux commandes. Astuce : Accès guidé (triple-clic) pour verrouiller l'iPad sur Maison.")
                }

                Section {
                    Picker("Ambiance", systemImage: "sun.horizon.fill", selection: $night3D) {
                        Text("Auto (soleil)").tag("auto")
                        Text("Jour").tag("day")
                        Text("Nuit").tag("night")
                    }
                } header: {
                    Text("Ambiance 3D")
                } footer: {
                    Text(daylightFooter)
                }

                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        guideStep(1, "Réglages › Bouton Action")
                        guideStep(2, "Faites défiler jusqu'à « Raccourci »")
                        guideStep(3, "Choisir un raccourci › Maison › « Basculer les lumières »")
                    }
                    .padding(.vertical, 4)
                } header: {
                    Text("Bouton Action")
                } footer: {
                    Text("Ou ajoutez le contrôle « Lumières » au Centre de contrôle, à l'écran verrouillé ou au bouton Action (Réglages › Bouton Action › Commandes).")
                }

                Section("À propos") {
                    LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
                    LabeledContent("Projet", value: "Appart3D")
                }
            }
            .scrollContentBackground(.hidden)
            .background(LinearGradient(colors: Theme.backgroundColors(warmth: 0, day: ambiance.day, dusk: ambiance.dusk),
                                       startPoint: .top, endPoint: .bottom).ignoresSafeArea())
            .navigationTitle("Réglages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("OK") { saveBridge(); dismiss() } }
            }
            .confirmationDialog("Associer à nouveau ?", isPresented: $confirmForget, titleVisibility: .visible) {
                Button("Oublier ce pont", role: .destructive) {
                    store.forgetPairing()
                    dismiss()
                }
            } message: {
                Text("Le jeton actuel sera effacé ; il faudra saisir le code d'appairage.")
            }
        }
        .preferredColorScheme(.dark)
    }

    private func guideStep(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text("\(n)")
                .font(.system(.caption, design: .rounded).weight(.bold))
                .foregroundStyle(.black)
                .frame(width: 22, height: 22)
                .background(Circle().fill(Theme.amber))
            Text(text).font(.system(.subheadline, design: .rounded))
        }
    }

    private func saveBridge() {
        guard !store.isMock, let url = PairLink.baseURL(from: bridgeText), url != SharedStore.bridgeURL else { return }
        SharedStore.bridgeURL = url
        store.reconfigure()
    }

    private var ambiance: (day: Double, dusk: Double) { Daylight.ambiance(mode: Daylight.mode(night3D), sun: store.sun) }

    private var daylightFooter: String {
        guard Daylight.mode(night3D) == .auto else { return "La maquette garde cette ambiance quelle que soit l'heure." }
        guard let sun = store.sun else { return "La maquette suit le jour et la nuit (heure locale, en attendant le soleil du pont)." }
        let deg = Int(sun.elevation.rounded())
        return "La maquette suit le soleil en direct : \(sun.isDay ? "jour" : "nuit"), soleil à \(deg)° \(deg >= 0 ? "au-dessus" : "sous") de l'horizon."
    }

    private var statusText: String {
        switch store.connection {
        case .live: store.isMock ? "Démo" : "Connecté"
        case .connecting: "Connexion…"
        case .offline: "Injoignable"
        case .idle: "Non associé"
        }
    }

    private var statusColor: Color {
        switch store.connection {
        case .live: .green
        case .offline: .orange
        default: .gray
        }
    }
}
