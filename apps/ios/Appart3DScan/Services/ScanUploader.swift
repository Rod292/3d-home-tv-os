import Foundation

/// Point d'extension pour un futur backend (ex. Supabase : comptes, stockage, partage).
protocol ScanUploader: Sendable {
    /// Envoie l'enveloppe (et les USDZ éventuels) ; renvoie une URL de partage si le backend en fournit une.
    func upload(envelopeURL: URL, usdzURLs: [URL], projectName: String) async throws -> URL?
}

enum ScanUploadError: LocalizedError {
    case notAvailable

    var errorDescription: String? {
        switch self {
        case .notAvailable:
            "L'envoi en ligne arrive bientôt. En attendant, partagez le fichier par AirDrop vers votre Mac."
        }
    }
}

/// Implémentation factice : simule une latence réseau puis signale que le service n'existe pas encore.
struct StubScanUploader: ScanUploader {
    func upload(envelopeURL: URL, usdzURLs: [URL], projectName: String) async throws -> URL? {
        try await Task.sleep(for: .milliseconds(600))
        throw ScanUploadError.notAvailable
    }
}
