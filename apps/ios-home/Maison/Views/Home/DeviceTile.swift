import SwiftUI

struct DeviceGrid: View {
    var devices: [Device]
    var zoom: Namespace.ID
    var onToggle: (Device) -> Void
    var onOpen: (Device) -> Void
    /// Mode « Organiser » : glisser-déposer des tuiles, pas de bascule au toucher.
    var reordering = false
    /// Déplace la tuile `id` à la place de `target` (en direct pendant le survol).
    var onMove: (String, String) -> Void = { _, _ in }
    /// Tuile déposée : enregistrer l'ordre.
    var onDrop: () -> Void = {}

    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var dragging: String?
    @State private var pickups = 0
    @State private var drops = 0

    var body: some View {
        let columns = typeSize.isAccessibilitySize
            ? [GridItem(.flexible())]
            : [GridItem(.adaptive(minimum: 160, maximum: 320), spacing: 14)]
        LazyVGrid(columns: columns, spacing: 14) {
            ForEach(Array(devices.enumerated()), id: \.element.id) { index, d in
                tile(d, index: index)
            }
        }
        .animation(.spring(response: 0.45, dampingFraction: 0.85), value: devices.map(\.id))
        // Dépôt hors d'une tuile : on termine le geste quand même.
        .onDrop(of: [.text], isTargeted: nil) { _ in finishDrag() }
        .onChange(of: reordering) { _, now in if !now { dragging = nil } }
        .sensoryFeedback(.impact(weight: .medium), trigger: pickups)
        .sensoryFeedback(.selection, trigger: reordering ? devices.map(\.id) : [])
        .sensoryFeedback(.impact(weight: .light, intensity: 0.8), trigger: drops)
    }

    @ViewBuilder
    private func tile(_ d: Device, index: Int) -> some View {
        let base = DeviceTile(device: d, reordering: reordering, onToggle: { onToggle(d) }, onOpen: { onOpen(d) })
            .matchedTransitionSource(id: d.id, in: zoom) { src in
                src.clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            }
            .transition(.scale(scale: 0.92).combined(with: .opacity))
        if reordering {
            base
                .opacity(dragging == d.id ? 0.35 : 1)
                .scaleEffect(dragging == d.id ? 0.94 : 1)
                .onDrag {
                    dragging = d.id
                    pickups += 1
                    return NSItemProvider(object: d.id as NSString)
                }
                .onDrop(of: [.text], delegate: TileDropDelegate(target: d.id, dragging: $dragging, move: onMove, drop: finishDrag))
                .accessibilityAction(named: "Avancer") {
                    if index > 0 { onMove(d.id, devices[index - 1].id); onDrop() }
                }
                .accessibilityAction(named: "Reculer") {
                    if index + 1 < devices.count { onMove(d.id, devices[index + 1].id); onDrop() }
                }
        } else {
            base
        }
    }

    @discardableResult
    private func finishDrag() -> Bool {
        guard dragging != nil else { return false }
        dragging = nil
        drops += 1
        onDrop()
        return true
    }
}

/// Réordonne en direct quand la tuile glissée survole une autre tuile.
private struct TileDropDelegate: DropDelegate {
    var target: String
    @Binding var dragging: String?
    var move: (String, String) -> Void
    var drop: () -> Bool

    func dropEntered(info: DropInfo) {
        guard let id = dragging, id != target else { return }
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { move(id, target) }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? { DropProposal(operation: .move) }

    func performDrop(info: DropInfo) -> Bool { drop() }
}

struct DeviceTile: View {
    var device: Device
    var reordering = false
    var onToggle: () -> Void
    var onOpen: () -> Void

    @State private var taps = 0
    @State private var opens = 0

    private var on: Bool { device.state.on == true && device.state.reachable }
    private var glow: Color { DeviceStyle.glow(for: device) }

    private var stateText: String {
        HomeText.deviceState(device)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                DeviceIconBubble(device: device, size: 46)
                Spacer(minLength: 4)
                if reordering {
                    Image(systemName: "line.3.horizontal")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white.opacity(0.85))
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(.white.opacity(0.16)))
                        .frame(width: 44, height: 44, alignment: .topTrailing)
                        .accessibilityHidden(true)
                } else {
                    Button {
                        opens += 1
                        onOpen()
                    } label: {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.7))
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(.white.opacity(0.1)))
                            .frame(width: 44, height: 44, alignment: .topTrailing)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Réglages de \(device.name)")
                }
            }
            Spacer(minLength: 14)
            Text(device.name)
                .font(.system(.headline, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.85)
            Text(stateText)
                .font(.system(.subheadline, design: .rounded).weight(.medium))
                .foregroundStyle(on ? glow.mix(with: .white, by: 0.45) : .white.opacity(0.5))
                .lineLimit(2)
                .contentTransition(.numericText())
                .padding(.top, 2)
            if !device.state.reachable {
                Text("Interrupteur coupé ?")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(.white.opacity(0.45))
                    .lineLimit(1)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 148, alignment: .leading)
        .glassCard(radius: 28, tint: on ? glow : .clear, amount: on ? 0.30 : 0)
        .background {
            // Halo diffus derrière la carte quand l'appareil est allumé.
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(glow.opacity(on ? 0.35 : 0))
                .blur(radius: 22)
                .offset(y: 8)
        }
        .saturation(device.state.reachable ? 1 : 0)
        .opacity(device.state.reachable ? 1 : 0.6)
        .overlay {
            if reordering {
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .strokeBorder(.white.opacity(0.35), style: StrokeStyle(lineWidth: 1.2, dash: [6, 5]))
            }
        }
        .modifier(Jiggle(active: reordering, seed: device.id))
        .contentShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .modifier(TileGestures(enabled: !reordering, tap: {
            taps += 1
            if device.state.reachable { onToggle() } else { onOpen() }
        }, longPress: {
            opens += 1
            onOpen()
        }))
        .sensoryFeedback(.impact(weight: .medium, intensity: 0.9), trigger: taps)
        .sensoryFeedback(.impact(weight: .light), trigger: opens)
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: on)
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: device.state.brightness)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(device.name), \(device.room)")
        .accessibilityValue(device.state.reachable ? stateText : "Injoignable, interrupteur coupé ?")
        .accessibilityHint(reordering ? "Glissez pour déplacer, ou utilisez les actions Avancer / Reculer." : device.state.reachable ? "Touchez deux fois pour allumer ou éteindre." : "")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { onToggle() }
        .accessibilityAction(named: "Réglages") { onOpen() }
    }
}

/// Toucher = basculer, appui long = fiche ; rien en mode « Organiser » (le glisser prend le relais).
private struct TileGestures: ViewModifier {
    var enabled: Bool
    var tap: () -> Void
    var longPress: () -> Void

    func body(content: Content) -> some View {
        if enabled {
            content
                .onTapGesture(perform: tap)
                .onLongPressGesture(minimumDuration: 0.35, perform: longPress)
        } else {
            content
        }
    }
}

/// Léger tremblement des tuiles en mode « Organiser » (désactivé avec Réduire les animations).
private struct Jiggle: ViewModifier {
    var active: Bool
    var seed: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if active && !reduceMotion {
            // Phase propre à chaque tuile pour qu'elles ne tremblent pas à l'unisson.
            let phase = Double(seed.unicodeScalars.reduce(0) { $0 &+ Int($1.value) } % 100) / 100
            content.phaseAnimator([false, true]) { view, tilted in
                view.rotationEffect(.degrees(tilted ? 0.9 : -0.9))
            } animation: { _ in
                .easeInOut(duration: 0.13 + phase * 0.04)
            }
        } else {
            content
        }
    }
}

/// Pastille d'icône : teintée par la couleur de la lampe, ventilateur qui tourne.
struct DeviceIconBubble: View {
    var device: Device
    var size: CGFloat

    private var on: Bool { device.state.on == true && device.state.reachable }

    var body: some View {
        let glow = DeviceStyle.glow(for: device)
        ZStack {
            Circle()
                .fill(on ? AnyShapeStyle(glow.gradient) : AnyShapeStyle(Color.white.opacity(0.1)))
                .shadow(color: on ? glow.opacity(0.7) : .clear, radius: size * 0.3)
            if device.kind == .fan {
                SpinningSymbol(name: DeviceStyle.symbol(for: device), spinning: on,
                               speed: device.state.speed ?? 0)
                    .font(.system(size: size * 0.44, weight: .semibold))
                    .foregroundStyle(on ? Color.black.opacity(0.75) : .white.opacity(0.75))
            } else {
                Image(systemName: device.state.reachable ? DeviceStyle.symbol(for: device) : "bolt.slash.fill")
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundStyle(on ? Color.black.opacity(0.75) : .white.opacity(0.75))
                    .symbolEffect(.bounce, value: on)
                    .contentTransition(.symbolEffect(.replace))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Symbole qui tourne à une vitesse proportionnelle (ventilateur).
struct SpinningSymbol: View {
    var name: String
    var spinning: Bool
    var speed: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: !spinning || reduceMotion)) { tl in
            let t = tl.date.timeIntervalSinceReferenceDate
            let degreesPerSecond = 90 + speed * 9
            Image(systemName: name)
                .rotationEffect(spinning && !reduceMotion ? .degrees((t * degreesPerSecond).truncatingRemainder(dividingBy: 360)) : .zero)
        }
    }
}
