import SwiftUI

/// Résumé d'un appartement (pièces, murs, ouvertures, objets) et export / partage.
struct ProjectSummaryView: View {
    let project: ScanProject
    var uploader: any ScanUploader = StubScanUploader()

    @Environment(ProjectStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var uploading = false
    @State private var uploadMessage: String?
    @State private var confirmDelete = false

    private var summary: ScanSummary { project.summary }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if project.isDemo {
                    NoticeLine(symbol: "sparkles", color: Theme.slate,
                               text: "Données de démonstration : exemple embarqué, pas un vrai scan.")
                }
                if !summary.fromMergedStructure && summary.roomCount > 1 {
                    NoticeLine(symbol: "exclamationmark.triangle", color: Theme.terracotta,
                               text: "Fusion multi-pièces indisponible : les pièces sont exportées séparément.")
                }
                statsGrid
                roomsCard
                objectsCard
                exportCard
            }
            .padding(20)
        }
        .background(Theme.cream.ignoresSafeArea())
        .navigationTitle(project.name)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    ShareLink(item: store.envelopeURL(for: project)) {
                        Label("Partager le fichier", systemImage: "square.and.arrow.up")
                    }
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Label("Supprimer", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .confirmationDialog("Supprimer cet appartement ?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) {
                store.delete(project)
                dismiss()
            }
        }
    }

    private var statsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatTile(symbol: "square.split.bottomrightquarter", value: summary.roomCount, label: "Pièces", color: Theme.terracotta)
            StatTile(symbol: "rectangle.portrait", value: summary.walls, label: "Murs", color: Theme.slate)
            StatTile(symbol: "door.left.hand.open", value: summary.doors + summary.openings,
                     label: summary.openings > 0 ? "Portes et passages" : "Portes", color: Theme.sage)
            StatTile(symbol: "window.casement", value: summary.windows, label: "Fenêtres", color: Theme.slate)
        }
    }

    private var roomsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Pièces").font(.headline).foregroundStyle(Theme.ink)
            ForEach(Array(project.roomNames.enumerated()), id: \.offset) { index, name in
                HStack {
                    Text("\(index + 1)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(Theme.terracotta, in: Circle())
                    Text(name).foregroundStyle(Theme.ink)
                    Spacer()
                }
            }
        }
        .card()
    }

    private var objectsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Objets détectés").font(.headline).foregroundStyle(Theme.ink)
                Spacer()
                Text("\(summary.objectCount)").font(.headline).foregroundStyle(Theme.inkSoft)
            }
            if summary.objectsByCategory.isEmpty {
                Text("Aucun meuble détecté.").font(.subheadline).foregroundStyle(Theme.inkSoft)
            }
            ForEach(sortedCategories, id: \.key) { key, count in
                HStack(spacing: 12) {
                    Image(systemName: FrenchLabels.objectSymbol(key))
                        .foregroundStyle(Theme.sage)
                        .frame(width: 28)
                    Text(FrenchLabels.objectName(key)).foregroundStyle(Theme.ink)
                    Spacer()
                    Text("× \(count)").monospacedDigit().foregroundStyle(Theme.inkSoft)
                }
            }
        }
        .card()
    }

    private var exportCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Exporter").font(.headline).foregroundStyle(Theme.ink)
            Text("Envoyez le fichier par AirDrop sur votre Mac, puis glissez-le dans l'application web Appart3D.")
                .font(.footnote)
                .foregroundStyle(Theme.inkSoft)

            ShareLink(item: store.envelopeURL(for: project)) {
                Label("Partager \(project.envelopeFileName)", systemImage: "square.and.arrow.up")
                    .lineLimit(1)
            }
            .buttonStyle(PrimaryButtonStyle())

            let usdz = store.usdzURLs(for: project)
            if !usdz.isEmpty {
                ShareLink(items: usdz) {
                    Label(usdz.count > 1 ? "Partager les modèles USDZ" : "Partager le modèle USDZ",
                          systemImage: "cube")
                }
                .buttonStyle(SecondaryButtonStyle())
            }

            Button {
                Task { await upload() }
            } label: {
                HStack {
                    if uploading { ProgressView() }
                    Label("Envoyer en ligne", systemImage: "icloud.and.arrow.up")
                }
            }
            .buttonStyle(SecondaryButtonStyle(color: Theme.inkSoft))
            .disabled(uploading)

            if let uploadMessage {
                Text(uploadMessage).font(.footnote).foregroundStyle(Theme.inkSoft)
            }
        }
        .card()
    }

    private var sortedCategories: [(key: String, value: Int)] {
        summary.objectsByCategory.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }
    }

    private func upload() async {
        uploading = true
        defer { uploading = false }
        do {
            let url = try await uploader.upload(envelopeURL: store.envelopeURL(for: project),
                                                usdzURLs: store.usdzURLs(for: project),
                                                projectName: project.name)
            uploadMessage = url.map { "Envoyé : \($0.absoluteString)" } ?? "Envoyé."
        } catch {
            uploadMessage = error.localizedDescription
        }
    }
}

private struct StatTile: View {
    let symbol: String
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(color)
            Text("\(value)")
                .font(.system(.title, design: .rounded, weight: .bold))
                .foregroundStyle(Theme.ink)
            Text(label).font(.footnote).foregroundStyle(Theme.inkSoft)
        }
        .card()
    }
}

private struct NoticeLine: View {
    let symbol: String
    let color: Color
    let text: String

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.footnote)
            .foregroundStyle(Theme.ink)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
