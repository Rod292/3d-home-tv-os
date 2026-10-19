import SwiftUI

struct LightDetail: View {
    var device: Device
    @Environment(HomeStore.self) private var store
    @State private var level: Double = 0
    @State private var dragging = false
    @State private var picks = 0

    static let swatches: [(String, String)] = [
        ("#ff8a1f", "Ambre"), ("#ff4f3d", "Rouge"), ("#ff5fa2", "Rose"), ("#b45bff", "Violet"),
        ("#4b1fd1", "Indigo"), ("#3d8bff", "Bleu"), ("#2fd4c4", "Turquoise"), ("#7ee06b", "Vert"),
    ]
    static let whites: [(Int, String)] = [(2200, "Bougie"), (2700, "Chaud"), (4000, "Neutre"), (6500, "Jour")]

    private var on: Bool { device.state.on == true }
    private var tint: Color { on ? DeviceStyle.glow(for: device) : Theme.amber }
    private var dimmable: Bool { device.capabilities.brightness == true }
    private var displayed: Int { on ? Int(level.rounded()) : 0 }

    var body: some View {
        VStack(spacing: 26) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text("\(displayed)")
                            .font(.system(size: 76, weight: .bold, design: .rounded))
                            .contentTransition(.numericText(value: Double(displayed)))
                            .monospacedDigit()
                        Text("%")
                            .font(.system(size: 32, weight: .semibold, design: .rounded))
                            .foregroundStyle(.white.opacity(0.6))
                    }
                    Text(on ? "Luminosité" : "Éteinte")
                        .font(.system(.subheadline, design: .rounded).weight(.medium))
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                Spacer()
                PowerToggleButton(on: on, tint: tint) { store.toggle(device.id) }
            }
            .animation(.snappy, value: displayed)

            if dimmable {
                BrightnessSlider(value: $level, tint: tint, isOn: on, dragging: $dragging) { v in
                    store.performThrottled(.brightness(max(1, v)), on: device.id, key: "brightness")
                }
                .frame(width: 128, height: 340)
                .frame(maxWidth: .infinity)
            }

            if device.capabilities.color == true {
                VStack(spacing: 12) {
                    SectionTitle(text: "Couleurs")
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 14) {
                        ForEach(Self.swatches, id: \.0) { hex, name in
                            swatch(hex: hex, name: name)
                        }
                    }
                }
            }

            if device.capabilities.kelvin == true || device.capabilities.color == true {
                VStack(spacing: 12) {
                    SectionTitle(text: "Blancs")
                    HStack(spacing: 10) {
                        ForEach(Self.whites, id: \.0) { k, name in
                            whitePreset(kelvin: k, name: name)
                        }
                    }
                }
            }
        }
        .sensoryFeedback(.selection, trigger: picks)
        .onAppear { level = device.state.brightness ?? (on ? 100 : 0) }
        .onChange(of: device.state.brightness) { _, new in
            if !dragging, let new { withAnimation(.smooth) { level = new } }
        }
    }

    private func isCurrent(hex: String) -> Bool {
        on && device.state.kelvin == nil && device.state.color?.lowercased() == hex.lowercased()
    }

    private func swatch(hex: String, name: String) -> some View {
        let selected = isCurrent(hex: hex)
        return Button {
            picks += 1
            store.perform(.color(hex), on: device.id)
        } label: {
            Circle()
                .fill(Color(hex: hex).gradient)
                .frame(width: 52, height: 52)
                .overlay(Circle().strokeBorder(.white.opacity(selected ? 0.95 : 0.15), lineWidth: selected ? 3 : 1))
                .padding(4)
                .overlay(Circle().strokeBorder(Color(hex: hex).opacity(selected ? 0.6 : 0), lineWidth: 2))
                .shadow(color: Color(hex: hex).opacity(selected ? 0.8 : 0.25), radius: selected ? 12 : 6)
                .scaleEffect(selected ? 1.05 : 1)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(name)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .animation(.spring(duration: 0.3), value: selected)
    }

    private func whitePreset(kelvin: Int, name: String) -> some View {
        let hex = ColorMath.kelvinToHex(Double(kelvin))
        let selected = on && device.state.kelvin.map { abs($0 - Double(kelvin)) < 250 } == true
        return Button {
            picks += 1
            if device.capabilities.kelvin == true {
                store.perform(.kelvin(kelvin), on: device.id)
            } else {
                store.perform(.color(hex), on: device.id)
            }
        } label: {
            VStack(spacing: 6) {
                Circle()
                    .fill(Color(hex: hex).gradient)
                    .frame(width: 26, height: 26)
                    .shadow(color: Color(hex: hex).opacity(0.6), radius: 6)
                Text(name)
                    .font(.system(.caption, design: .rounded).weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text("\(kelvin) K")
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .glassCard(radius: 18, tint: Color(hex: hex), amount: selected ? 0.35 : 0)
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(selected ? 0.7 : 0), lineWidth: 1.5))
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel("Blanc \(name), \(kelvin) kelvins")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Curseur vertical « façon Hue » : glisser relatif, remplissage teinté, retour haptique tous les 10 %.
struct BrightnessSlider: View {
    @Binding var value: Double
    var tint: Color
    var isOn: Bool
    @Binding var dragging: Bool
    var onChange: (Int) -> Void

    @State private var start: Double?

    var body: some View {
        GeometryReader { geo in
            let h = geo.size.height
            let fill = isOn ? max(0.04, value / 100) : 0
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: 38, style: .continuous)
                    .fill(.ultraThinMaterial)
                Rectangle()
                    .fill(LinearGradient(colors: [tint.mix(with: .white, by: 0.25), tint], startPoint: .top, endPoint: .bottom))
                    .frame(height: h * fill)
                    .shadow(color: tint.opacity(0.8), radius: 20)
                VStack {
                    Image(systemName: "sun.max.fill")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(fill > 0.85 ? Color.black.opacity(0.6) : .white.opacity(0.7))
                        .padding(.top, 22)
                    Spacer()
                    Image(systemName: "sun.min.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(fill > 0.08 ? Color.black.opacity(0.55) : .white.opacity(0.6))
                        .padding(.bottom, 22)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 38, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 38, style: .continuous).strokeBorder(.white.opacity(0.18), lineWidth: 1))
            .shadow(color: tint.opacity(isOn ? 0.35 : 0), radius: 30, y: 10)
            .scaleEffect(dragging ? 1.03 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.75), value: dragging)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        if start == nil {
                            start = isOn ? value : 0
                            dragging = true
                        }
                        let delta = -g.translation.height / h * 100
                        let v = min(100, max(1, (start ?? 0) + delta))
                        if Int(v) != Int(value) || !isOn {
                            value = v
                            onChange(Int(v.rounded()))
                        }
                    }
                    .onEnded { _ in
                        start = nil
                        dragging = false
                        onChange(Int(value.rounded()))
                    }
            )
        }
        .sensoryFeedback(.selection, trigger: Int(value / 10))
        .accessibilityElement()
        .accessibilityLabel("Luminosité")
        .accessibilityValue(isOn ? "\(Int(value)) %" : "Éteinte")
        .accessibilityAdjustableAction { direction in
            let step: Double = direction == .increment ? 10 : -10
            value = min(100, max(1, (isOn ? value : 0) + step))
            onChange(Int(value))
        }
    }
}
