import SwiftUI

struct DeviceDetailSheet: View {
    var deviceId: String
    @Environment(HomeStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var scroll = ScrollPosition(edge: .top)

    var body: some View {
        Group {
            if let device = store.device(deviceId) {
                content(device)
                    .presentationDetents(detents(for: device))
                    .presentationBackground { SheetBackground(device: device) }
            } else {
                ContentUnavailableView("Appareil introuvable", systemImage: "questionmark.circle")
                    .presentationDetents([.medium])
            }
        }
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(36)
        // iPad : fiche centrée façon formulaire plutôt que plein écran.
        .presentationSizing(.form)
        .preferredColorScheme(.dark)
    }

    private func detents(for d: Device) -> Set<PresentationDetent> {
        switch d.kind {
        case .plug: [.medium, .large]
        case .fan: [.fraction(0.78), .large]
        default: [.large]
        }
    }

    @ViewBuilder
    private func content(_ device: Device) -> some View {
        ScrollView {
            VStack(spacing: 24) {
                DetailHeader(device: device) { dismiss() }
                if !device.state.reachable {
                    UnreachableNotice()
                }
                Group {
                    switch device.kind {
                    case .light: LightDetail(device: device)
                    case .plug: PlugDetail(device: device)
                    case .fan: FanDetail(device: device)
                    case .tv: TVDetail(device: device)
                    case .speaker: SpeakerDetail(device: device)
                    default: PlugDetail(device: device)
                    }
                }
                .disabled(!device.state.reachable)
                .opacity(device.state.reachable ? 1 : 0.45)
            }
            .padding(.horizontal, 22)
            .padding(.top, 22)
            .padding(.bottom, 30)
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize)
        .scrollPosition($scroll)
        #if DEBUG
        // Captures : `-detailScrolled` fait défiler la fiche jusqu'en bas.
        .task {
            guard ProcessInfo.processInfo.arguments.contains("-detailScrolled") else { return }
            try? await Task.sleep(for: .milliseconds(1200))
            withAnimation { scroll.scrollTo(edge: .bottom) }
        }
        #endif
    }
}

struct SheetBackground: View {
    var device: Device
    var body: some View {
        let glow = DeviceStyle.glow(for: device)
        let on = device.state.on == true && device.state.reachable
        ZStack {
            LinearGradient(colors: [Color(hex: "#151032"), Color(hex: "#1f0f2e")], startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [glow.opacity(on ? 0.42 : 0), .clear], center: .top, startRadius: 0, endRadius: 460)
                .animation(.smooth(duration: 0.6), value: glow)
        }
        .ignoresSafeArea()
    }
}

struct DetailHeader: View {
    var device: Device
    var close: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            DeviceIconBubble(device: device, size: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text(device.name)
                    .font(.system(.title2, design: .rounded).weight(.bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(device.room.isEmpty ? "Maison" : device.room)
                    .font(.system(.subheadline, design: .rounded).weight(.medium))
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            Spacer()
            Button(action: close) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white.opacity(0.8))
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(.white.opacity(0.12)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Fermer")
        }
    }
}

struct UnreachableNotice: View {
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "bolt.slash.fill")
                .font(.title3)
                .foregroundStyle(Theme.amber)
            VStack(alignment: .leading, spacing: 2) {
                Text("Injoignable (interrupteur coupé ?)")
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                Text("Rallumez l'interrupteur mural, la lampe réapparaîtra d'elle-même.")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .glassCard(radius: 20)
        .accessibilityElement(children: .combine)
    }
}

/// Grand bouton marche/arrêt circulaire.
struct PowerToggleButton: View {
    var on: Bool
    var tint: Color
    var size: CGFloat = 64
    var action: () -> Void
    @State private var taps = 0

    var body: some View {
        Button {
            taps += 1
            action()
        } label: {
            Image(systemName: "power")
                .font(.system(size: size * 0.38, weight: .bold))
                .foregroundStyle(on ? Color.black.opacity(0.8) : .white)
                .frame(width: size, height: size)
                .background(Circle().fill(on ? AnyShapeStyle(tint.gradient) : AnyShapeStyle(Color.white.opacity(0.12))))
                .overlay(Circle().strokeBorder(.white.opacity(on ? 0.35 : 0.15), lineWidth: 1))
                .shadow(color: on ? tint.opacity(0.7) : .clear, radius: size * 0.35)
        }
        .buttonStyle(PressableStyle())
        .symbolEffect(.bounce, value: taps)
        .sensoryFeedback(.impact(weight: .heavy), trigger: taps)
        .accessibilityLabel(on ? "Éteindre" : "Allumer")
        .animation(.spring(duration: 0.35), value: on)
    }
}

struct SectionTitle: View {
    var text: String
    var body: some View {
        Text(text)
            .font(.system(.footnote, design: .rounded).weight(.semibold))
            .textCase(.uppercase)
            .tracking(0.8)
            .foregroundStyle(.white.opacity(0.55))
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}
