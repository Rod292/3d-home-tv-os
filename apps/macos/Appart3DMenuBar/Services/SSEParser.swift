import Foundation

/// Analyseur minimal de flux `text/event-stream` : on lui passe les lignes une à une,
/// il renvoie le contenu `data` d'un événement complet à chaque ligne vide.
struct SSEParser: Sendable {
    private var dataLines: [String] = []

    /// Renvoie la charge utile (lignes `data:` jointes par \n) quand un événement est terminé.
    mutating func feed(line rawLine: String) -> String? {
        let line = rawLine.hasSuffix("\r") ? String(rawLine.dropLast()) : rawLine
        if line.isEmpty {
            defer { dataLines.removeAll() }
            return dataLines.isEmpty ? nil : dataLines.joined(separator: "\n")
        }
        if line.hasPrefix(":") { return nil } // commentaire / keep-alive
        let field: Substring
        var value: Substring
        if let colon = line.firstIndex(of: ":") {
            field = line[..<colon]
            value = line[line.index(after: colon)...]
            if value.first == " " { value = value.dropFirst() }
        } else {
            field = Substring(line)
            value = ""
        }
        if field == "data" { dataLines.append(String(value)) }
        return nil
    }
}
