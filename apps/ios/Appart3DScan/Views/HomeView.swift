import SwiftUI

/// Accueil : liste des appartements, création d'un scan, mode démo, conseils.
struct HomeView: View {
    @Environment(ProjectStore.self) private var store
    @State private var path: [ScanProject] = []
    @State private var askingName = false
    @State private var newName = ""
    @State private var activeScan: ScanSession?
    @State private var showUnsupported = false
    @State private var pendingDelete: ScanProject?

    private let isSupported = ScanSession.isSupported

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    if !isSupported { DeviceBanner { showUnsupported = true } }
                    actions
                    ScanTipsCard()
                    projectsSection
                }
                .padding(20)
            }
            .background(Theme.cream.ignoresSafeArea())
            .task {
                // Dév : `-openDemo` en argument de lancement ouvre directement le mode démo (simulateur).
                if ProcessInfo.processInfo.arguments.contains("-openDemo"), path.isEmpty { openDemo() }
            }
            .navigationDestination(for: ScanProject.self) { project in
                ProjectSummaryView(project: project)
            }
            .alert("Nouvel appartement", isPresented: $askingName) {
                TextField("Nom", text: $newName)
                Button("Annuler", role: .cancel) {}
                Button("Commencer") { startScan() }
            } message: {
                Text("Donnez un nom à ce scan. Vous scannerez ensuite les pièces une par une.")
            }
            .confirmationDialog("Supprimer « \(pendingDelete?.name ?? "") » ?",
                                isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                                titleVisibility: .visible) {
                Button("Supprimer", role: .destructive) {
                    if let pendingDelete { store.delete(pendingDelete) }
                }
            } message: {
                Text("Le fichier .appart3d.json et les modèles USDZ seront effacés de l'iPhone.")
            }
            .sheet(isPresented: $showUnsupported) {
                UnsupportedDeviceView(onDemo: { showUnsupported = false; openDemo() })
                    .presentationDetents([.large])
            }
            .fullScreenCover(item: $activeScan) { session in
                ScanFlowView(session: session) { project in
                    activeScan = nil
                    if let project { path = [project] }
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: "house.lodge.fill")
                    .font(.title2)
                    .foregroundStyle(Theme.terracotta)
                Text("Appart3D Scan")
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .foregroundStyle(Theme.ink)
            }
            Text("Scannez votre appartement, retrouvez-le en maquette 3D sur le web.")
                .font(.subheadline)
                .foregroundStyle(Theme.inkSoft)
        }
        .padding(.top, 8)
    }

    private var actions: some View {
        VStack(spacing: 12) {
            Button {
                newName = "Mon appartement"
                if isSupported { askingName = true } else { showUnsupported = true }
            } label: {
                Label("Nouvel appartement", systemImage: "viewfinder")
            }
            .buttonStyle(PrimaryButtonStyle())

            Button(action: openDemo) {
                Label("Mode démo", systemImage: "sparkles")
            }
            .buttonStyle(SecondaryButtonStyle())
        }
    }

    @ViewBuilder private var projectsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Mes appartements")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.ink)
            if store.projects.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "square.dashed")
                        .font(.largeTitle)
                        .foregroundStyle(Theme.sage)
                    Text("Aucun scan pour l'instant")
                        .font(.headline)
                        .foregroundStyle(Theme.ink)
                    Text("Vos appartements scannés apparaîtront ici, prêts à être partagés.")
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Theme.inkSoft)
                }
                .frame(maxWidth: .infinity)
                .card()
            } else {
                ForEach(store.projects) { project in
                    NavigationLink(value: project) {
                        ProjectRow(project: project)
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        ShareLink(item: store.envelopeURL(for: project)) {
                            Label("Partager le fichier", systemImage: "square.and.arrow.up")
                        }
                        Button(role: .destructive) { pendingDelete = project } label: {
                            Label("Supprimer", systemImage: "trash")
                        }
                    }
                }
            }
            if let error = store.lastError {
                Text(error).font(.footnote).foregroundStyle(Theme.terracotta)
            }
        }
    }

    private func startScan() {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        activeScan = ScanSession(projectName: name.isEmpty ? "Mon appartement" : name)
    }

    private func openDemo() {
        let id = UUID()
        do {
            let folder = try store.makeFolder(for: id)
            let project = try ScanExportService.exportDemo(id: id, name: "Appartement démo", folder: folder)
            try store.register(project)
            path = [project]
        } catch {
            store.discardFolder(for: id)
        }
    }
}

extension ScanSession: Identifiable {
    nonisolated var id: UUID { projectID }
}

private struct DeviceBanner: View {
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Image(systemName: "sensor.tag.radiowaves.forward")
                    .font(.title3)
                    .foregroundStyle(Theme.slate)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Appareil non compatible")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.ink)
                    Text("Le scan nécessite un iPhone ou iPad Pro avec LiDAR. Le mode démo reste disponible.")
                        .font(.caption)
                        .foregroundStyle(Theme.inkSoft)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(Theme.inkSoft)
            }
            .padding(14)
            .background(Theme.slate.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct ProjectRow: View {
    let project: ScanProject

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: project.isDemo ? "sparkles" : "cube.transparent")
                .font(.title2)
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .background(project.isDemo ? Theme.slate : Theme.sage,
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(project.name)
                    .font(.headline)
                    .foregroundStyle(Theme.ink)
                Text(FrenchLabels.plural(project.summary.roomCount, "pièce") + " · "
                     + FrenchLabels.plural(project.summary.objectCount, "objet"))
                    .font(.subheadline)
                    .foregroundStyle(Theme.inkSoft)
                Text(project.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundStyle(Theme.inkSoft.opacity(0.8))
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").foregroundStyle(Theme.inkSoft)
        }
        .card()
    }
}
