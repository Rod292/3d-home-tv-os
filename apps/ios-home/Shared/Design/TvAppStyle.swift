import SwiftUI

/// Couleurs de marque et symboles des applis de la télé (équivalent de apps/web/src/lib/tvCard.ts).
enum TvAppStyle {
    struct Brand: Equatable, Sendable {
        /// Dégradé de fond (haut-gauche → bas-droite).
        var bg: (String, String)
        /// Couleur du texte / symbole.
        var fg: String
        /// Accent (liseré de l'appli au premier plan).
        var accent: String
        var symbol: String

        static func == (a: Brand, b: Brand) -> Bool {
            a.bg.0 == b.bg.0 && a.bg.1 == b.bg.1 && a.fg == b.fg && a.accent == b.accent && a.symbol == b.symbol
        }
    }

    private static func norm(_ s: String) -> String {
        s.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
            .lowercased()
            .filter { $0.isLetter || $0.isNumber || $0 == "+" }
    }

    /// Style d'une appli (paquet et / ou libellé).
    static func brand(id: String = "", label: String) -> Brand {
        let n = norm(label)
        let p = id.lowercased()
        func has(_ s: String) -> Bool { n.contains(s) }
        if has("netflix") || p.contains("netflix") { return Brand(bg: ("#000000", "#1a0306"), fg: "#e50914", accent: "#e50914", symbol: "play.tv.fill") }
        if has("youtubemusic") || p.contains("tvmusic") { return Brand(bg: ("#1a0000", "#0f0f0f"), fg: "#ffffff", accent: "#ff0000", symbol: "music.note") }
        if has("youtube") { return Brand(bg: ("#0f0f0f", "#2a0505"), fg: "#ffffff", accent: "#ff0000", symbol: "play.rectangle.fill") }
        if has("prime") || p.contains("amazonvideo") { return Brand(bg: ("#00050d", "#0f2a40"), fg: "#ffffff", accent: "#1399ff", symbol: "play.tv.fill") }
        if has("disney") { return Brand(bg: ("#0b1a5a", "#040714"), fg: "#ffffff", accent: "#3c7bff", symbol: "sparkles.tv.fill") }
        if has("canal") { return Brand(bg: ("#000000", "#1c1c1c"), fg: "#ffffff", accent: "#e8e8e8", symbol: "play.tv.fill") }
        if has("appletv") || p.contains("appletv") { return Brand(bg: ("#000000", "#2c2c2e"), fg: "#f5f5f7", accent: "#a1a1a6", symbol: "appletv.fill") }
        if has("spotify") { return Brand(bg: ("#121212", "#0c3b22"), fg: "#ffffff", accent: "#1db954", symbol: "music.note") }
        if has("francetv") || p.contains("francetv") { return Brand(bg: ("#1a1aff", "#0a0a6b"), fg: "#ffffff", accent: "#6f6fff", symbol: "tv.fill") }
        if has("tf1") { return Brand(bg: ("#0050ff", "#00268a"), fg: "#ffffff", accent: "#e2001a", symbol: "tv.fill") }
        if has("m6") { return Brand(bg: ("#00a3e0", "#005d85"), fg: "#ffffff", accent: "#7fdcff", symbol: "tv.fill") }
        if has("arte") { return Brand(bg: ("#fa481c", "#8a1f05"), fg: "#ffffff", accent: "#ff8a66", symbol: "theatermasks.fill") }
        if has("orange") { return Brand(bg: ("#ff7900", "#8a3c00"), fg: "#ffffff", accent: "#ffb066", symbol: "tv.fill") }
        if has("twitch") { return Brand(bg: ("#9146ff", "#3d1a7a"), fg: "#ffffff", accent: "#c7a3ff", symbol: "gamecontroller.fill") }
        if has("deezer") { return Brand(bg: ("#a238ff", "#3b0f66"), fg: "#ffffff", accent: "#d39bff", symbol: "music.note.list") }
        if has("googletv") || p.contains("android.videos") { return Brand(bg: ("#4285f4", "#173a7a"), fg: "#ffffff", accent: "#9fc1ff", symbol: "film.fill") }
        if has("playstore") || p == "com.android.vending" { return Brand(bg: ("#01875f", "#00402c"), fg: "#ffffff", accent: "#5fe0b5", symbol: "bag.fill") }
        if has("molotov") { return Brand(bg: ("#1d1d3b", "#0b0b1a"), fg: "#ffffff", accent: "#ff4f6d", symbol: "tv.fill") }
        if has("plex") { return Brand(bg: ("#1f1f1f", "#000000"), fg: "#e5a00d", accent: "#e5a00d", symbol: "play.square.stack.fill") }
        if has("vlc") { return Brand(bg: ("#ff8800", "#7a3d00"), fg: "#ffffff", accent: "#ffbb66", symbol: "play.circle.fill") }
        if has("kodi") { return Brand(bg: ("#17b2e7", "#0a4f66"), fg: "#ffffff", accent: "#7fdcff", symbol: "play.circle.fill") }
        if has("hdmi") { return Brand(bg: ("#1d2b40", "#0a111d"), fg: "#e8eef8", accent: "#7aa7ff", symbol: "cable.connector.horizontal") }
        if n == "tv" || p == "org.droidtv.playtv" || has("watchtv") { return Brand(bg: ("#12305a", "#08142a"), fg: "#ffffff", accent: "#4da3ff", symbol: "antenna.radiowaves.left.and.right") }
        return generic(label)
    }

    /// Appli inconnue : sa propre teinte, stable (même hachage que le web).
    static func generic(_ name: String) -> Brand {
        var h: UInt32 = 0
        for u in name.unicodeScalars { h = h &* 31 &+ u.value }
        let hue = Int(h % 360)
        return Brand(bg: (hsl(hue, 0.45, 0.22), hsl((hue + 40) % 360, 0.5, 0.09)), fg: "#ffffff", accent: hsl(hue, 0.8, 0.62), symbol: "app.fill")
    }

    /// HSL → « #rrggbb ».
    static func hsl(_ h: Int, _ s: Double, _ l: Double) -> String {
        let c = (1 - abs(2 * l - 1)) * s
        let hp = Double(h) / 60
        let x = c * (1 - abs(hp.truncatingRemainder(dividingBy: 2) - 1))
        let (r, g, b): (Double, Double, Double) = switch hp {
        case ..<1: (c, x, 0)
        case ..<2: (x, c, 0)
        case ..<3: (0, c, x)
        case ..<4: (0, x, c)
        case ..<5: (x, 0, c)
        default: (c, 0, x)
        }
        let m = l - c / 2
        func hex(_ v: Double) -> String { String(format: "%02x", Int(((v + m) * 255).rounded()).clamped(0, 255)) }
        return "#\(hex(r))\(hex(g))\(hex(b))"
    }

    /// Libellé de secours d'un paquet sans libellé (« com.example.super_app » → « Super app »).
    static func fallbackLabel(_ pkg: String) -> String {
        let skip: Set<String> = ["com", "android", "tv", "app", "org", "fr", "androidtv"]
        let last = pkg.split(separator: ".").map(String.init).filter { !skip.contains($0) }.last ?? pkg
        return last.replacingOccurrences(of: "_", with: " ").firstUppercased
    }
}

private extension Int {
    func clamped(_ a: Int, _ b: Int) -> Int { Swift.min(b, Swift.max(a, self)) }
}
