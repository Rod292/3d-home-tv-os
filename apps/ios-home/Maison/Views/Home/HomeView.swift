import SwiftUI

struct DeviceRef: Identifiable, Hashable {
    var id: String
}

struct HomeView: View {
    @Environment(HomeStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    @State private var embed = EmbedController()
    @State private var selectedRoom: String?
    @State private var detail: DeviceRef?
    @State private var chooser: [Device] = []
    @State private var showSettings = false
    @State private var scrollOffset: CGFloat = 0
    @State private var powerTaps = 0
    @State private var organizeTaps = 0
    /// Ambiance passée dans l'URL au premier chargement (les changements suivants passent par setDaylight, sans recharger).
    @State private var urlDaylight: DaylightMode?
    @State private var scrollPosition = ScrollPosition(edge: .top)
    @AppStorage("maison.night3D", store: SharedStore.defaults) private var night3D = "auto"
    @AppStorage("maison.webDemo", store: SharedStore.defaults) private var webDemo = false
    @Namespace private var zoom

    @Environment(KioskController.self) private var kiosk

    var body: some View {
        GeometryReader { geo in
            let wide = geo.size.width >= 820 && geo.size.width > geo.size.height
            ZStack(alignment: .bottom) {
                AmbientBackground(warmth: store.warmth, accent: averageGlow, day: ambiance.day, dusk: ambiance.dusk)

                if wide {
                    wideLayout(geo)
                } else {
                    stackedLayout(geo)
                }

                if let toast = store.toast {
                    ToastView(message: toast)
                        .padding(.bottom, geo.safeAreaInsets.bottom + 8)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                if kiosk.saverShown {
                    ScreenSaverView { kiosk.dismissSaver() }
                        .transition(.opacity)
                        .zIndex(10)
                }
            }
            .animation(.spring(duration: 0.4), value: store.toast)
        }
        .onChange(of: kiosk.saverShown) { _, shown in
            if shown {
                detail = nil
                showSettings = false
            }
        }
        .sheet(item: $detail, onDismiss: didCloseDetail) { ref in
            DeviceDetailSheet(deviceId: ref.id)
                .navigationTransition(.zoom(sourceID: ref.id, in: zoom))
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .presentationDragIndicator(.visible)
        }
        .confirmationDialog("Quel appareil ?", isPresented: Binding(get: { !chooser.isEmpty }, set: { if !$0 { chooser = [] } }),
                            titleVisibility: .visible) {
            ForEach(chooser) { d in
                Button(d.name) { open(d.id) }
            }
        }
        .onAppear {
            store.start()
            embed.onItemTapped = { itemId, ids in handleItemTap(itemId: itemId, deviceIds: ids) }
            if urlDaylight == nil { urlDaylight = daylightMode }
            embed.send(.setDaylight(daylightMode))
            // Captures d'écran / démo : `-detail <id appareil>` ouvre directement une fiche.
            let args = ProcessInfo.processInfo.arguments
            #if DEBUG
            // Captures : `-scrolled` fait défiler les commandes (maquette repliée).
            // Captures : `-reorder` ouvre le mode « Organiser ».
            if args.contains("-reorder") {
                Task {
                    try? await Task.sleep(for: .milliseconds(1500))
                    store.beginReordering()
                }
            }
            if args.contains("-scrolled") {
                Task {
                    try? await Task.sleep(for: .milliseconds(1200))
                    withAnimation { scrollPosition.scrollTo(y: 420) }
                }
            }
            #endif
            if let i = args.firstIndex(of: "-detail"), i + 1 < args.count {
                let id = args[i + 1]
                Task {
                    try? await Task.sleep(for: .milliseconds(900))
                    open(id)
                }
            }
        }
        .onChange(of: night3D) { embed.send(.setDaylight(daylightMode)) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { embed.send(.setDaylight(daylightMode)) }
        }
        .sensoryFeedback(.impact(weight: .heavy), trigger: powerTaps)
    }

    // MARK: Mises en page

    /// iPhone et iPad en portrait : grande maquette en haut (≈ 55 % de l'écran, 60 % sur iPad) qui se replie
    /// en vignette sous l'en-tête quand on fait défiler les commandes, présentées dans une feuille arrondie.
    private func stackedLayout(_ geo: GeometryProxy) -> some View {
        let safeTop = geo.safeAreaInsets.top
        let screenH = geo.size.height + safeTop + geo.safeAreaInsets.bottom
        let expanded = max(320, screenH * (geo.size.width > 600 ? 0.6 : 0.55))
        let collapsed = min(expanded, safeTop + 56 + 150)
        let y = scrollOffset
        // Hauteur visible de la maquette : se replie en défilant, s'étire quand on tire vers le bas.
        let heroH = y >= 0 ? max(collapsed, expanded - y) : expanded - y
        let progress = min(1, max(0, (expanded - heroH) / max(1, expanded - collapsed)))
        return ZStack(alignment: .top) {
            ScrollView {
                VStack(spacing: 0) {
                    Color.clear.frame(height: expanded)
                    controlsSheet(horizontalPadding: geo.size.width > 600 ? 32 : 20, minHeight: screenH - collapsed,
                                  bottomInset: geo.safeAreaInsets.bottom)
                }
                .frame(maxWidth: 1000)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
            .scrollPosition($scrollPosition)
            .ignoresSafeArea(edges: [.top, .bottom])
            .onScrollGeometryChange(for: CGFloat.self) { g in
                g.contentOffset.y + g.contentInsets.top
            } action: { _, new in
                scrollOffset = new
            }
            // Rien ne défile sous la maquette (fond transparent) : la feuille disparaît sous son bord bas.
            .mask(alignment: .top) {
                VStack(spacing: 0) {
                    LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom)
                        .frame(height: 28)
                        .padding(.top, max(0, heroH - 28))
                    Color.black
                }
            }

            hero(expanded: expanded, visible: heroH, progress: progress, safeTop: safeTop, width: geo.size.width)
        }
        .ignoresSafeArea(edges: [.top, .bottom])
    }

    /// iPad en paysage : maquette aussi grande que possible à gauche (≈ 65 %), en-tête par-dessus, commandes à droite.
    private func wideLayout(_ geo: GeometryProxy) -> some View {
        HStack(spacing: 0) {
            ZStack(alignment: .top) {
                illustrationOrWeb
                    .padding(.top, 64)
                    .padding(.bottom, 8)
                    .padding(.horizontal, 4)
                header
                    .padding(.top, 20)
                    .padding(.horizontal, 28)
            }
            .frame(width: geo.size.width * 0.65)

            ScrollView {
                content(horizontalPadding: 22)
                    .padding(.top, 28)
                    .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
            .frame(width: geo.size.width * 0.35)
            .background {
                Rectangle()
                    .fill(.ultraThinMaterial.opacity(0.35))
                    .overlay(alignment: .leading) { Rectangle().fill(.white.opacity(0.08)).frame(width: 0.5) }
                    .ignoresSafeArea()
            }
        }
    }

    // MARK: Hero

    private var useNativeIllustration: Bool { store.isMock && !webDemo }

    private var daylightMode: DaylightMode { Daylight.mode(night3D) }

    private var ambiance: (day: Double, dusk: Double) { Daylight.ambiance(mode: daylightMode, sun: store.sun) }

    private var heroURL: URL? {
        EmbedController.sceneURL(bridge: store.bridgeURL, demo: store.isMock && webDemo,
                                 daylight: urlDaylight ?? daylightMode, frame: .living)
    }

    /// Maquette épinglée en haut. La web view garde toujours la même taille (pas de redimensionnement WebGL
    /// pendant le défilement) : on la réduit par transformation et elle reste montée et visible.
    private func hero(expanded: CGFloat, visible heroH: CGFloat, progress: CGFloat, safeTop: CGFloat, width: CGFloat) -> some View {
        let headerH: CGFloat = 56
        let webH = max(1, expanded - safeTop - 6)
        let pull = max(0, heroH - expanded)
        // Repliée : vignette entre l'en-tête et le bord bas visible.
        let top = safeTop + headerH * progress
        let available = max(1, heroH - top - 6)
        let scale = pull > 0 ? 1 + pull / 700 : min(1, available / webH)
        return ZStack(alignment: .top) {
            illustrationOrWeb
                .frame(width: width, height: webH)
                .scaleEffect(scale, anchor: .top)
                .offset(y: top)
                .opacity(1 - 0.2 * progress)
                .mask {
                    LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.88), .init(color: .clear, location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                        .frame(height: heroH)
                        .frame(maxHeight: .infinity, alignment: .top)
                }
            header
                .padding(.top, safeTop + 8)
                .padding(.horizontal, 20)
        }
        .frame(height: heroH, alignment: .top)
        .frame(maxWidth: .infinity)
    }

    /// Commandes dans une feuille arrondie qui glisse par-dessus la maquette.
    private func controlsSheet(horizontalPadding pad: CGFloat, minHeight: CGFloat, bottomInset: CGFloat) -> some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(.white.opacity(0.28))
                .frame(width: 38, height: 5)
                .padding(.top, 8)
                .padding(.bottom, 12)
            content(horizontalPadding: pad)
                .padding(.bottom, 40 + bottomInset)
        }
        .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .top)
        .background {
            UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30, style: .continuous)
                .fill(.ultraThinMaterial.opacity(0.55))
                .overlay {
                    UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30, style: .continuous)
                        .strokeBorder(LinearGradient(colors: [.white.opacity(0.18), .white.opacity(0)], startPoint: .top, endPoint: .bottom),
                                      lineWidth: 0.8)
                }
                .shadow(color: .black.opacity(0.25), radius: 18, y: -4)
                .padding(.bottom, -400)
        }
    }

    @ViewBuilder
    private var illustrationOrWeb: some View {
        let illustration = ApartmentIllustration(devices: store.devices, focusedDeviceId: detail?.id) { d in open(d.id) }
        if useNativeIllustration {
            illustration
        } else if let url = heroURL {
            ZStack {
                illustration
                    .opacity(embed.isReady ? 0 : 1)
                ApartmentWebView(url: url, token: store.isMock ? nil : TokenStore.token, controller: embed)
                    .opacity(embed.isReady ? 1 : 0)
                    .allowsHitTesting(embed.isReady)
            }
            .animation(.easeInOut(duration: 0.6), value: embed.isReady)
        } else {
            illustration
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(store.homeName)
                    .font(.system(.title2, design: .rounded).weight(.bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                HStack(spacing: 6) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 7, height: 7)
                        .shadow(color: statusColor, radius: 4)
                    Text(HomeText.lightsSummary(store.lightsOn))
                        .contentTransition(.numericText(value: Double(store.lightsOn)))
                    if store.isMock {
                        Text("· Démo").foregroundStyle(Theme.amber.opacity(0.9))
                    }
                }
                .font(.system(.subheadline, design: .rounded).weight(.medium))
                .foregroundStyle(.white.opacity(0.75))
                .animation(.snappy, value: store.lightsOn)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            CircleIconButton(systemName: "gearshape.fill", label: "Réglages") { showSettings = true }
            CircleIconButton(systemName: "power", label: store.lightsOn > 0 ? "Éteindre toutes les lumières" : "Allumer les lumières",
                             active: store.lightsOn > 0, size: 50) {
                powerTaps += 1
                store.toggleAllLights()
            }
            .symbolEffect(.bounce, value: powerTaps)
        }
    }

    private var statusColor: Color {
        switch store.connection {
        case .live: Color(hex: "#5ee38a")
        case .offline: Theme.ember
        default: Color.white.opacity(0.5)
        }
    }

    // MARK: Contenu

    private func content(horizontalPadding pad: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            if case .offline(let message) = store.connection {
                OfflineBanner(message: message) { Task { await store.refresh() } }
                    .padding(.horizontal, pad)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            SceneChips(scenes: store.scenes, active: store.lastSceneId, pending: store.pendingScene, inset: pad) { id in
                store.runScene(id)
            }

            if let playing = store.devices.nowPlaying {
                NowPlayingCard(device: playing) { open(playing.id) }
                    .padding(.horizontal, pad)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            HStack(spacing: 10) {
                RoomPicker(rooms: store.rooms, selection: $selectedRoom)
                organizeButton
            }
            .padding(.horizontal, pad)

            if store.reordering {
                HStack(alignment: .center, spacing: 12) {
                    Label("Maintenez puis glissez une tuile pour la déplacer. L'ordre est partagé avec vos autres appareils.",
                          systemImage: "hand.draw.fill")
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(.white.opacity(0.7))
                    Spacer(minLength: 0)
                    Button {
                        organizeTaps += 1
                        store.endReordering()
                    } label: {
                        Text("Terminé")
                            .font(.system(.subheadline, design: .rounded).weight(.bold))
                            .foregroundStyle(Color.black.opacity(0.85))
                            .padding(.horizontal, 16)
                            .frame(height: 36)
                            .background(Capsule().fill(Theme.amber.gradient))
                    }
                    .buttonStyle(PressableStyle())
                    .fixedSize()
                }
                .padding(.horizontal, pad)
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            DeviceGrid(devices: filteredDevices, zoom: zoom,
                       onToggle: { d in
                           // Une enceinte sans lecture / pause disponible : on ouvre sa fiche.
                           if d.kind == .speaker && !d.capabilities.canMedia(.playPause) { open(d.id) } else { store.toggle(d.id) }
                       },
                       onOpen: { open($0.id) },
                       reordering: store.reordering,
                       onMove: { id, target in store.moveDevice(id, onto: target) },
                       onDrop: { store.commitOrder() })
                .padding(.horizontal, pad)
        }
        .animation(.spring(duration: 0.45), value: store.isOffline)
        .animation(.spring(duration: 0.45), value: store.devices.nowPlaying?.id)
        .animation(.spring(duration: 0.4), value: store.reordering)
    }

    /// « Organiser » / « Terminé » : bascule le mode de réorganisation des tuiles.
    private var organizeButton: some View {
        let active = store.reordering
        return Button {
            organizeTaps += 1
            if active { store.endReordering() } else { store.beginReordering() }
        } label: {
            Image(systemName: active ? "checkmark" : "arrow.up.arrow.down")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(active ? Color.black.opacity(0.85) : .white)
                .frame(width: 44, height: 44)
                .background(Circle().fill(active ? AnyShapeStyle(Theme.amber.gradient) : AnyShapeStyle(Color.white.opacity(0.12))))
                .overlay(Circle().strokeBorder(.white.opacity(0.14), lineWidth: 0.8))
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(PressableStyle())
        .fixedSize()
        .sensoryFeedback(.impact(weight: .light), trigger: organizeTaps)
        .accessibilityLabel(active ? "Terminé" : "Organiser les appareils")
        .accessibilityHint(active ? "Termine la réorganisation des appareils." : "Permet de réordonner les tuiles des appareils.")
    }

    private var filteredDevices: [Device] {
        let all = store.devices
        guard let room = selectedRoom else { return all }
        return all.filter { $0.room == room }
    }

    private var averageGlow: Color {
        let lit = store.devices.filter { $0.isLitLight }
        guard let first = lit.first else { return Theme.amber }
        return lit.dropFirst().reduce(DeviceStyle.glow(for: first)) { $0.mix(with: DeviceStyle.glow(for: $1), by: 0.5) }
    }

    // MARK: Navigation

    private func open(_ id: String) {
        guard let d = store.device(id) else { return }
        detail = DeviceRef(id: id)
        if let item = d.itemId { embed.send(.focusItem(item)) }
        embed.send(.highlightDevice(id))
    }

    private func didCloseDetail() {
        embed.send(.highlightDevice(nil))
        embed.send(.frame(.living))
    }

    private func handleItemTap(itemId: String, deviceIds: [String]) {
        let devices = deviceIds.compactMap { store.device($0) }
        // La télé (Ambilight compris) : sa fiche directement, sans choix ni bascule.
        if let tv = devices.first(where: { $0.kind == .tv }) {
            open(tv.id)
            return
        }
        switch devices.count {
        case 0: break
        case 1: open(devices[0].id)
        default: chooser = devices
        }
    }
}

// MARK: - Scènes

struct SceneChips: View {
    var scenes: [HomeScene]
    var active: String?
    var pending: String?
    var inset: CGFloat = 20
    var run: (String) -> Void
    @State private var taps = 0

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 10) {
                ForEach(scenes) { scene in
                    let tint = DeviceStyle.sceneTint(scene.id)
                    let isActive = active == scene.id
                    Button {
                        taps += 1
                        run(scene.id)
                    } label: {
                        HStack(spacing: 8) {
                            ZStack {
                                if pending == scene.id {
                                    ProgressView().controlSize(.mini).tint(.white)
                                } else {
                                    Image(systemName: DeviceStyle.sceneSymbol(scene.icon))
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(isActive ? Color.black.opacity(0.8) : tint)
                                        .symbolEffect(.bounce, value: isActive)
                                }
                            }
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(isActive ? Color.white.opacity(0.55) : tint.opacity(0.16)))
                            Text(scene.name)
                                .font(.system(.subheadline, design: .rounded).weight(.semibold))
                                .foregroundStyle(isActive ? Color.black.opacity(0.85) : .white)
                        }
                        .padding(.leading, 6)
                        .padding(.trailing, 16)
                        .padding(.vertical, 6)
                        .background {
                            Capsule().fill(isActive ? AnyShapeStyle(tint.gradient) : AnyShapeStyle(.ultraThinMaterial))
                        }
                        .overlay(Capsule().strokeBorder(.white.opacity(isActive ? 0.3 : 0.14), lineWidth: 0.8))
                        .shadow(color: isActive ? tint.opacity(0.45) : .clear, radius: 12, y: 4)
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityLabel("Scène \(scene.name)")
                    .accessibilityAddTraits(isActive ? .isSelected : [])
                }
            }
            .padding(.horizontal, inset)
            .padding(.vertical, 4)
        }
        .scrollIndicators(.hidden)
        .sensoryFeedback(.impact(weight: .medium), trigger: taps)
        .animation(.spring(duration: 0.35), value: active)
    }
}

// MARK: - Pièces

struct RoomPicker: View {
    var rooms: [String]
    @Binding var selection: String?
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 4) {
            segment(nil, title: "Tous")
            ForEach(rooms, id: \.self) { segment($0, title: $0) }
        }
        .padding(4)
        .background(Capsule().fill(.ultraThinMaterial))
        .overlay(Capsule().strokeBorder(.white.opacity(0.12), lineWidth: 0.8))
        .sensoryFeedback(.selection, trigger: selection)
    }

    private func segment(_ room: String?, title: String) -> some View {
        let selected = selection == room
        return Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { selection = room }
        } label: {
            Text(title)
                .font(.system(.subheadline, design: .rounded).weight(.semibold))
                .foregroundStyle(selected ? Color.black.opacity(0.85) : .white.opacity(0.8))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background {
                    if selected {
                        Capsule().fill(Theme.cream).matchedGeometryEffect(id: "room", in: ns)
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
