import Foundation

// Miroir Swift du contrat `@appart3d/home` (packages/home/src/index.ts).
// Le contrat n'évolue que de façon additive : les décodeurs tolèrent les champs inconnus
// et les valeurs d'énumération inconnues (`.unknown`).

enum DeviceKind: Hashable, Sendable, Codable {
    case light, plug, fan, tv, remote, speaker
    case unknown(String)

    init(rawValue: String) {
        switch rawValue {
        case "light": self = .light
        case "plug": self = .plug
        case "fan": self = .fan
        case "tv": self = .tv
        case "remote": self = .remote
        case "speaker": self = .speaker
        default: self = .unknown(rawValue)
        }
    }

    var rawValue: String {
        switch self {
        case .light: "light"
        case .plug: "plug"
        case .fan: "fan"
        case .tv: "tv"
        case .remote: "remote"
        case .speaker: "speaker"
        case .unknown(let raw): raw
        }
    }

    init(from decoder: Decoder) throws {
        self.init(rawValue: try decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(rawValue)
    }

    /// Appareils comptés dans « N lumières allumées » (lampes et prises de lampe).
    var countsAsLight: Bool { self == .light || self == .plug }
}

/// Ce que joue une enceinte (HomePod) ou la télé (`MediaInfo` du contrat).
struct MediaInfo: Hashable, Sendable, Codable {
    enum PlayState: String, Sendable, Codable { case playing, paused, idle }
    var state: PlayState
    var title: String?
    var artist: String?
    var album: String?
    var app: String?
    /// Chaîne TV.
    var channel: String?
    /// URL relative au pont (`/api/home/media/<id>/artwork?h=…`), même authentification que l'API.
    var artworkUrl: String?
    /// Secondes écoulées à `updatedAt`.
    var position: Double?
    var duration: Double?
    var updatedAt: String?

    init(state: PlayState, title: String? = nil, artist: String? = nil, album: String? = nil, app: String? = nil, channel: String? = nil,
         artworkUrl: String? = nil, position: Double? = nil, duration: Double? = nil, updatedAt: String? = nil) {
        self.state = state
        self.title = title
        self.artist = artist
        self.album = album
        self.app = app
        self.channel = channel
        self.artworkUrl = artworkUrl
        self.position = position
        self.duration = duration
        self.updatedAt = updatedAt
    }

    private enum CodingKeys: String, CodingKey { case state, title, artist, album, app, channel, artworkUrl, position, duration, updatedAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        state = (try? c.decodeIfPresent(String.self, forKey: .state)).flatMap { PlayState(rawValue: $0) } ?? .idle
        title = try? c.decodeIfPresent(String.self, forKey: .title)
        artist = try? c.decodeIfPresent(String.self, forKey: .artist)
        album = try? c.decodeIfPresent(String.self, forKey: .album)
        app = try? c.decodeIfPresent(String.self, forKey: .app)
        channel = try? c.decodeIfPresent(String.self, forKey: .channel)
        artworkUrl = try? c.decodeIfPresent(String.self, forKey: .artworkUrl)
        position = try? c.decodeIfPresent(Double.self, forKey: .position)
        duration = try? c.decodeIfPresent(Double.self, forKey: .duration)
        updatedAt = try? c.decodeIfPresent(String.self, forKey: .updatedAt)
    }

    var isActive: Bool { state != .idle }

    /// Position maintenant : interpolée depuis `updatedAt` pendant la lecture, bornée à la durée.
    func position(at now: Date) -> Double? {
        guard var pos = position else { return nil }
        if state == .playing, let at = updatedAt.flatMap(MediaInfo.parseDate) {
            pos += max(0, now.timeIntervalSince(at))
        }
        if let duration, duration > 0 { return min(max(0, pos), duration) }
        return max(0, pos)
    }

    static func parseDate(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    /// « 3:07 ».
    static func format(_ seconds: Double?) -> String {
        guard let seconds, seconds.isFinite else { return "–:––" }
        let s = max(0, Int(seconds))
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
    }
}

struct DeviceState: Hashable, Sendable, Codable {
    /// nil = inconnu / injoignable.
    var on: Bool?
    var reachable: Bool
    var brightness: Double?
    var color: String?
    var kelvin: Double?
    var speed: Double?
    var lightOn: Bool?
    var volume: Double?
    var source: String?
    /// Lecture en cours (enceinte, télé). Additif.
    var media: MediaInfo?
    /// Ambilight de la télé (replié dans la télé, plus d'appareil séparé). Additif.
    var ambilight: AmbilightState?

    init(on: Bool?, reachable: Bool = true, brightness: Double? = nil, color: String? = nil, kelvin: Double? = nil,
         speed: Double? = nil, lightOn: Bool? = nil, volume: Double? = nil, source: String? = nil, media: MediaInfo? = nil,
         ambilight: AmbilightState? = nil) {
        self.on = on
        self.reachable = reachable
        self.brightness = brightness
        self.color = color
        self.kelvin = kelvin
        self.speed = speed
        self.lightOn = lightOn
        self.volume = volume
        self.source = source
        self.media = media
        self.ambilight = ambilight
    }

    private enum CodingKeys: String, CodingKey {
        case on, reachable, brightness, color, kelvin, speed, lightOn, volume, source, media, ambilight
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        on = try c.decodeIfPresent(Bool.self, forKey: .on)
        reachable = try c.decodeIfPresent(Bool.self, forKey: .reachable) ?? true
        brightness = try c.decodeIfPresent(Double.self, forKey: .brightness)
        color = try c.decodeIfPresent(String.self, forKey: .color)
        kelvin = try c.decodeIfPresent(Double.self, forKey: .kelvin)
        speed = try c.decodeIfPresent(Double.self, forKey: .speed)
        lightOn = try c.decodeIfPresent(Bool.self, forKey: .lightOn)
        volume = try c.decodeIfPresent(Double.self, forKey: .volume)
        source = try c.decodeIfPresent(String.self, forKey: .source)
        media = try? c.decodeIfPresent(MediaInfo.self, forKey: .media)
        ambilight = try? c.decodeIfPresent(AmbilightState.self, forKey: .ambilight)
    }
}

/// État de l'Ambilight (`AmbilightState` du contrat). Sans couleur ni luminosité quand il suit l'image / le son.
struct AmbilightState: Hashable, Sendable, Codable {
    var on: Bool
    var color: String?
    /// 0...100.
    var brightness: Double?
    /// Effet en cours (identifiant brut Home Assistant, ex. « FOLLOW_VIDEO: STANDARD »).
    var effect: String?

    init(on: Bool, color: String? = nil, brightness: Double? = nil, effect: String? = nil) {
        self.on = on
        self.color = color
        self.brightness = brightness
        self.effect = effect
    }

    private enum CodingKeys: String, CodingKey { case on, color, brightness, effect }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        on = (try? c.decodeIfPresent(Bool.self, forKey: .on)) ?? false
        color = try? c.decodeIfPresent(String.self, forKey: .color)
        brightness = try? c.decodeIfPresent(Double.self, forKey: .brightness)
        effect = try? c.decodeIfPresent(String.self, forKey: .effect)
    }
}

/// Réglages possibles de l'Ambilight (`AmbilightCapabilities`).
struct AmbilightCapabilities: Hashable, Sendable, Codable {
    var color: Bool?
    var brightness: Bool?
    /// Effets proposés (identifiants bruts à renvoyer dans l'action `ambilight`).
    var effects: [String]?

    init(color: Bool? = nil, brightness: Bool? = nil, effects: [String]? = nil) {
        self.color = color
        self.brightness = brightness
        self.effects = effects
    }

    private enum CodingKeys: String, CodingKey { case color, brightness, effects }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        color = try? c.decodeIfPresent(Bool.self, forKey: .color)
        brightness = try? c.decodeIfPresent(Bool.self, forKey: .brightness)
        effects = try? c.decodeIfPresent([String].self, forKey: .effects)
    }
}

/// Appli installée sur la télé (`TvApp`) : lancée par le bouton `app:<id>`.
struct TvApp: Hashable, Sendable, Codable, Identifiable {
    /// Paquet Android (« com.netflix.ninja »).
    var id: String
    var label: String

    var button: String { "app:\(id)" }
}

/// Libellé français d'un effet Ambilight (miroir de `ambilightEffectLabel` du contrat).
enum AmbilightText {
    static let groups: [String: String] = ["FOLLOW_VIDEO": "Vidéo", "FOLLOW_AUDIO": "Son", "FOLLOW_COLOR": "Couleur", "Mode": "Mode"]
    static let names: [String: String] = [
        "STANDARD": "Standard", "NATURAL": "Naturel", "VIVID": "Vif", "GAME": "Jeu", "IMMERSIVE": "Immersif",
        "ENERGY_ADAPTIVE_BRIGHTNESS": "Énergie", "ENERGY_ADAPTIVE_COLORS": "Couleurs énergie", "RANDOM_PIXEL_FLASH": "Flash",
        "VU_METER": "VU-mètre", "SPECTRUM_ANALYZER": "Spectre", "KNIGHT_RIDER_ALTERNATING": "K2000",
        "KNIGHT_RIDER_CLOCKWISE": "K2000 rotatif", "PARTY": "Fête", "STROBO": "Strobo", "CUSTOM_COLOR": "Personnalisée",
        "DEEP_WATER": "Eau profonde", "FRESH_NATURE": "Nature", "HOT_LAVA": "Lave", "ISF": "Blanc chaud",
        "AUTOMATIC_HUE": "Teinte auto", "MANUAL_HUE": "Teinte manuelle",
        "expert": "Expert", "internal": "Interne", "lounge": "Lounge", "manual": "Manuel",
    ]

    private static func parts(_ effect: String) -> [String] {
        effect.split(separator: ":", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
    }

    /// « FOLLOW_VIDEO: STANDARD » → « Vidéo · Standard ».
    static func label(_ effect: String) -> String {
        let p = parts(effect)
        guard let g = groups[p.first ?? ""] else { return effect }
        let raw = p.count > 1 ? p[1] : ""
        let n = names[raw] ?? raw.lowercased().replacingOccurrences(of: "_", with: " ").firstUppercased
        let expert = p.count > 2 && !p[2].isEmpty
        return "\(g) · \(n)\(expert ? " (expert)" : "")"
    }

    /// Groupe seul (« Vidéo »), nil pour un effet inconnu.
    static func group(_ effect: String) -> String? { groups[parts(effect).first ?? ""] }

    /// Nom seul (« Standard »).
    static func shortLabel(_ effect: String) -> String {
        let l = label(effect)
        guard let r = l.range(of: " · ") else { return l }
        return String(l[r.upperBound...])
    }
}

extension String {
    var firstUppercased: String { prefix(1).uppercased() + dropFirst() }
}

struct DeviceCapabilities: Hashable, Sendable, Codable {
    var brightness: Bool?
    var color: Bool?
    var kelvin: Bool?
    var speedSteps: Int?
    var fanLight: Bool?
    var volume: Bool?
    var buttons: [String]?
    /// Commandes de lecture proposées maintenant : « play », « pause », « next », « previous ».
    var media: [String]?
    /// Télé : Ambilight pilotable par l'action `ambilight`. Additif.
    var ambilight: AmbilightCapabilities?
    /// Télé : applis installées, dans l'ordre d'affichage (aussi listées dans `buttons` en `app:<id>`). Additif.
    var apps: [TvApp]?

    init(brightness: Bool? = nil, color: Bool? = nil, kelvin: Bool? = nil, speedSteps: Int? = nil,
         fanLight: Bool? = nil, volume: Bool? = nil, buttons: [String]? = nil, media: [String]? = nil,
         ambilight: AmbilightCapabilities? = nil, apps: [TvApp]? = nil) {
        self.brightness = brightness
        self.color = color
        self.kelvin = kelvin
        self.speedSteps = speedSteps
        self.fanLight = fanLight
        self.volume = volume
        self.buttons = buttons
        self.media = media
        self.ambilight = ambilight
        self.apps = apps
    }

    private enum CodingKeys: String, CodingKey { case brightness, color, kelvin, speedSteps, fanLight, volume, buttons, media, ambilight, apps }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        brightness = try? c.decodeIfPresent(Bool.self, forKey: .brightness)
        color = try? c.decodeIfPresent(Bool.self, forKey: .color)
        kelvin = try? c.decodeIfPresent(Bool.self, forKey: .kelvin)
        speedSteps = try? c.decodeIfPresent(Int.self, forKey: .speedSteps)
        fanLight = try? c.decodeIfPresent(Bool.self, forKey: .fanLight)
        volume = try? c.decodeIfPresent(Bool.self, forKey: .volume)
        buttons = try? c.decodeIfPresent([String].self, forKey: .buttons)
        media = try? c.decodeIfPresent([String].self, forKey: .media)
        ambilight = try? c.decodeIfPresent(AmbilightCapabilities.self, forKey: .ambilight)
        apps = try? c.decodeIfPresent([TvApp].self, forKey: .apps)
    }

    /// Commande de lecture disponible (« playPause » = lecture ou pause).
    func canMedia(_ command: MediaCommand) -> Bool {
        let list = media ?? []
        return command == .playPause ? (list.contains("play") || list.contains("pause")) : list.contains(command.rawValue)
    }

    /// Sources TV (« source:HDMI 1 » → « HDMI 1 »).
    var sources: [String] {
        (buttons ?? []).compactMap { $0.hasPrefix("source:") ? String($0.dropFirst(7)) : nil }
    }

    /// Boutons de télécommande hors sources et applis.
    var remoteButtons: [String] {
        (buttons ?? []).filter { !$0.hasPrefix("source:") && !$0.hasPrefix("app:") }
    }

    /// Applis lançables (liste du pont ; à défaut, les boutons `app:<paquet>`).
    var tvApps: [TvApp] {
        if let apps, !apps.isEmpty { return apps }
        return (buttons ?? []).compactMap { b in
            b.hasPrefix("app:") ? TvApp(id: String(b.dropFirst(4)), label: TvAppStyle.fallbackLabel(String(b.dropFirst(4)))) : nil
        }
    }
}

struct Device: Identifiable, Hashable, Sendable, Codable {
    var id: String
    var name: String
    var kind: DeviceKind
    var source: String
    var room: String
    var itemId: String?
    var state: DeviceState
    var capabilities: DeviceCapabilities

    init(id: String, name: String, kind: DeviceKind, source: String = "mock", room: String = "", itemId: String? = nil,
         state: DeviceState, capabilities: DeviceCapabilities = DeviceCapabilities()) {
        self.id = id
        self.name = name
        self.kind = kind
        self.source = source
        self.room = room
        self.itemId = itemId
        self.state = state
        self.capabilities = capabilities
    }

    private enum CodingKeys: String, CodingKey { case id, name, kind, source, room, itemId, state, capabilities }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? id
        kind = try c.decode(DeviceKind.self, forKey: .kind)
        source = try c.decodeIfPresent(String.self, forKey: .source) ?? "unknown"
        room = try c.decodeIfPresent(String.self, forKey: .room) ?? ""
        itemId = try c.decodeIfPresent(String.self, forKey: .itemId)
        state = (try? c.decodeIfPresent(DeviceState.self, forKey: .state)) ?? DeviceState(on: nil, reachable: false)
        capabilities = (try? c.decodeIfPresent(DeviceCapabilities.self, forKey: .capabilities)) ?? DeviceCapabilities()
    }

    /// Lampe ou prise actuellement allumée.
    var isLitLight: Bool { kind.countsAsLight && state.on == true && state.reachable }
    var isOn: Bool { state.on == true }
    var isReachable: Bool { state.reachable }
    /// Appareils que l'app sait afficher (les types inconnus sont ignorés).
    var isSupported: Bool {
        switch kind {
        case .light, .plug, .fan, .tv, .speaker: true
        case .remote, .unknown: false
        }
    }
}

struct HomeScene: Identifiable, Hashable, Sendable, Codable {
    var id: String
    var name: String
    var icon: String
}

struct HomeSnapshot: Hashable, Sendable, Codable {
    var home: String
    var devices: [Device]
    var scenes: [HomeScene]
    var updatedAt: String
    /// Position du soleil pour la maison (additif : absent des ponts plus anciens).
    var sun: SunInfo?

    init(home: String, devices: [Device], scenes: [HomeScene] = HomeScene.defaults, updatedAt: String = "", sun: SunInfo? = nil) {
        self.home = home
        self.devices = devices
        self.scenes = scenes
        self.updatedAt = updatedAt
        self.sun = sun
    }

    private enum CodingKeys: String, CodingKey { case home, devices, scenes, updatedAt, sun }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        home = try c.decodeIfPresent(String.self, forKey: .home) ?? ""
        devices = try c.decodeIfPresent([Device].self, forKey: .devices) ?? []
        scenes = try c.decodeIfPresent([HomeScene].self, forKey: .scenes) ?? []
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
        sun = try? c.decodeIfPresent(SunInfo.self, forKey: .sun)
    }

    var lights: [Device] { devices.filter { $0.kind.countsAsLight } }
    /// Nombre de lampes/prises allumées.
    var lightsOnCount: Int { devices.reduce(0) { $0 + ($1.isLitLight ? 1 : 0) } }
    var anyLightOn: Bool { lightsOnCount > 0 }

    func device(_ id: String) -> Device? { devices.first { $0.id == id } }

    /// Applique un événement `device` (remplace l'appareil de même id, ou l'ajoute).
    mutating func upsert(_ device: Device) {
        if let index = devices.firstIndex(where: { $0.id == device.id }) {
            devices[index] = device
        } else {
            devices.append(device)
        }
    }
}

/// Soleil vu du pont (Home Assistant `sun.sun`, sinon calculé sur le Mac).
struct SunInfo: Hashable, Sendable, Codable {
    /// Élévation en degrés (négative sous l'horizon).
    var elevation: Double
    var isDay: Bool
    var nextRising: String?
    var nextSetting: String?
}

/// Ambiance de la maquette 3D : suit le soleil, ou jour / nuit forcés.
enum DaylightMode: String, Sendable, Codable, CaseIterable {
    case auto, day, night
}

/// Cadrage par défaut de la maquette : le salon (pièce de la télé) ou tout l'appartement.
enum FrameTarget: String, Sendable, Codable {
    case living, all
}

extension HomeScene {
    static let defaults: [HomeScene] = [
        HomeScene(id: "bright", name: "Lumineux", icon: "sun"),
        HomeScene(id: "cozy", name: "Cosy", icon: "sofa"),
        HomeScene(id: "movie", name: "Film", icon: "film"),
        HomeScene(id: "night", name: "Nuit", icon: "moon"),
        HomeScene(id: "away", name: "Absent", icon: "door"),
    ]
}

/// Événements SSE de GET /api/home/events.
enum HomeEvent: Equatable, Sendable, Decodable {
    case snapshot(HomeSnapshot)
    case device(Device)
    case error(String)
    case unknown(String)

    private enum CodingKeys: String, CodingKey { case type, snapshot, device, message }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let type = try c.decode(String.self, forKey: .type)
        switch type {
        case "snapshot": self = .snapshot(try c.decode(HomeSnapshot.self, forKey: .snapshot))
        case "device": self = .device(try c.decode(Device.self, forKey: .device))
        case "error": self = .error(try c.decodeIfPresent(String.self, forKey: .message) ?? "")
        default: self = .unknown(type)
        }
    }
}

/// Commandes de lecture (`MediaCommand`).
enum MediaCommand: String, Hashable, Sendable, Codable {
    case play, pause, playPause, next, previous
}

/// Corps de POST /api/home/devices/:id/action.
enum DeviceAction: Hashable, Sendable, Encodable {
    case toggle
    case power(Bool)
    case brightness(Int)
    case color(String)
    case kelvin(Int)
    case speed(Int)
    case fanLight(Bool)
    case volume(Int)
    case volumeStep(Int)
    case button(String)
    case media(MediaCommand)
    /// Ambilight de la télé : `on == false` l'éteint ; sinon allumé avec ce qui est donné.
    case ambilight(on: Bool? = nil, hex: String? = nil, brightness: Int? = nil, effect: String? = nil)

    private enum CodingKeys: String, CodingKey { case type, on, value, hex, delta, name, command, brightness, effect }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .toggle:
            try c.encode("toggle", forKey: .type)
        case .power(let on):
            try c.encode("power", forKey: .type)
            try c.encode(on, forKey: .on)
        case .brightness(let v):
            try c.encode("brightness", forKey: .type)
            try c.encode(v, forKey: .value)
        case .color(let hex):
            try c.encode("color", forKey: .type)
            try c.encode(hex, forKey: .hex)
        case .kelvin(let v):
            try c.encode("kelvin", forKey: .type)
            try c.encode(v, forKey: .value)
        case .speed(let v):
            try c.encode("speed", forKey: .type)
            try c.encode(v, forKey: .value)
        case .fanLight(let on):
            try c.encode("fanLight", forKey: .type)
            try c.encode(on, forKey: .on)
        case .volume(let v):
            try c.encode("volume", forKey: .type)
            try c.encode(v, forKey: .value)
        case .volumeStep(let d):
            try c.encode("volumeStep", forKey: .type)
            try c.encode(d >= 0 ? 1 : -1, forKey: .delta)
        case .button(let name):
            try c.encode("button", forKey: .type)
            try c.encode(name, forKey: .name)
        case .media(let command):
            try c.encode("media", forKey: .type)
            try c.encode(command.rawValue, forKey: .command)
        case .ambilight(let on, let hex, let brightness, let effect):
            try c.encode("ambilight", forKey: .type)
            try c.encodeIfPresent(on, forKey: .on)
            try c.encodeIfPresent(hex, forKey: .hex)
            try c.encodeIfPresent(brightness, forKey: .brightness)
            try c.encodeIfPresent(effect, forKey: .effect)
        }
    }
}

/// Chemins HTTP du bridge (HOME_API).
enum HomeAPI {
    static let snapshot = "/api/home"
    static let events = "/api/home/events"
    static let pair = "/api/pair"
    /// PUT { order: [id] } → HomeSnapshot (ordre partagé des tuiles).
    static let order = "/api/home/order"
    static func action(_ id: String) -> String { "/api/home/devices/\(encode(id))/action" }
    static func scene(_ id: String) -> String { "/api/home/scenes/\(encode(id))" }
    static func artwork(_ id: String) -> String { "/api/home/media/\(encode(id))/artwork" }

    /// Équivalent de `encodeURIComponent`.
    static func encode(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.!~*'()")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    static let bonjourService = "_appart3d._tcp"
    static let cookieName = "appart3d_home"
    static let defaultScenePath = "/shared/demo-apartment.json"
    static let publicDemoURL = URL(string: "http://localhost:8787/?view=3d&scene=/shared/demo-apartment.json")!
}

struct PairRequest: Encodable, Sendable {
    var code: String
    var deviceName: String?
}

struct PairResponse: Codable, Sendable, Equatable {
    var token: String
    var home: String
}

/// Natif → web : `window.appart3dEmbed.post(EmbedCommand)`.
enum EmbedCommand: Equatable, Sendable, Encodable {
    case focusItem(String?)
    case highlightDevice(String?)
    case setNight(Bool)
    case setDaylight(DaylightMode)
    case overview
    case frame(FrameTarget)
    case autoRotate(Bool)

    private enum CodingKeys: String, CodingKey { case type, itemId, deviceId, night, enabled, mode, target }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .focusItem(let id):
            try c.encode("focusItem", forKey: .type)
            try c.encode(id, forKey: .itemId)
        case .highlightDevice(let id):
            try c.encode("highlightDevice", forKey: .type)
            try c.encode(id, forKey: .deviceId)
        case .setNight(let night):
            try c.encode("setNight", forKey: .type)
            try c.encode(night, forKey: .night)
        case .setDaylight(let mode):
            try c.encode("setDaylight", forKey: .type)
            try c.encode(mode.rawValue, forKey: .mode)
        case .overview:
            try c.encode("overview", forKey: .type)
        case .frame(let target):
            try c.encode("frame", forKey: .type)
            try c.encode(target.rawValue, forKey: .target)
        case .autoRotate(let enabled):
            try c.encode("autoRotate", forKey: .type)
            try c.encode(enabled, forKey: .enabled)
        }
    }

    var json: String {
        let data = (try? JSONEncoder().encode(self)) ?? Data("{}".utf8)
        return String(decoding: data, as: UTF8.self)
    }
}

/// Web → natif : `window.webkit.messageHandlers.appart3d.postMessage(EmbedEvent)`.
enum EmbedEvent: Equatable, Sendable, Decodable {
    case ready
    case itemTapped(itemId: String, deviceIds: [String])
    case error(String)
    case unknown(String)

    private enum CodingKeys: String, CodingKey { case type, itemId, deviceIds, message }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let type = try c.decode(String.self, forKey: .type)
        switch type {
        case "ready": self = .ready
        case "itemTapped":
            self = .itemTapped(itemId: try c.decodeIfPresent(String.self, forKey: .itemId) ?? "",
                               deviceIds: try c.decodeIfPresent([String].self, forKey: .deviceIds) ?? [])
        case "error": self = .error(try c.decodeIfPresent(String.self, forKey: .message) ?? "")
        default: self = .unknown(type)
        }
    }

    /// Décode le corps d'un WKScriptMessage (dictionnaire ou chaîne JSON).
    static func from(messageBody body: Any) -> EmbedEvent? {
        let data: Data?
        if let s = body as? String {
            data = Data(s.utf8)
        } else if JSONSerialization.isValidJSONObject(body) {
            data = try? JSONSerialization.data(withJSONObject: body)
        } else {
            data = nil
        }
        guard let data else { return nil }
        return try? JSONDecoder().decode(EmbedEvent.self, from: data)
    }
}
