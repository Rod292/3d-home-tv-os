import Foundation
import Observation

/// Persistance simple en fichiers : `Documents/Projets/<id>/{projet.json, <nom>.appart3d.json, *.usdz}`.
@MainActor
@Observable
final class ProjectStore {
    private(set) var projects: [ScanProject] = []
    private(set) var lastError: String?

    @ObservationIgnored let rootURL: URL
    @ObservationIgnored private let fileManager = FileManager.default
    static let metadataFileName = "projet.json"

    init(rootURL: URL? = nil) {
        self.rootURL = rootURL ?? URL.documentsDirectory.appending(path: "Projets", directoryHint: .isDirectory)
        reload()
    }

    func reload() {
        do {
            try fileManager.createDirectory(at: rootURL, withIntermediateDirectories: true)
            let folders = try fileManager.contentsOfDirectory(at: rootURL, includingPropertiesForKeys: nil)
            let decoder = Self.decoder
            projects = folders.compactMap { folder in
                let url = folder.appending(path: Self.metadataFileName)
                guard let data = try? Data(contentsOf: url) else { return nil }
                return try? decoder.decode(ScanProject.self, from: data)
            }
            .sorted { $0.createdAt > $1.createdAt }
        } catch {
            lastError = "Impossible de lire les projets : \(error.localizedDescription)"
        }
    }

    func folder(for id: UUID) -> URL {
        rootURL.appending(path: id.uuidString, directoryHint: .isDirectory)
    }

    func makeFolder(for id: UUID) throws -> URL {
        let url = folder(for: id)
        try fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    func envelopeURL(for project: ScanProject) -> URL {
        folder(for: project.id).appending(path: project.envelopeFileName)
    }

    func usdzURLs(for project: ScanProject) -> [URL] {
        project.usdzFileNames
            .map { folder(for: project.id).appending(path: $0) }
            .filter { fileManager.fileExists(atPath: $0.path(percentEncoded: false)) }
    }

    /// Écrit les métadonnées (l'enveloppe et les USDZ doivent déjà être dans le dossier).
    func register(_ project: ScanProject) throws {
        let data = try Self.encoder.encode(project)
        try data.write(to: folder(for: project.id).appending(path: Self.metadataFileName), options: .atomic)
        projects.removeAll { $0.id == project.id }
        projects.insert(project, at: 0)
    }

    func delete(_ project: ScanProject) {
        do {
            try fileManager.removeItem(at: folder(for: project.id))
        } catch {
            lastError = "Suppression impossible : \(error.localizedDescription)"
        }
        projects.removeAll { $0.id == project.id }
    }

    /// Supprime un dossier de projet inachevé (scan annulé ou export échoué).
    func discardFolder(for id: UUID) {
        try? fileManager.removeItem(at: folder(for: id))
    }

    func clearError() { lastError = nil }

    private static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }

    private static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
