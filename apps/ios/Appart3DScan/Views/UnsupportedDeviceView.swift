import SwiftUI

/// Écran « appareil non compatible » (simulateur, iPhone sans LiDAR).
struct UnsupportedDeviceView: View {
    var onDemo: (() -> Void)?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 22) {
            Spacer()
            Image(systemName: "iphone.slash")
                .font(.system(size: 64, weight: .light))
                .foregroundStyle(Theme.slate)
                .padding(28)
                .background(Theme.slate.opacity(0.12), in: Circle())
            Text("Appareil non compatible")
                .font(.system(.title, design: .rounded, weight: .bold))
                .foregroundStyle(Theme.ink)
            Text("Le scan de pièces utilise RoomPlan et le capteur LiDAR, disponibles sur les iPhone Pro (12 Pro et suivants) et iPad Pro récents. Il ne fonctionne pas dans le simulateur.")
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.inkSoft)
            Spacer()
            if let onDemo {
                Button(action: onDemo) {
                    Label("Essayer le mode démo", systemImage: "sparkles")
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            Button("Fermer") { dismiss() }
                .buttonStyle(SecondaryButtonStyle())
        }
        .padding(24)
        .background(Theme.cream.ignoresSafeArea())
    }
}

#Preview {
    UnsupportedDeviceView(onDemo: {})
}
