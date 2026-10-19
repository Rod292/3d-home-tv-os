import SwiftUI
import UIKit
import VisionKit

struct OnboardingView: View {
    enum Step: Hashable {
        case welcome
        case discover
        case code(URL)
        case success(String)
    }

    @Environment(HomeStore.self) private var store
    @State private var step: Step = .welcome
    @State private var browser = BonjourBrowser()
    @State private var showScanner = false
    @State private var showManual = false
    @State private var manualAddress = ""
    @State private var resolving: String?
    @State private var pairing = false
    @State private var error: String?
    @State private var code = ""
    @State private var pendingResponse: (URL, PairResponse)?
    @State private var serviceName: String?

    var body: some View {
        ZStack {
            AmbientBackground(warmth: step == .welcome ? 0.35 : 0.15, accent: Theme.amber)
            Group {
                switch step {
                case .welcome: welcome
                case .discover: discover
                case .code(let url): codeEntry(url)
                case .success(let home): success(home)
                }
            }
            .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                    removal: .move(edge: .leading).combined(with: .opacity)))
        }
        .animation(.spring(response: 0.55, dampingFraction: 0.85), value: step)
        .sheet(isPresented: $showScanner) {
            QRScannerSheet { payload in
                showScanner = false
                handleScanned(payload)
            }
        }
        .alert("Adresse du pont", isPresented: $showManual) {
            TextField("192.168.1.20:8787", text: $manualAddress)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Continuer") {
                if let link = PairLink.parse(manualAddress), let base = PairLink.baseURL(from: manualAddress) {
                    if let c = link.code { pair(base, code: c) } else { step = .code(base) }
                } else {
                    error = "Adresse invalide."
                }
            }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Affichée par « pnpm pair » sur le Mac.")
        }
    }

    // MARK: Bienvenue

    private var welcome: some View {
        VStack(spacing: 0) {
            Spacer()
            GlowingHouse()
                .frame(width: 210, height: 210)
            Spacer().frame(height: 40)
            Text("Bienvenue\nà la maison")
                .font(.system(size: 42, weight: .bold, design: .rounded))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
            Text("Lumières, télé, ventilateur : pilotez tout l'appartement depuis votre iPhone, le Centre de contrôle et le bouton Action.")
                .font(.system(.body, design: .rounded))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.7))
                .padding(.horizontal, 36)
                .padding(.top, 14)
            Spacer()
            VStack(spacing: 14) {
                PrimaryButton(title: "Commencer", systemImage: "arrow.right") {
                    step = .discover
                    browser.start()
                }
                Button("Essayer en mode démo") { store.enableDemo(true) }
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(.vertical, 6)
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
        }
    }

    // MARK: Découverte

    private var discover: some View {
        VStack(alignment: .leading, spacing: 22) {
            backButton { step = .welcome; browser.stop() }
            VStack(alignment: .leading, spacing: 8) {
                Text("Trouver votre maison")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                Text("Le pont domotique tourne sur votre Mac. Restez sur le même Wi-Fi.")
                    .font(.system(.body, design: .rounded))
                    .foregroundStyle(.white.opacity(0.7))
            }

            VStack(spacing: 12) {
                if browser.primary.isEmpty && browser.simulations.isEmpty {
                    HStack(spacing: 14) {
                        RadarPulse().frame(width: 44, height: 44)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(browser.denied ? "Accès au réseau local refusé" : "Recherche sur le Wi-Fi…")
                                .font(.system(.headline, design: .rounded))
                            Text(browser.denied ? "Réglages › Confidentialité › Réseau local › Maison." : "Lancez le pont sur le Mac si besoin.")
                                .font(.system(.subheadline, design: .rounded))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding(18)
                    .glassCard(radius: 24)
                }
                ForEach(browser.primary) { found in foundRow(found) }
                if !browser.simulations.isEmpty {
                    SectionTitle(text: "Ponts de test")
                        .padding(.top, 6)
                    ForEach(browser.simulations) { found in foundRow(found) }
                }
            }
            .animation(.spring(duration: 0.4), value: browser.results)

            if let error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(Theme.amber)
            }

            Spacer()

            VStack(spacing: 12) {
                PrimaryButton(title: "Scanner le QR code", systemImage: "qrcode.viewfinder") { showScanner = true }
                Button("Saisir l'adresse à la main") {
                    manualAddress = SharedStore.bridgeURL?.absoluteString ?? ""
                    showManual = true
                }
                .font(.system(.subheadline, design: .rounded).weight(.semibold))
                .foregroundStyle(.white.opacity(0.75))
                Text("Sur le Mac : pnpm --filter @appart3d/home-bridge pair")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.45))
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 20)
    }

    private func foundRow(_ found: BonjourBrowser.Found) -> some View {
        Button {
            resolve(found)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: found.isSimulation ? "testtube.2" : "house.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Color.black.opacity(0.75))
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(found.isSimulation ? AnyShapeStyle(Color.white.opacity(0.6)) : AnyShapeStyle(Theme.amber.gradient)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(found.title)
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(.white)
                    Text(found.isSimulation ? "Simulation — aucun appareil réel" : "Pont domotique · Bonjour")
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if resolving == found.name {
                    ProgressView()
                } else {
                    Image(systemName: "chevron.right").foregroundStyle(.secondary)
                }
            }
            .padding(16)
            .glassCard(radius: 24, tint: Theme.amber, amount: found.isSimulation ? 0 : 0.12)
        }
        .buttonStyle(PressableStyle())
        .transition(.scale(scale: 0.95).combined(with: .opacity))
    }

    // MARK: Code

    private func codeEntry(_ url: URL) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            backButton { step = .discover; code = ""; error = nil }
            VStack(alignment: .leading, spacing: 8) {
                Text("Code d'appairage")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                Text("Saisissez les 6 chiffres affichés sur le Mac par « pnpm pair ».")
                    .font(.system(.body, design: .rounded))
                    .foregroundStyle(.white.opacity(0.7))
                Label(url.host() ?? url.absoluteString, systemImage: "network")
                    .font(.system(.footnote, design: .rounded).weight(.medium))
                    .foregroundStyle(Theme.amber)
                    .padding(.top, 4)
            }
            CodeField(code: $code) { complete in
                if complete { pair(url, code: code) }
            }
            .disabled(pairing)
            if let error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(Theme.amber)
                    .transition(.opacity)
            }
            Spacer()
            PrimaryButton(title: pairing ? "Association…" : "Associer", systemImage: pairing ? nil : "link", loading: pairing) {
                pair(url, code: code)
            }
            .disabled(code.count != 6 || pairing)
            .opacity(code.count == 6 ? 1 : 0.5)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 20)
        .sensoryFeedback(.error, trigger: error)
    }

    // MARK: Succès

    private func success(_ home: String) -> some View {
        VStack(spacing: 22) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 96, weight: .semibold))
                .foregroundStyle(Theme.amber.gradient)
                .symbolEffect(.bounce, value: home)
                .shadow(color: Theme.amber.opacity(0.6), radius: 30)
            Text("C'est prêt !")
                .font(.system(size: 38, weight: .bold, design: .rounded))
            Text("Cet iPhone pilote désormais « \(home) ».\nAstuce : assignez le raccourci « Basculer les lumières » au bouton Action.")
                .font(.system(.body, design: .rounded))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.75))
                .padding(.horizontal, 30)
            Spacer()
            PrimaryButton(title: "Entrer", systemImage: "house.fill") {
                if let p = pendingResponse { store.didPair(bridgeURL: p.0, response: p.1, serviceName: serviceName) }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
        }
        .sensoryFeedback(.success, trigger: home)
    }

    // MARK: Logique

    private func resolve(_ found: BonjourBrowser.Found) {
        resolving = found.name
        error = nil
        Task {
            do {
                let url = try await BonjourBrowser.resolve(found.endpoint)
                resolving = nil
                serviceName = found.name
                step = .code(url)
            } catch {
                resolving = nil
                self.error = "Impossible de joindre « \(found.title) »."
            }
        }
    }

    private func handleScanned(_ payload: String) {
        serviceName = nil
        guard let link = PairLink.parse(payload) else {
            error = "Ce QR code n'est pas un lien d'appairage Maison."
            return
        }
        if let c = link.code {
            code = c
            step = .code(link.bridgeURL)
            pair(link.bridgeURL, code: c)
        } else {
            step = .code(link.bridgeURL)
        }
    }

    private func pair(_ url: URL, code: String) {
        guard let c = PairLink.normalizeCode(code), !pairing else { return }
        pairing = true
        error = nil
        Task {
            do {
                let response = try await BridgeClient.pair(baseURL: url, code: c, deviceName: UIDevice.current.name)
                pendingResponse = (url, response)
                pairing = false
                browser.stop()
                step = .success(response.home)
            } catch {
                pairing = false
                self.code = ""
                self.error = HomeError.wrap(error).localizedDescription
            }
        }
    }

    private func backButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.system(size: 16, weight: .bold))
                .frame(width: 40, height: 40)
                .background(Circle().fill(.ultraThinMaterial))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Retour")
        .padding(.top, 8)
    }
}

// MARK: - Éléments

struct PrimaryButton: View {
    var title: String
    var systemImage: String?
    var loading = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if loading { ProgressView().tint(.black) }
                Text(title)
                if let systemImage { Image(systemName: systemImage) }
            }
            .font(.system(.headline, design: .rounded))
            .foregroundStyle(Color.black.opacity(0.85))
            .frame(maxWidth: .infinity)
            .frame(minHeight: 58)
            .background(Capsule().fill(LinearGradient(colors: [Color(hex: "#ffd08a"), Theme.amber], startPoint: .top, endPoint: .bottom)))
            .shadow(color: Theme.amber.opacity(0.45), radius: 18, y: 8)
        }
        .buttonStyle(PressableStyle())
    }
}

/// Maison lumineuse animée de l'écran d'accueil.
struct GlowingHouse: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var glow = false

    var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [Theme.amber.opacity(0.75), Theme.ember.opacity(0.25), .clear],
                                     center: .center, startRadius: 30, endRadius: 150))
                .frame(width: 320, height: 320)
                .scaleEffect(glow ? 1.08 : 0.92)
                .blur(radius: 8)
            RoundedRectangle(cornerRadius: 48, style: .continuous)
                .fill(LinearGradient(colors: [Color(hex: "#3a1d52"), Color(hex: "#1a0d2e")], startPoint: .top, endPoint: .bottom))
                .frame(width: 140, height: 140)
                .overlay(RoundedRectangle(cornerRadius: 48, style: .continuous).strokeBorder(.white.opacity(0.18), lineWidth: 1))
                .shadow(color: .black.opacity(0.4), radius: 20, y: 12)
            Image(systemName: "house.fill")
                .font(.system(size: 64, weight: .semibold))
                .foregroundStyle(LinearGradient(colors: [Theme.cream, Theme.amber], startPoint: .top, endPoint: .bottom))
                .shadow(color: Theme.amber.opacity(glow ? 0.9 : 0.5), radius: glow ? 22 : 12)
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) { glow = true }
        }
        .accessibilityHidden(true)
    }
}

struct RadarPulse: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            ZStack {
                ForEach(0..<3) { i in
                    let phase = (t / 2 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
                    Circle()
                        .stroke(Theme.amber.opacity(reduceMotion ? 0.3 : 1 - phase), lineWidth: 1.5)
                        .scaleEffect(reduceMotion ? 0.7 : 0.3 + phase * 0.7)
                }
                Image(systemName: "wifi")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.amber)
            }
        }
        .accessibilityHidden(true)
    }
}

/// Saisie du code à 6 chiffres (cases), avec remplissage automatique.
struct CodeField: View {
    @Binding var code: String
    var onChange: (Bool) -> Void
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($focused)
                .opacity(0.02)
                .onChange(of: code) { _, new in
                    let digits = String(new.filter(\.isNumber).prefix(6))
                    if digits != new { code = digits }
                    onChange(digits.count == 6)
                }
                .accessibilityLabel("Code à 6 chiffres")
            HStack(spacing: 10) {
                ForEach(0..<6, id: \.self) { i in
                    let chars = Array(code)
                    let ch = i < chars.count ? String(chars[i]) : ""
                    let current = i == chars.count && focused
                    Text(ch)
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .frame(maxWidth: .infinity)
                        .frame(height: 64)
                        .glassCard(radius: 16, tint: Theme.amber, amount: ch.isEmpty ? 0 : 0.15)
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(current ? Theme.amber : .clear, lineWidth: 2))
                        .animation(.spring(duration: 0.25), value: ch)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onAppear { focused = true }
    }
}

// MARK: - Scanner QR (VisionKit)

struct QRScannerSheet: View {
    var onScan: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                    ZStack {
                        DataScannerRepresentable(onScan: onScan).ignoresSafeArea()
                        RoundedRectangle(cornerRadius: 32, style: .continuous)
                            .strokeBorder(Theme.amber, lineWidth: 3)
                            .frame(width: 250, height: 250)
                            .shadow(color: Theme.amber.opacity(0.6), radius: 12)
                        VStack {
                            Spacer()
                            Text("Visez le QR code affiché par « pnpm pair »")
                                .font(.system(.subheadline, design: .rounded).weight(.semibold))
                                .padding(.horizontal, 18)
                                .padding(.vertical, 12)
                                .glassCard(radius: 18)
                                .padding(.bottom, 40)
                        }
                    }
                } else {
                    ContentUnavailableView("Scanner indisponible",
                                           systemImage: "camera.metering.unknown",
                                           description: Text("La caméra n'est pas disponible (simulateur ou accès refusé). Saisissez l'adresse et le code à la main."))
                }
            }
            .navigationTitle("Scanner le QR code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
            }
        }
        .preferredColorScheme(.dark)
    }
}

struct DataScannerRepresentable: UIViewControllerRepresentable {
    var onScan: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan) }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])],
                                           qualityLevel: .balanced, recognizesMultipleItems: false,
                                           isHighFrameRateTrackingEnabled: false, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onScan: (String) -> Void
        var done = false
        init(onScan: @escaping (String) -> Void) { self.onScan = onScan }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !done else { return }
            for item in addedItems {
                if case .barcode(let code) = item, let payload = code.payloadStringValue, PairLink.parse(payload) != nil {
                    done = true
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    dataScanner.stopScanning()
                    onScan(payload)
                    return
                }
            }
        }
    }
}
