import Foundation

/// Ambiance jour / nuit (maquette 3D, fond de l'app, économiseur) d'après le soleil du pont.
/// Même courbe que la maquette web : plein jour au-dessus de +6°, pleine nuit sous −6°, crépuscule entre les deux.
enum Daylight {
    static let dayElevation = 6.0
    static let nightElevation = -6.0

    /// Mode enregistré dans les réglages (`maison.night3D`) ; valeur inconnue → auto.
    static func mode(_ raw: String) -> DaylightMode { DaylightMode(rawValue: raw) ?? .auto }

    private static func smoothstep(_ x: Double) -> Double {
        let t = min(1, max(0, x))
        return t * t * (3 - 2 * t)
    }

    /// 0 (nuit) … 1 (plein jour) selon l'élévation du soleil.
    static func dayMix(elevation: Double) -> Double {
        smoothstep((elevation - nightElevation) / (dayElevation - nightElevation))
    }

    /// Lueur dorée du crépuscule (0…1), maximale quand le soleil est à l'horizon.
    static func dusk(elevation: Double) -> Double {
        smoothstep(1 - abs(elevation) / 8)
    }

    /// Repli sans soleil connu : plein jour de 7 h 30 à 18 h 30, transitions d'une heure autour.
    static func dayMix(hour h: Double) -> Double {
        if h < 6.5 || h > 19.5 { return 0 }
        if h < 7.5 { return smoothstep(h - 6.5) }
        if h > 18.5 { return smoothstep(19.5 - h) }
        return 1
    }

    static func fractionalHour(_ date: Date, calendar: Calendar = .current) -> Double {
        let c = calendar.dateComponents([.hour, .minute], from: date)
        return Double(c.hour ?? 12) + Double(c.minute ?? 0) / 60
    }

    /// Ambiance effective : (jour 0…1, crépuscule 0…1).
    static func ambiance(mode: DaylightMode, sun: SunInfo?, date: Date = Date()) -> (day: Double, dusk: Double) {
        switch mode {
        case .day: return (1, 0)
        case .night: return (0, 0)
        case .auto:
            if let sun { return (dayMix(elevation: sun.elevation), dusk(elevation: sun.elevation)) }
            let h = fractionalHour(date)
            let d = dayMix(hour: h)
            return (d, d > 0 && d < 1 ? 0.6 : 0)
        }
    }

    /// Nuit au sens « baisser la luminosité / assombrir » (économiseur d'écran).
    static func isNight(mode: DaylightMode, sun: SunInfo?, date: Date = Date()) -> Bool {
        switch mode {
        case .day: return false
        case .night: return true
        case .auto:
            if let sun { return !sun.isDay }
            let h = Calendar.current.component(.hour, from: date)
            return h >= 19 || h < 7
        }
    }
}
