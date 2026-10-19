import SwiftUI

/// Économiseur d'écran du mode mural : maquette qui tourne lentement, grande horloge, état de la maison.
/// Un seul toucher n'importe où revient aux commandes, sans déclencher d'action.
struct ScreenSaverView: View {
    var dismiss: () -> Void
    @Environment(HomeStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var embed = EmbedController()
    @State private var appeared = false
    @AppStorage("maison.night3D", store: SharedStore.defaults) private var night3D = "auto"
    /// Cadrage passé dans l'URL au premier affichage (ensuite : commande `frame`, sans recharger).
    @State private var urlFrame: FrameTarget?
    @State private var urlDaylight: DaylightMode?

    var body: some View {
        TimelineView(.everyMinute) { tl in
            let night = Daylight.isNight(mode: .auto, sun: store.sun, date: tl.date)
            GeometryReader { geo in
                let wide = geo.size.width > geo.size.height
                ZStack {
                    background(night: night, date: tl.date)

                    hero(frame: wide ? .all : .living)
                        .frame(width: wide ? geo.size.width * 0.56 : geo.size.width * 0.9,
                               height: wide ? geo.size.height * 0.8 : geo.size.height * 0.5)
                        .position(x: wide ? geo.size.width * 0.68 : geo.size.width / 2,
                                  y: wide ? geo.size.height * 0.52 : geo.size.height * 0.62)
                        .opacity(night ? 0.8 : 0.95)

                    clock(date: tl.date, night: night, large: wide)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: wide ? .topLeading : .top)
                        .padding(.top, geo.safeAreaInsets.top + (wide ? 60 : 50))
                        .padding(.horizontal, wide ? 70 : 28)
                        // Déplacement lent pour éviter le marquage de l'écran.
                        .offset(x: reduceMotion ? 0 : drift(tl.date).width, y: reduceMotion ? 0 : drift(tl.date).height)

                    // Assombrissement nocturne.
                    Color.black.opacity(night ? 0.35 : 0).allowsHitTesting(false)
                }
                .onAppear {
                    if urlFrame == nil { urlFrame = wide ? .all : .living }
                    if urlDaylight == nil { urlDaylight = Daylight.mode(night3D) }
                }
                // Paysage (iPad au mur) : tout l'appartement ; portrait : le salon.
                .onChange(of: wide) { _, w in embed.send(.frame(w ? .all : .living)) }
            }
            .ignoresSafeArea()
        }
        .contentShape(Rectangle())
        .onTapGesture { dismiss() }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Économiseur d'écran. \(HomeText.lightsSummary(store.lightsOn))")
        .accessibilityHint("Touchez pour revenir aux commandes.")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { dismiss() }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .onAppear {
            embed.send(.autoRotate(true))
            embed.send(.setDaylight(Daylight.mode(night3D)))
        }
    }

    private func drift(_ date: Date) -> CGSize {
        let m = Double(Calendar.current.component(.minute, from: date))
        return CGSize(width: sin(m / 60 * .pi * 2) * 14, height: cos(m / 60 * .pi * 2) * 10)
    }

    private func background(night: Bool, date: Date) -> some View {
        let a = Daylight.ambiance(mode: .auto, sun: store.sun, date: date)
        return ZStack {
            LinearGradient(colors: night ? [Color(hex: "#03040d"), Color(hex: "#0d0718")]
                                         : Theme.backgroundColors(warmth: store.warmth * 0.6, day: a.day * 0.85, dusk: a.dusk),
                           startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [Theme.amber.opacity(0.10 + store.warmth * 0.2), .clear], center: .init(x: 0.62, y: 0.6),
                           startRadius: 0, endRadius: 520)
        }
    }

    @ViewBuilder
    private func hero(frame: FrameTarget) -> some View {
        let illustration = SlowSpin(enabled: !reduceMotion) {
            ApartmentIllustration(devices: store.devices, focusedDeviceId: nil) { _ in }
                .allowsHitTesting(false)
        }
        if store.isMock && !SharedStore.webDemo {
            illustration
        } else if let url = EmbedController.sceneURL(bridge: store.bridgeURL, demo: store.isMock && SharedStore.webDemo,
                                                     daylight: urlDaylight ?? Daylight.mode(night3D), frame: urlFrame ?? frame) {
            ZStack {
                illustration.opacity(embed.isReady ? 0 : 1)
                ApartmentWebView(url: url, token: store.isMock ? nil : TokenStore.token, controller: embed)
                    .opacity(embed.isReady ? 1 : 0)
                    .allowsHitTesting(false)
            }
            .animation(.easeInOut(duration: 1), value: embed.isReady)
        } else {
            illustration
        }
    }

    private func clock(date: Date, night: Bool, large: Bool) -> some View {
        VStack(alignment: large ? .leading : .center, spacing: 6) {
            Text(date, format: .dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
                .font(.system(size: large ? 150 : 96, weight: .thin, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.white.opacity(night ? 0.8 : 0.95))
                .contentTransition(.numericText())
            Text(date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "fr_FR"))).capitalizedFirst)
                .font(.system(size: large ? 30 : 22, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.7))
            Spacer().frame(height: large ? 28 : 18)
            Text(store.homeName)
                .font(.system(size: large ? 26 : 20, weight: .semibold, design: .rounded))
                .foregroundStyle(Theme.amber.opacity(0.9))
            Text(statusLine)
                .font(.system(size: large ? 20 : 16, weight: .regular, design: .rounded))
                .foregroundStyle(.white.opacity(0.6))
                .multilineTextAlignment(large ? .leading : .center)
        }
    }

    private var statusLine: String {
        var parts = [HomeText.lightsSummary(store.lightsOn)]
        for d in store.devices where d.state.on == true && d.state.reachable {
            switch d.kind {
            case .fan: parts.append("\(d.name) \(HomeText.deviceState(d).lowercased())")
            case .tv: parts.append("\(d.name) allumée")
            default: break
            }
        }
        if store.isOffline { parts.append("hors ligne") }
        return parts.joined(separator: " · ")
    }
}

/// Rotation lente (balancement) de l'illustration native, pour évoquer la maquette qui tourne.
struct SlowSpin<Content: View>: View {
    var enabled: Bool
    @ViewBuilder var content: Content

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !enabled)) { tl in
            let t = enabled ? tl.date.timeIntervalSinceReferenceDate : 0
            content
                .rotation3DEffect(.degrees(sin(t * 0.08) * 14), axis: (x: 0, y: 1, z: 0), perspective: 0.4)
                .scaleEffect(1 + 0.03 * sin(t * 0.05))
        }
    }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
