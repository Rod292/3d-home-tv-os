import SwiftUI

/// Fond de l'app : dégradé navy → prune, plus chaud quand des lumières sont allumées,
/// avec des halos lents (figés si Réduire les animations).
struct AmbientBackground: View {
    var warmth: Double
    var accent: Color
    /// 0 nuit … 1 plein jour (soleil du pont, cf. Daylight).
    var day: Double = 0
    /// Lueur du crépuscule 0…1.
    var dusk: Double = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20, paused: reduceMotion)) { tl in
            let t = reduceMotion ? 0 : tl.date.timeIntervalSinceReferenceDate
            ZStack {
                LinearGradient(colors: Theme.backgroundColors(warmth: warmth, day: day, dusk: dusk), startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [accent.opacity(0.10 + 0.32 * warmth), .clear],
                               center: UnitPoint(x: 0.25 + 0.06 * sin(t * 0.13), y: 0.12),
                               startRadius: 10, endRadius: 420)
                    .blendMode(.plusLighter)
                RadialGradient(colors: [Color(hex: "#5b3df5").opacity(0.18 * (1 - warmth * 0.6) * (1 - day * 0.7)), .clear],
                               center: UnitPoint(x: 0.85 + 0.05 * cos(t * 0.1), y: 0.55),
                               startRadius: 10, endRadius: 380)
                RadialGradient(colors: [Theme.ember.opacity(0.18 * warmth), .clear],
                               center: UnitPoint(x: 0.2, y: 0.95), startRadius: 0, endRadius: 360)
                // Soleil : halo chaud en haut à droite le jour, doré et bas au crépuscule.
                RadialGradient(colors: [Color(hex: "#ffd9a8").opacity(0.16 * day + 0.22 * dusk), .clear],
                               center: UnitPoint(x: 0.82, y: 0.08 + 0.3 * dusk), startRadius: 0, endRadius: 460)
                    .blendMode(.plusLighter)
            }
        }
        .ignoresSafeArea()
        .animation(.smooth(duration: 1.2), value: warmth)
        .animation(.smooth(duration: 2), value: day)
        .animation(.smooth(duration: 2), value: dusk)
    }
}

/// Carte « verre » arrondie.
struct GlassCard: ViewModifier {
    var radius: CGFloat = 26
    var tint: Color = .clear
    var tintAmount: Double = 0

    func body(content: Content) -> some View {
        content
            .background {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .fill(LinearGradient(colors: [tint.opacity(tintAmount), tint.opacity(tintAmount * 0.25)],
                                                 startPoint: .topLeading, endPoint: .bottomTrailing))
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .strokeBorder(LinearGradient(colors: [.white.opacity(0.22), .white.opacity(0.04)],
                                                         startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 0.8)
                    }
            }
    }
}

extension View {
    func glassCard(radius: CGFloat = 26, tint: Color = .clear, amount: Double = 0) -> some View {
        modifier(GlassCard(radius: radius, tint: tint, tintAmount: amount))
    }
}

/// Bandeau hors ligne.
struct OfflineBanner: View {
    var message: String
    var retry: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.amber)
                .symbolEffect(.pulse, options: .repeating)
            VStack(alignment: .leading, spacing: 1) {
                Text("Pas sur le Wi-Fi de la maison ?")
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                Text("Le pont est injoignable — dernier état affiché.")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Button("Réessayer", action: retry)
                .font(.system(.caption, design: .rounded).weight(.semibold))
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .glassCard(radius: 20, tint: Theme.ember, amount: 0.12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Hors ligne. Pas sur le Wi-Fi de la maison ? \(message)")
    }
}

/// Message transitoire en bas d'écran.
struct ToastView: View {
    var message: String
    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.system(.footnote, design: .rounded).weight(.medium))
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .glassCard(radius: 18)
            .padding(.horizontal, 24)
    }
}

/// Bouton circulaire « verre ».
struct CircleIconButton: View {
    var systemName: String
    var label: String
    var active: Bool = false
    var size: CGFloat = 44
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(active ? Color.black.opacity(0.85) : .white)
                .frame(width: size, height: size)
                .background {
                    Circle().fill(active ? AnyShapeStyle(Theme.amber) : AnyShapeStyle(.ultraThinMaterial))
                }
                .overlay(Circle().strokeBorder(.white.opacity(active ? 0 : 0.18), lineWidth: 0.8))
                .shadow(color: active ? Theme.amber.opacity(0.6) : .clear, radius: 14)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(label)
    }
}

/// Léger enfoncement au toucher.
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
