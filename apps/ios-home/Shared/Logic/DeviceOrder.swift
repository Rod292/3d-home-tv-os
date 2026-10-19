import Foundation

/// Ordre partagé des tuiles (le pont renvoie les appareils déjà triés ; `PUT /api/home/order` le change).
enum DeviceOrder {
    /// Déplace `id` à la place de `target` dans l'ordre global : après lui si on descend, avant lui si on remonte.
    /// Dans une vue filtrée par pièce, `target` est un voisin visible : le déplacement se fait donc
    /// relativement à ses voisins dans la liste globale, et l'ordre filtré reste celui de la liste globale.
    static func move(_ id: String, onto target: String, in order: [String]) -> [String] {
        guard id != target, let from = order.firstIndex(of: id), order.contains(target) else { return order }
        var out = order
        out.remove(at: from)
        guard let t = out.firstIndex(of: target) else { return order }
        out.insert(id, at: from <= t ? t + 1 : t)
        return out
    }

    /// Range les appareils selon `ids` ; ceux qui n'y sont pas suivent, dans leur ordre actuel.
    static func apply(_ ids: [String], to devices: [Device]) -> [Device] {
        let rank = Dictionary(ids.enumerated().map { ($1, $0) }, uniquingKeysWith: { a, _ in a })
        return devices.enumerated()
            .sorted { a, b in
                let ra = rank[a.element.id] ?? ids.count + a.offset
                let rb = rank[b.element.id] ?? ids.count + b.offset
                return ra < rb
            }
            .map(\.element)
    }
}
