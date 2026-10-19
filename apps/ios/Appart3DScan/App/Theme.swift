import SwiftUI

/// Palette chaleureuse, cohérente avec le web : crème, terracotta, sauge, bleu ardoise.
enum Theme {
    static let cream = Color(hex: 0xF6EFE4)
    static let creamDeep = Color(hex: 0xEDE2D1)
    static let card = Color(hex: 0xFFFBF5)
    static let terracotta = Color(hex: 0xC8664A)
    static let sage = Color(hex: 0x8FA98A)
    static let slate = Color(hex: 0x4F6D8A)
    static let ink = Color(hex: 0x2E2A26)
    static let inkSoft = Color(hex: 0x6E655C)

    static let corner: CGFloat = 20
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.corner, style: .continuous))
            .shadow(color: Theme.ink.opacity(0.06), radius: 12, y: 4)
    }
}

extension View {
    func card() -> some View { modifier(CardModifier()) }
}

struct PrimaryButtonStyle: ButtonStyle {
    var color: Color = Theme.terracotta

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(color.opacity(configuration.isPressed ? 0.8 : 1),
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.snappy(duration: 0.15), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    var color: Color = Theme.slate

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(color)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(color.opacity(configuration.isPressed ? 0.18 : 0.12),
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
