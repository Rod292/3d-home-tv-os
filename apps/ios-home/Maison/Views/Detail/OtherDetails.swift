import SwiftUI

// MARK: - Prise

struct PlugDetail: View {
    var device: Device
    @Environment(HomeStore.self) private var store
    @State private var taps = 0

    private var on: Bool { device.state.on == true }

    var body: some View {
        VStack(spacing: 22) {
            Button {
                taps += 1
                store.toggle(device.id)
            } label: {
                ZStack {
                    Circle()
                        .fill(on ? AnyShapeStyle(Theme.amber.gradient) : AnyShapeStyle(Color.white.opacity(0.08)))
                        .overlay(Circle().strokeBorder(.white.opacity(on ? 0.4 : 0.15), lineWidth: 1.5))
                        .shadow(color: on ? Theme.amber.opacity(0.75) : .clear, radius: 50)
                    VStack(spacing: 10) {
                        Image(systemName: DeviceStyle.symbol(for: device))
                            .font(.system(size: 54, weight: .semibold))
                            .symbolEffect(.bounce, value: taps)
                        Text(on ? "Allumée" : "Éteinte")
                            .font(.system(.title3, design: .rounded).weight(.semibold))
                    }
                    .foregroundStyle(on ? Color.black.opacity(0.78) : .white.opacity(0.85))
                }
                .frame(width: 210, height: 210)
            }
            .buttonStyle(PressableStyle())
            .sensoryFeedback(.impact(weight: .heavy), trigger: taps)
            .accessibilityLabel(device.name)
            .accessibilityValue(on ? "Allumée" : "Éteinte")
            .accessibilityHint("Touchez deux fois pour basculer.")
            .animation(.spring(response: 0.4, dampingFraction: 0.7), value: on)

            Text("Prise connectée — marche / arrêt uniquement.")
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(.secondary)
        }
        .padding(.top, 10)
    }
}

// MARK: - Ventilateur

struct FanDetail: View {
    var device: Device
    @Environment(HomeStore.self) private var store
    @State private var ticks = 0

    private var steps: Int { max(1, device.capabilities.speedSteps ?? 6) }
    private var step: Int { device.state.on == true ? FanMath.step(for: device.state.speed ?? 0, steps: steps) : 0 }
    private let tint = Color(hex: "#7fd6ff")

    var body: some View {
        VStack(spacing: 26) {
            FanDial(step: step, steps: steps, tint: tint) { setStep($0) }
                .frame(width: 270, height: 270)
                .frame(maxWidth: .infinity)

            HStack(spacing: 14) {
                stepButton("minus", label: "Moins vite", enabled: step > 0) { setStep(step - 1) }
                Button {
                    setStep(step == 0 ? max(1, steps / 2) : 0)
                } label: {
                    Text(step == 0 ? "Démarrer" : "Arrêter")
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(step == 0 ? Color.black.opacity(0.8) : .white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(Capsule().fill(step == 0 ? AnyShapeStyle(tint.gradient) : AnyShapeStyle(Color.white.opacity(0.12))))
                }
                .buttonStyle(PressableStyle())
                stepButton("plus", label: "Plus vite", enabled: step < steps) { setStep(step + 1) }
            }

            if device.capabilities.fanLight == true {
                let lightOn = device.state.lightOn == true
                Button {
                    ticks += 1
                    store.perform(.fanLight(!lightOn), on: device.id)
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: lightOn ? "lightbulb.fill" : "lightbulb")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(lightOn ? Color.black.opacity(0.75) : .white)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(lightOn ? AnyShapeStyle(Theme.amber.gradient) : AnyShapeStyle(Color.white.opacity(0.1))))
                            .contentTransition(.symbolEffect(.replace))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Lumière du ventilateur")
                                .font(.system(.headline, design: .rounded))
                            Text(lightOn ? "Allumée" : "Éteinte")
                                .font(.system(.subheadline, design: .rounded))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Capsule()
                            .fill(lightOn ? Theme.amber : Color.white.opacity(0.18))
                            .frame(width: 52, height: 32)
                            .overlay(alignment: lightOn ? .trailing : .leading) {
                                Circle().fill(.white).padding(3).shadow(radius: 2)
                            }
                    }
                    .padding(16)
                    .glassCard(radius: 22, tint: Theme.amber, amount: lightOn ? 0.18 : 0)
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Lumière du ventilateur")
                .accessibilityValue(lightOn ? "Allumée" : "Éteinte")
                .accessibilityAddTraits(.isButton)
                .animation(.spring(response: 0.35, dampingFraction: 0.75), value: lightOn)
            }
        }
        .sensoryFeedback(.impact(weight: .medium), trigger: ticks)
    }

    private func stepButton(_ symbol: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .bold))
                .frame(width: 56, height: 56)
                .background(Circle().fill(.white.opacity(0.12)))
        }
        .buttonStyle(PressableStyle())
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
        .accessibilityLabel(label)
    }

    private func setStep(_ newStep: Int) {
        let s = min(steps, max(0, newStep))
        guard s != step else { return }
        ticks += 1
        store.perform(.speed(FanMath.speed(forStep: s, steps: steps)), on: device.id)
    }
}

/// Cadran à crans autour d'un ventilateur qui tourne à la vitesse choisie.
struct FanDial: View {
    var step: Int
    var steps: Int
    var tint: Color
    var set: (Int) -> Void

    private let sweep: Double = 270
    @State private var dragStep: Int?

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            let shown = dragStep ?? step
            ZStack {
                ForEach(0..<steps, id: \.self) { i in
                    let seg = sweep / Double(steps)
                    let from = (135 + Double(i) * seg + 7) / 360
                    let to = (135 + Double(i + 1) * seg - 7) / 360
                    ArcSegment(from: from, to: to)
                        .stroke(i < shown ? AnyShapeStyle(tint.gradient) : AnyShapeStyle(Color.white.opacity(0.12)),
                                style: StrokeStyle(lineWidth: 16, lineCap: .round))
                        .shadow(color: i < shown ? tint.opacity(0.6) : .clear, radius: 8)
                }
                .padding(10)

                VStack(spacing: 4) {
                    SpinningSymbol(name: "fan.fill", spinning: shown > 0, speed: Double(shown) / Double(steps) * 100)
                        .font(.system(size: size * 0.26, weight: .semibold))
                        .foregroundStyle(shown > 0 ? tint : .white.opacity(0.5))
                        .shadow(color: shown > 0 ? tint.opacity(0.6) : .clear, radius: 16)
                    Text(shown == 0 ? "Arrêt" : "Vitesse \(shown)")
                        .font(.system(.title3, design: .rounded).weight(.bold))
                        .contentTransition(.numericText(value: Double(shown)))
                    Text("sur \(steps)")
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(.secondary)
                }
                .animation(.snappy, value: shown)
            }
            .frame(width: size, height: size)
            .contentShape(Circle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in dragStep = stepAt(g.location, size: size) }
                    .onEnded { g in
                        let s = stepAt(g.location, size: size)
                        dragStep = nil
                        set(s)
                    }
            )
            .sensoryFeedback(.selection, trigger: dragStep)
        }
        .accessibilityElement()
        .accessibilityLabel("Vitesse du ventilateur")
        .accessibilityValue(step == 0 ? "Arrêt" : "Vitesse \(step) sur \(steps)")
        .accessibilityAdjustableAction { dir in
            set(dir == .increment ? min(steps, step + 1) : max(0, step - 1))
        }
    }

    /// Angle du doigt → cran (0 = arrêt, en dessous du début de l'arc).
    private func stepAt(_ p: CGPoint, size: CGFloat) -> Int {
        let c = CGPoint(x: size / 2, y: size / 2)
        var angle = atan2(p.y - c.y, p.x - c.x) * 180 / .pi  // 0 = droite, sens horaire
        if angle < 0 { angle += 360 }
        var rel = angle - 135
        if rel < 0 { rel += 360 }
        if rel > sweep { return rel > sweep + (360 - sweep) / 2 ? 0 : steps }
        return min(steps, max(1, Int(ceil(rel / (sweep / Double(steps))))))
    }
}

struct ArcSegment: Shape {
    var from: Double
    var to: Double
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let r = min(rect.width, rect.height) / 2
        p.addArc(center: CGPoint(x: rect.midX, y: rect.midY), radius: r,
                 startAngle: .degrees(from * 360), endAngle: .degrees(to * 360), clockwise: false)
        return p
    }
}

// MARK: - Télé

struct TVDetail: View {
    var device: Device
    @Environment(HomeStore.self) private var store
    @State private var taps = 0

    private var on: Bool { device.state.on == true }
    private let tint = Color(hex: "#8b9bff")

    var body: some View {
        VStack(spacing: 24) {
            HStack(spacing: 18) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(on ? (device.state.media?.app ?? device.state.media?.channel ?? device.state.source ?? "Allumée") : "Éteinte")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .contentTransition(.opacity)
                    Text(on ? (device.state.media?.title ?? "Source actuelle") : "Touchez pour allumer")
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                PowerToggleButton(on: on, tint: tint, size: 70) {
                    store.perform(.power(!on), on: device.id)
                }
            }

            if device.capabilities.volume == true {
                HStack(spacing: 16) {
                    volumeButton("speaker.minus.fill", label: "Baisser le volume", delta: -1)
                    VStack(spacing: 2) {
                        Text(device.state.volume.map { "\(Int($0))" } ?? "··")
                            .font(.system(size: 40, weight: .bold, design: .rounded))
                            .foregroundStyle(device.state.volume == nil ? .white.opacity(0.4) : .white)
                            .contentTransition(.numericText(value: device.state.volume ?? 0))
                            .monospacedDigit()
                        Text("Volume")
                            .font(.system(.caption, design: .rounded).weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .combine)
                    volumeButton("speaker.plus.fill", label: "Monter le volume", delta: 1)
                }
                .padding(14)
                .glassCard(radius: 30)
                .animation(.snappy, value: device.state.volume)
            }

            let apps = device.capabilities.tvApps
            if !apps.isEmpty {
                TVAppsGrid(device: device, apps: apps) { app in
                    taps += 1
                    store.perform(.button(app.button), on: device.id)
                }
            }

            if device.capabilities.ambilight != nil {
                AmbilightSection(device: device)
            }

            let sources = device.capabilities.sources
            if !sources.isEmpty {
                VStack(spacing: 12) {
                    SectionTitle(text: apps.isEmpty ? "Sources et applis" : "Sources")
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(sources, id: \.self) { s in sourceButton(s) }
                    }
                }
            }

            let remote = device.capabilities.remoteButtons.filter { Self.remoteSymbols[$0] != nil }
            if !remote.isEmpty {
                VStack(spacing: 12) {
                    SectionTitle(text: "Télécommande")
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: min(5, remote.count)), spacing: 10) {
                        ForEach(remote, id: \.self) { b in remoteButton(b) }
                    }
                }
            }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: taps)
    }

    static let remoteSymbols: [String: (String, String)] = [
        "home": ("house.fill", "Accueil"), "back": ("arrow.uturn.backward", "Retour"), "mute": ("speaker.slash.fill", "Muet"),
        "channel_up": ("chevron.up", "Chaîne suivante"), "channel_down": ("chevron.down", "Chaîne précédente"),
        "ok": ("circle.fill", "OK"), "up": ("arrowtriangle.up.fill", "Haut"), "down": ("arrowtriangle.down.fill", "Bas"),
        "left": ("arrowtriangle.left.fill", "Gauche"), "right": ("arrowtriangle.right.fill", "Droite"),
        "play_pause": ("playpause.fill", "Lecture/Pause"),
        "amp_mute": ("speaker.slash.fill", "Muet ampli"), "amp_power": ("hifispeaker.fill", "Marche ampli"),
    ]

    private func appSymbol(_ s: String) -> String {
        let l = s.lowercased()
        if l.contains("hdmi") { return "cable.connector.horizontal" }
        if l.contains("netflix") || l.contains("canal") || l.contains("disney") || l.contains("prime") { return "play.tv.fill" }
        if l.contains("youtube") { return "play.rectangle.fill" }
        if l.contains("tv") || l.contains("antenne") { return "antenna.radiowaves.left.and.right" }
        return "app.fill"
    }

    private func sourceButton(_ s: String) -> some View {
        let selected = on && device.state.source == s
        return Button {
            taps += 1
            store.perform(.button("source:\(s)"), on: device.id)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: appSymbol(s))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(selected ? Color.black.opacity(0.75) : tint)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(selected ? Color.white.opacity(0.5) : tint.opacity(0.15)))
                Text(s)
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                    .foregroundStyle(selected ? Color.black.opacity(0.85) : .white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            .padding(10)
            .background {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(selected ? AnyShapeStyle(tint.gradient) : AnyShapeStyle(.ultraThinMaterial))
            }
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.12), lineWidth: 0.8))
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(s)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func remoteButton(_ name: String) -> some View {
        let (symbol, label) = Self.remoteSymbols[name] ?? ("circle", name)
        return Button {
            taps += 1
            store.perform(.button(name), on: device.id)
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .semibold))
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white.opacity(0.09)))
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(label)
    }

    private func volumeButton(_ symbol: String, label: String, delta: Int) -> some View {
        Button {
            taps += 1
            store.perform(.volumeStep(delta), on: device.id)
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .semibold))
                .frame(width: 60, height: 60)
                .background(Circle().fill(.white.opacity(0.12)))
        }
        .buttonStyle(PressableStyle())
        .buttonRepeatBehavior(.enabled)
        .accessibilityLabel(label)
    }
}

// MARK: - Applis de la télé

/// Grille d'applis aux couleurs des marques ; l'appli au premier plan est mise en avant.
struct TVAppsGrid: View {
    var device: Device
    var apps: [TvApp]
    var launch: (TvApp) -> Void

    private var current: String? {
        guard device.state.on == true else { return nil }
        return device.state.media?.app?.lowercased()
    }

    var body: some View {
        VStack(spacing: 12) {
            SectionTitle(text: "Applications")
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                ForEach(apps) { app in tile(app) }
            }
            if device.state.on != true {
                Text("La télé s'allume d'abord, puis l'appli s'ouvre.")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func tile(_ app: TvApp) -> some View {
        let brand = TvAppStyle.brand(id: app.id, label: app.label)
        let active = current == app.label.lowercased()
        return Button { launch(app) } label: {
            VStack(spacing: 6) {
                Image(systemName: brand.symbol)
                    .font(.system(size: 20, weight: .semibold))
                Text(app.label)
                    .font(.system(.caption, design: .rounded).weight(.bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(Color(hex: brand.fg))
            .frame(maxWidth: .infinity)
            .frame(height: 72)
            .background {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(LinearGradient(colors: [Color(hex: brand.bg.0), Color(hex: brand.bg.1)], startPoint: .topLeading, endPoint: .bottomTrailing))
            }
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(active ? Color(hex: brand.accent) : .white.opacity(0.12), lineWidth: active ? 2.5 : 0.8)
            }
            .overlay(alignment: .topTrailing) {
                if active {
                    Image(systemName: "play.fill")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(5)
                        .background(Circle().fill(Color(hex: brand.accent)))
                        .padding(6)
                }
            }
            .shadow(color: active ? Color(hex: brand.accent).opacity(0.55) : .clear, radius: 12)
            .scaleEffect(active ? 1.03 : 1)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel("Ouvrir \(app.label)")
        .accessibilityAddTraits(active ? .isSelected : [])
        .animation(.spring(duration: 0.3), value: active)
    }
}

// MARK: - Ambilight

/// Ambilight replié dans la fiche télé : marche / arrêt, couleurs, luminosité, effets.
struct AmbilightSection: View {
    var device: Device
    @Environment(HomeStore.self) private var store
    @State private var level: Double = 50
    @State private var editing = false
    @State private var picks = 0

    private var state: AmbilightState { device.state.ambilight ?? AmbilightState(on: false) }
    private var caps: AmbilightCapabilities { device.capabilities.ambilight ?? AmbilightCapabilities() }
    private var on: Bool { state.on }
    private var tint: Color { state.color.map { Color(hex: $0) } ?? Color(hex: "#7d6bff") }

    private var effects: [String] { caps.effects ?? [] }
    /// Effets groupés (Vidéo, Son, Couleur…) dans l'ordre d'apparition.
    private var groups: [(String, [String])] {
        var order: [String] = []
        var map: [String: [String]] = [:]
        for e in effects {
            let g = AmbilightText.group(e) ?? "Autres"
            if map[g] == nil { order.append(g) }
            map[g, default: []].append(e)
        }
        return order.map { ($0, map[$0]!) }
    }

    var body: some View {
        VStack(spacing: 14) {
            SectionTitle(text: "Ambilight")
            VStack(spacing: 18) {
                Button {
                    picks += 1
                    store.perform(.ambilight(on: !on), on: device.id)
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "sparkles.tv.fill")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(on ? Color.black.opacity(0.75) : .white)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(on ? AnyShapeStyle(tint.gradient) : AnyShapeStyle(Color.white.opacity(0.1))))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Ambilight")
                                .font(.system(.headline, design: .rounded))
                            Text(summary)
                                .font(.system(.subheadline, design: .rounded))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        Spacer()
                        Capsule()
                            .fill(on ? tint : Color.white.opacity(0.18))
                            .frame(width: 52, height: 32)
                            .overlay(alignment: on ? .trailing : .leading) {
                                Circle().fill(.white).padding(3).shadow(radius: 2)
                            }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Ambilight")
                .accessibilityValue(on ? "Allumé" : "Éteint")
                .accessibilityAddTraits(.isButton)

                if caps.color != false {
                    HStack(spacing: 0) {
                        ForEach(LightDetail.swatches, id: \.0) { hex, name in
                            swatch(hex: hex, name: name).frame(maxWidth: .infinity)
                        }
                    }
                }

                if caps.brightness == true {
                    HStack(spacing: 12) {
                        Image(systemName: "sun.min.fill").foregroundStyle(.secondary)
                        Slider(value: $level, in: 1...100) { isEditing in
                            editing = isEditing
                            if !isEditing { send() }
                        }
                        .tint(tint)
                        .onChange(of: level) { if editing { send() } }
                        .accessibilityLabel("Luminosité de l'Ambilight")
                        .accessibilityValue("\(Int(level)) %")
                        Image(systemName: "sun.max.fill").foregroundStyle(.secondary)
                    }
                }

                if !effects.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(groups, id: \.0) { group, list in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(group)
                                    .font(.system(.caption, design: .rounded).weight(.semibold))
                                    .foregroundStyle(.secondary)
                                ScrollView(.horizontal) {
                                    HStack(spacing: 8) {
                                        ForEach(list, id: \.self) { e in chip(e) }
                                    }
                                }
                                .scrollIndicators(.hidden)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(16)
            .glassCard(radius: 24, tint: tint, amount: on ? 0.16 : 0)
            .animation(.spring(response: 0.35, dampingFraction: 0.75), value: on)
        }
        .sensoryFeedback(.selection, trigger: picks)
        .onAppear { level = state.brightness ?? 50 }
        .onChange(of: state.brightness) { _, new in
            if !editing, let new { withAnimation(.smooth) { level = new } }
        }
    }

    private var summary: String {
        guard on else { return "Éteint" }
        if let e = state.effect { return AmbilightText.label(e) }
        if let b = state.brightness { return "Couleur fixe · \(Int(b)) %" }
        return "Allumé"
    }

    private func send() {
        store.performThrottled(.ambilight(on: true, brightness: Int(level.rounded())), on: device.id, key: "ambilight")
    }

    private func swatch(hex: String, name: String) -> some View {
        let selected = on && state.effect == nil && state.color?.lowercased() == hex.lowercased()
        return Button {
            picks += 1
            store.perform(.ambilight(on: true, hex: hex), on: device.id)
        } label: {
            Circle()
                .fill(Color(hex: hex).gradient)
                .frame(width: 30, height: 30)
                .overlay(Circle().strokeBorder(.white.opacity(selected ? 0.95 : 0.15), lineWidth: selected ? 2.5 : 1))
                .shadow(color: Color(hex: hex).opacity(selected ? 0.8 : 0.2), radius: selected ? 8 : 4)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel("Ambilight \(name)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func chip(_ effect: String) -> some View {
        let selected = on && state.effect == effect
        return Button {
            picks += 1
            store.perform(.ambilight(on: true, effect: effect), on: device.id)
        } label: {
            Text(AmbilightText.shortLabel(effect))
                .font(.system(.subheadline, design: .rounded).weight(.semibold))
                .foregroundStyle(selected ? Color.black.opacity(0.85) : .white)
                .padding(.horizontal, 14)
                .frame(height: 36)
                .background(Capsule().fill(selected ? AnyShapeStyle(tint.gradient) : AnyShapeStyle(Color.white.opacity(0.1))))
                .overlay(Capsule().strokeBorder(.white.opacity(selected ? 0.6 : 0.12), lineWidth: 1))
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(AmbilightText.label(effect))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
