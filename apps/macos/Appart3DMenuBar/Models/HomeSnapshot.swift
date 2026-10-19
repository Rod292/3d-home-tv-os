import Foundation

// Miroir Swift du contrat `@appart3d/home` (packages/home/src/index.ts).
// Le contrat n'évolue que de façon additive : les décodeurs tolèrent les champs inconnus
// et les valeurs d'énumération inconnues (`.unknown`).

enum DeviceKind: Equatable, Hashable, Sendable, Decodable {
    case light, plug, fan, tv, remote
    case unknown(String)

    init(rawValue: String) {
        switch rawValue {
        case "light": self = .light
        case "plug": self = .plug
        case "fan": self = .fan
        case "tv": self = .tv
        case "remote": self = .remote
        default: self = .unknown(rawValue)
        }
    }

    init(from decoder: Decoder) throws {
        self.init(rawValue: try decoder.singleValueContainer().decode(String.self))
    }

    /// Appareils comptés dans le badge « lumières allumées ».
    var countsAsLight: Bool { self == .light || self == .plug }
}

struct DeviceState: Equatable, Sendable, Decodable {
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

    private enum CodingKeys: String, CodingKey {
        case on, reachable, brightness, color, kelvin, speed, lightOn, volume, source
    }

    init(on: Bool?, reachable: Bool = true) {
        self.on = on
        self.reachable = reachable
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
    }
}

struct Device: Identifiable, Equatable, Sendable, Decodable {
    var id: String
    var name: String
    var kind: DeviceKind
    var source: String
    var room: String
    var itemId: String?
    var state: DeviceState

    private enum CodingKeys: String, CodingKey { case id, name, kind, source, room, itemId, state }

    init(id: String, name: String, kind: DeviceKind, source: String = "mock", room: String = "", itemId: String? = nil, state: DeviceState) {
        self.id = id
        self.name = name
        self.kind = kind
        self.source = source
        self.room = room
        self.itemId = itemId
        self.state = state
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? id
        kind = try c.decode(DeviceKind.self, forKey: .kind)
        source = try c.decodeIfPresent(String.self, forKey: .source) ?? "unknown"
        room = try c.decodeIfPresent(String.self, forKey: .room) ?? ""
        itemId = try c.decodeIfPresent(String.self, forKey: .itemId)
        state = try c.decodeIfPresent(DeviceState.self, forKey: .state) ?? DeviceState(on: nil, reachable: false)
    }

    /// Lumière ou prise actuellement allumée.
    var isLitLight: Bool { kind.countsAsLight && state.on == true }
}

struct HomeScene: Identifiable, Equatable, Sendable, Decodable {
    var id: String
    var name: String
    var icon: String
}

struct HomeSnapshot: Equatable, Sendable, Decodable {
    var home: String
    var devices: [Device]
    var scenes: [HomeScene]
    var updatedAt: String

    private enum CodingKeys: String, CodingKey { case home, devices, scenes, updatedAt }

    init(home: String, devices: [Device], scenes: [HomeScene] = [], updatedAt: String = "") {
        self.home = home
        self.devices = devices
        self.scenes = scenes
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        home = try c.decodeIfPresent(String.self, forKey: .home) ?? ""
        devices = try c.decodeIfPresent([Device].self, forKey: .devices) ?? []
        scenes = try c.decodeIfPresent([HomeScene].self, forKey: .scenes) ?? []
        updatedAt = try c.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
    }

    /// Nombre de lumières/prises allumées (state.on == true).
    var lightsOnCount: Int { devices.reduce(0) { $0 + ($1.isLitLight ? 1 : 0) } }

    /// Applique un événement `device` (remplace l'appareil de même id, ou l'ajoute).
    mutating func upsert(_ device: Device) {
        if let index = devices.firstIndex(where: { $0.id == device.id }) {
            devices[index] = device
        } else {
            devices.append(device)
        }
    }
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

/// Chemins HTTP du bridge (HOME_API).
enum HomeAPI {
    static let snapshot = "/api/home"
    static let events = "/api/home/events"
}
