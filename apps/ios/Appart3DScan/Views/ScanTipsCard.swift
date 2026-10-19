import SwiftUI

/// Carte explicative : comment réussir un scan.
struct ScanTipsCard: View {
    @State private var expanded = true

    private let tips: [(String, String, String)] = [
        ("sun.max", "Bonne lumière", "Allumez les lampes et ouvrez les volets."),
        ("figure.walk", "Marchez lentement", "Des mouvements lents donnent des murs plus nets."),
        ("arrow.up.and.down.and.arrow.left.and.right", "Balayez tout", "Murs, sol et angles, jusqu'au plafond."),
        ("door.left.hand.closed", "Fermez les portes", "Elles seront détectées et la pièce reste bien délimitée."),
        ("square.split.2x2", "Pièce par pièce", "Scannez chaque pièce puis enchaînez sans quitter l'appli."),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button {
                withAnimation(.snappy) { expanded.toggle() }
            } label: {
                HStack {
                    Label("Comment ça marche", systemImage: "lightbulb.max")
                        .font(.headline)
                        .foregroundStyle(Theme.ink)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .rotationEffect(.degrees(expanded ? 0 : -90))
                        .foregroundStyle(Theme.inkSoft)
                }
            }
            .buttonStyle(.plain)

            if expanded {
                Text("L'iPhone mesure murs, portes, fenêtres et meubles grâce au LiDAR. Le fichier exporté se dépose ensuite dans l'application web Appart3D.")
                    .font(.footnote)
                    .foregroundStyle(Theme.inkSoft)
                ForEach(tips, id: \.1) { symbol, title, detail in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: symbol)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Theme.terracotta)
                            .frame(width: 32, height: 32)
                            .background(Theme.terracotta.opacity(0.12), in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                            Text(detail).font(.footnote).foregroundStyle(Theme.inkSoft)
                        }
                    }
                }
            }
        }
        .card()
    }
}
