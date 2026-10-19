import Foundation

/// Lien d'appairage encodé dans le QR code de `pnpm pair` : `http://<ip>:8787/pair?code=XXXXXX`.
struct PairLink: Equatable, Sendable {
    /// Base du bridge, sans « / » final : `http://192.168.1.20:8787`.
    var bridgeURL: URL
    /// Code à 6 chiffres, s'il est présent.
    var code: String?

    /// Accepte l'URL complète du QR code, une simple adresse (« 192.168.1.20:8787 ») ou une URL de base.
    static func parse(_ raw: String) -> PairLink? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let withScheme = trimmed.contains("://") ? trimmed : "http://" + trimmed
        guard let comps = URLComponents(string: withScheme),
              let scheme = comps.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = comps.host, !host.isEmpty else { return nil }
        var base = URLComponents()
        base.scheme = scheme
        base.host = host
        base.port = comps.port
        guard let url = base.url else { return nil }
        let code = comps.queryItems?.first { $0.name == "code" }?.value.flatMap(normalizeCode)
        return PairLink(bridgeURL: url, code: code)
    }

    /// Garde les chiffres ; renvoie le code s'il en contient exactement 6.
    static func normalizeCode(_ raw: String) -> String? {
        let digits = raw.filter(\.isASCII).filter(\.isNumber)
        return digits.count == 6 ? digits : nil
    }

    /// Normalise une adresse saisie à la main en URL de base (http par défaut, port 8787 si absent).
    static func baseURL(from raw: String, defaultPort: Int = 8787) -> URL? {
        guard var link = parse(raw) else { return nil }
        if var comps = URLComponents(url: link.bridgeURL, resolvingAgainstBaseURL: false), comps.port == nil,
           !raw.contains("://") {
            comps.port = defaultPort
            link.bridgeURL = comps.url ?? link.bridgeURL
        }
        return link.bridgeURL
    }
}
