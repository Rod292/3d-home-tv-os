import Foundation

/// Mises à jour optimistes : l'état qu'un appareil devrait avoir après une action,
/// appliqué tout de suite à l'écran puis remplacé par la réponse du bridge.
enum HomeReducer {
    static func apply(_ action: DeviceAction, to device: Device) -> Device {
        guard device.state.reachable else { return device }
        var d = device
        var s = d.state
        switch action {
        case .toggle:
            if d.kind == .speaker { return apply(.media(.playPause), to: device) }
            setPower(!(s.on ?? false), &s, d)
        case .power(let on):
            setPower(on, &s, d)
        case .brightness(let v):
            let v = clamp(v)
            if v <= 0 {
                s.on = false
            } else {
                s.on = true
                s.brightness = Double(v)
            }
        case .color(let hex):
            s.on = true
            s.color = hex.lowercased()
            s.kelvin = nil
        case .kelvin(let k):
            s.on = true
            s.kelvin = Double(k)
            s.color = ColorMath.kelvinToHex(Double(k))
        case .speed(let v):
            let v = clamp(v)
            s.speed = Double(v)
            s.on = v > 0
        case .fanLight(let on):
            s.lightOn = on
        case .volume(let v):
            s.volume = Double(clamp(v))
        case .volumeStep(let delta):
            // Unknown level (e.g. an amp driven by infrared): don't invent a number.
            if let v = s.volume { s.volume = Double(clamp(Int(v) + (delta >= 0 ? 1 : -1))) }
        case .button(let name):
            if name.hasPrefix("source:") {
                s.source = String(name.dropFirst(7))
            } else if name.hasPrefix("app:") {
                // Lancer une appli allume la télé si besoin ; elle passe au premier plan.
                let id = String(name.dropFirst(4))
                let label = d.capabilities.tvApps.first { $0.id == id }?.label ?? TvAppStyle.fallbackLabel(id)
                s.on = true
                s.media = MediaInfo(state: .playing, app: label)
            } else if name == "tv_power" || name == "power" {
                setPower(!(s.on ?? false), &s, d)
            } else if name == "volume_up" || name == "vol+" {
                if let v = s.volume { s.volume = Double(clamp(Int(v) + 1)) }
            } else if name == "volume_down" || name == "vol-" {
                if let v = s.volume { s.volume = Double(clamp(Int(v) - 1)) }
            }
        case .media(let command):
            guard var m = s.media else { break }
            let now = Date()
            if let pos = m.position(at: now) { m.position = pos }
            m.updatedAt = ISO8601DateFormatter().string(from: now)
            switch command {
            case .play: m.state = .playing
            case .pause: m.state = .paused
            case .playPause: m.state = m.state == .playing ? .paused : .playing
            case .next, .previous: if m.position != nil { m.position = 0 }
            }
            s.media = m
            if d.kind == .speaker { s.on = m.state == .playing }
        case .ambilight(let on, let hex, let brightness, let effect):
            var a = s.ambilight ?? AmbilightState(on: false)
            if on == false {
                a.on = false
            } else {
                a.on = true
                if let hex {
                    a.color = hex.lowercased()
                    a.effect = nil
                }
                if let effect {
                    a.effect = effect
                    if hex == nil { a.color = nil }
                }
                if let brightness { a.brightness = Double(clamp(brightness)) }
            }
            s.ambilight = a
        }
        d.state = s
        return d
    }

    static func apply(_ action: DeviceAction, deviceId: String, to snapshot: HomeSnapshot) -> HomeSnapshot {
        var snap = snapshot
        if let i = snap.devices.firstIndex(where: { $0.id == deviceId }) {
            snap.devices[i] = apply(action, to: snap.devices[i])
        }
        return snap
    }

    /// Applique un plan de scène (même logique que le bridge) de façon optimiste.
    static func apply(scene sceneId: String, to snapshot: HomeSnapshot) -> HomeSnapshot {
        guard let plan = ScenePlanner.plan(sceneId, devices: snapshot.devices) else { return snapshot }
        var snap = snapshot
        for item in plan {
            for action in item.actions {
                snap = apply(action, deviceId: item.deviceId, to: snap)
            }
        }
        return snap
    }

    private static func setPower(_ on: Bool, _ s: inout DeviceState, _ d: Device) {
        s.on = on
        if d.kind == .fan {
            if on, (s.speed ?? 0) <= 0 {
                let steps = max(1, d.capabilities.speedSteps ?? 6)
                s.speed = (100.0 / Double(steps)).rounded()
            }
            if !on { s.speed = 0 }
        }
    }

    static func clamp(_ v: Int) -> Int { min(100, max(0, v)) }
}

/// Portage Swift de apps/home-bridge/src/scenes.ts (pour l'affichage optimiste et le mode démo).
enum ScenePlanner {
    struct Item: Equatable, Sendable {
        var deviceId: String
        var actions: [DeviceAction]
    }

    static let neutralKelvin = 4000
    static let warmKelvin = 2700
    static let amber = "#ff8a1f"
    static let movie = "#4b1fd1"

    static func plan(_ sceneId: String, devices: [Device], livingRoom: String = "Salon", bedroom: String = "Chambre") -> [Item]? {
        let lights = devices.filter { $0.kind.countsAsLight }
        // L'Ambilight (replié dans la télé) est la lumière d'ambiance de « Film » ; sinon le bandeau.
        let ambilightTv = devices.first { $0.kind == .tv && $0.capabilities.ambilight != nil }
        let strip = ambilightTv
            ?? devices.first { $0.kind == .light && $0.name.range(of: "ambilight", options: .caseInsensitive) != nil }
            ?? devices.first { $0.kind == .light && $0.name.range(of: "bandeau|strip|ruban|bande", options: [.regularExpression, .caseInsensitive]) != nil }
        var plan: [Item?] = []
        switch sceneId {
        case "bright":
            plan = lights.map { Item(deviceId: $0.id, actions: lightOn($0, 100, kelvin: neutralKelvin)) }
        case "cozy":
            for d in lights where d.room == livingRoom {
                plan.append(Item(deviceId: d.id, actions: d.id == strip?.id ? lightOn(d, 45, hex: amber) : lightOn(d, 45, kelvin: warmKelvin)))
            }
        case "movie":
            for d in lights {
                plan.append(d.id == strip?.id ? Item(deviceId: d.id, actions: lightOn(d, 25, hex: movie)) : off(d))
            }
            for d in devices where d.kind == .tv {
                var actions: [DeviceAction] = [.power(true)]
                if d.capabilities.ambilight != nil {
                    actions.append(.ambilight(on: true, hex: d.capabilities.ambilight?.color == false ? nil : movie,
                                              brightness: d.capabilities.ambilight?.brightness == false ? nil : 25))
                }
                plan.append(Item(deviceId: d.id, actions: actions))
            }
            for d in devices { plan.append(pauseSpeaker(d)) }
        case "night":
            for d in lights {
                if d.kind == .plug && d.room == bedroom { plan.append(Item(deviceId: d.id, actions: [.power(true)])) }
                else { plan.append(off(d)) }
            }
            for d in devices {
                if d.kind == .tv { plan.append(off(d)) }
                // Le ventilateur continue de souffler la nuit, seule sa lumière s'éteint.
                if d.kind == .fan, d.capabilities.fanLight == true, d.state.lightOn != false {
                    plan.append(Item(deviceId: d.id, actions: [.fanLight(false)]))
                }
            }
        case "away":
            for d in devices {
                if d.kind == .tv, d.state.ambilight?.on == true {
                    // Ambilight éteint d'abord (tant que la télé répond), puis la télé.
                    plan.append(Item(deviceId: d.id, actions: [.ambilight(on: false)] + (off(d)?.actions ?? [])))
                } else if d.kind.countsAsLight || d.kind == .tv { plan.append(off(d)) }
                plan.append(pauseSpeaker(d))
                if d.kind == .fan {
                    var actions: [DeviceAction] = []
                    if d.state.on != false { actions.append(.power(false)) }
                    if d.capabilities.fanLight == true, d.state.lightOn != false { actions.append(.fanLight(false)) }
                    if !actions.isEmpty { plan.append(Item(deviceId: d.id, actions: actions)) }
                }
            }
        default:
            return nil
        }
        return plan.compactMap { $0 }
    }

    private static func lightOn(_ d: Device, _ brightness: Int, kelvin: Int? = nil, hex: String? = nil) -> [DeviceAction] {
        var actions: [DeviceAction] = [.power(true)]
        if d.kind == .plug { return actions }
        if d.capabilities.brightness == true { actions.append(.brightness(brightness)) }
        if let hex, d.capabilities.color == true { actions.append(.color(hex)) }
        else if let kelvin, d.capabilities.kelvin == true { actions.append(.kelvin(kelvin)) }
        else if let kelvin, d.capabilities.color == true { actions.append(.color(ColorMath.kelvinToHex(Double(kelvin)))) }
        return actions
    }

    /// Met en pause une enceinte qui joue (seulement si elle propose la pause).
    private static func pauseSpeaker(_ d: Device) -> Item? {
        guard d.kind == .speaker, d.state.media?.state == .playing, d.capabilities.canMedia(.pause) else { return nil }
        return Item(deviceId: d.id, actions: [.media(.pause)])
    }

    private static func off(_ d: Device) -> Item? {
        if d.state.on == false { return nil }
        if d.kind == .tv && d.state.on == nil { return nil }
        return Item(deviceId: d.id, actions: [.power(false)])
    }
}

enum ColorMath {
    /// Approximation chaude/neutre/froide (identique au bridge pour 2700/4000) avec un dégradé plus fin.
    static func kelvinToHex(_ k: Double) -> String {
        switch k {
        case ..<2400: "#ff9e4f"
        case ..<3000: "#ffb46b"
        case ..<3600: "#ffc78f"
        case ..<4500: "#ffd8b0"
        case ..<5500: "#ffe9d6"
        default: "#f4f6ff"
        }
    }

    /// « #ffb46b » → (r, g, b) dans 0...1.
    static func rgb(_ hex: String) -> (r: Double, g: Double, b: Double)? {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        return (Double((v >> 16) & 0xff) / 255, Double((v >> 8) & 0xff) / 255, Double(v & 0xff) / 255)
    }
}
