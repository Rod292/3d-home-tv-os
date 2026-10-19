import Foundation

/// Maison simulée (mode démo) : mêmes appareils et identifiants qu'un appartement type, état en mémoire
/// (persisté dans l'App Group pour que widgets et intents voient la même chose). Aucun appareil réel n'est piloté.
struct MockHomeClient: HomeClient {
    var latency: Duration = .milliseconds(160)

    func snapshot() async throws -> HomeSnapshot {
        await MockHomeHub.shared.current()
    }

    func perform(_ action: DeviceAction, on deviceId: String) async throws -> Device {
        try? await Task.sleep(for: latency)
        return try await MockHomeHub.shared.perform(action, on: deviceId)
    }

    func activateScene(_ sceneId: String) async throws -> HomeSnapshot {
        try? await Task.sleep(for: latency * 2)
        return try await MockHomeHub.shared.activate(sceneId)
    }

    func setOrder(_ ids: [String]) async throws -> HomeSnapshot {
        try? await Task.sleep(for: latency)
        return await MockHomeHub.shared.setOrder(ids)
    }

    func events() -> AsyncThrowingStream<HomeEvent, Error> {
        AsyncThrowingStream { continuation in
            let id = UUID()
            Task {
                await MockHomeHub.shared.subscribe(id, continuation)
            }
            continuation.onTermination = { _ in
                Task { await MockHomeHub.shared.unsubscribe(id) }
            }
        }
    }
}

actor MockHomeHub {
    static let shared = MockHomeHub()

    private var snapshot: HomeSnapshot
    private var subscribers: [UUID: AsyncThrowingStream<HomeEvent, Error>.Continuation] = [:]

    init() {
        // Un état démo enregistré par une version sans HomePod repart de l'état initial.
        if let stored = SharedStore.mockSnapshot, Self.isCurrent(stored) {
            snapshot = stored
        } else {
            snapshot = MockHomeHub.initialSnapshot()
        }
    }

    /// État démo enregistré compatible (HomePod présent, Ambilight replié dans la télé).
    static func isCurrent(_ s: HomeSnapshot) -> Bool {
        s.device("airplay:homepod") != nil && s.device(tvId)?.capabilities.ambilight != nil
    }

    static let tvId = "ha:media_player.philips_tv"

    static let ambilightEffects = [
        "FOLLOW_VIDEO: STANDARD", "FOLLOW_VIDEO: NATURAL", "FOLLOW_VIDEO: VIVID", "FOLLOW_VIDEO: GAME", "FOLLOW_VIDEO: IMMERSIVE",
        "FOLLOW_AUDIO: VU_METER", "FOLLOW_AUDIO: ENERGY_ADAPTIVE_BRIGHTNESS",
        "FOLLOW_COLOR: HOT_LAVA", "FOLLOW_COLOR: DEEP_WATER", "FOLLOW_COLOR: FRESH_NATURE", "FOLLOW_COLOR: ISF",
    ]

    static let tvApps: [TvApp] = [
        ("org.droidtv.playtv", "TV"), ("com.google.android.youtube.tv", "YouTube"), ("com.netflix.ninja", "Netflix"),
        ("com.canal.android.canal", "myCANAL"), ("com.amazon.amazonvideo.livingroom", "Prime Video"), ("com.disney.disneyplus", "Disney+"),
        ("fr.francetv.pluzz", "france.tv"), ("fr.tf1.mytf1", "TF1+"), ("fr.m6.m6replay", "M6+"), ("tv.arte.plus7", "ARTE"),
        ("com.orange.owtv.tv", "TV d'Orange"), ("com.google.android.videos", "Google TV"), ("tv.twitch.android.app", "Twitch"),
        ("deezer.android.app", "Deezer"), ("com.google.android.youtube.tvmusic", "YouTube Music"), ("com.android.vending", "Play Store"),
    ].map { TvApp(id: $0.0, label: $0.1) }

    func current() -> HomeSnapshot {
        // Un autre processus (widget, intent) a pu modifier l'état.
        if let stored = SharedStore.mockSnapshot, Self.isCurrent(stored) { snapshot = stored }
        return stamped()
    }

    func perform(_ action: DeviceAction, on deviceId: String) throws -> Device {
        _ = current()
        guard let device = snapshot.device(deviceId) else { throw HomeError.http(404, "appareil inconnu \(deviceId)") }
        let updated = HomeReducer.apply(action, to: device)
        snapshot.upsert(updated)
        persist()
        broadcast(.device(updated))
        return updated
    }

    func activate(_ sceneId: String) throws -> HomeSnapshot {
        _ = current()
        guard ScenePlanner.plan(sceneId, devices: snapshot.devices) != nil else { throw HomeError.http(404, "scène inconnue") }
        snapshot = HomeReducer.apply(scene: sceneId, to: snapshot)
        persist()
        let s = stamped()
        broadcast(.snapshot(s))
        return s
    }

    func setOrder(_ ids: [String]) -> HomeSnapshot {
        _ = current()
        snapshot.devices = DeviceOrder.apply(ids, to: snapshot.devices)
        persist()
        let s = stamped()
        broadcast(.snapshot(s))
        return s
    }

    func reset() {
        snapshot = Self.initialSnapshot()
        persist()
        broadcast(.snapshot(stamped()))
    }

    func subscribe(_ id: UUID, _ continuation: AsyncThrowingStream<HomeEvent, Error>.Continuation) {
        subscribers[id] = continuation
        continuation.yield(.snapshot(current()))
    }

    func unsubscribe(_ id: UUID) {
        subscribers[id] = nil
    }

    private func broadcast(_ event: HomeEvent) {
        for c in subscribers.values { c.yield(event) }
    }

    private func persist() {
        SharedStore.mockSnapshot = snapshot
    }

    private func stamped() -> HomeSnapshot {
        var s = snapshot
        s.updatedAt = ISO8601DateFormatter().string(from: Date())
        return s
    }

    /// Miroir des appareils réels (noms, pièces, liens 3D de la config du bridge).
    static func initialSnapshot() -> HomeSnapshot {
        let lightCaps = DeviceCapabilities(brightness: true, color: true, kelvin: true)
        let tvButtons = ["tv_power", "volume_up", "volume_down", "mute", "home", "back", "channel_up", "channel_down",
                         "source:Watch TV", "source:HDMI 1", "source:HDMI 2", "source:HDMI 3"]
        return HomeSnapshot(
            home: "Home",
            devices: [
                Device(id: "hue:light:12", name: "Bandeau bureau", kind: .light, source: "mock", room: "Salon", itemId: "item_10",
                       state: DeviceState(on: true, brightness: 70, color: "#ff8a1f"), capabilities: lightCaps),
                Device(id: "hue:light:18", name: "Lampadaire", kind: .light, source: "mock", room: "Salon", itemId: "item_floorlamp",
                       state: DeviceState(on: true, brightness: 55, color: "#ffb46b", kelvin: 2700), capabilities: lightCaps),
                Device(id: "hue:light:9", name: "Lustre", kind: .light, source: "mock", room: "Salon",
                       state: DeviceState(on: nil, reachable: false), capabilities: lightCaps),
                Device(id: tvId, name: "TV Philips", kind: .tv, source: "mock", room: "Salon", itemId: "item_30",
                       state: DeviceState(on: true, volume: 18, source: "Netflix",
                                          media: MediaInfo(state: .playing, title: "Les Ombres du Lac", app: "Netflix"),
                                          ambilight: AmbilightState(on: true, effect: "FOLLOW_VIDEO: STANDARD")),
                       capabilities: DeviceCapabilities(volume: true, buttons: tvButtons + tvApps.map(\.button),
                                                        ambilight: AmbilightCapabilities(color: true, brightness: true, effects: ambilightEffects),
                                                        apps: tvApps)),
                Device(id: "airplay:homepod", name: "HomePod mini", kind: .speaker, source: "mock", room: "Salon", itemId: "item_homepod",
                       state: DeviceState(on: true, volume: 35,
                                          media: MediaInfo(state: .playing, title: "Lumière d'octobre", artist: "Les Voisins du Dessus",
                                                           album: "Rue Oberkampf", app: "Musique", position: 62, duration: 214,
                                                           updatedAt: ISO8601DateFormatter().string(from: Date()))),
                       capabilities: DeviceCapabilities(volume: true, media: ["play", "pause", "next", "previous"])),
                Device(id: "hue:light:17", name: "Lustre Cuisine", kind: .light, source: "mock", room: "Cuisine", itemId: "item_pendant_rattan",
                       state: DeviceState(on: false, brightness: 100, kelvin: 2700), capabilities: lightCaps),
                Device(id: "hue:light:8", name: "Lampe VARMBLIXT", kind: .plug, source: "mock", room: "Chambre", itemId: "item_varmblixt",
                       state: DeviceState(on: false)),
                Device(id: "ha:fan.create_windcalm", name: "Ventilateur", kind: .fan, source: "mock", room: "Chambre", itemId: "item_fan",
                       state: DeviceState(on: true, speed: 50, lightOn: false), capabilities: DeviceCapabilities(speedSteps: 6, fanLight: true)),
            ],
            scenes: HomeScene.defaults,
            updatedAt: ISO8601DateFormatter().string(from: Date())
        )
    }
}
