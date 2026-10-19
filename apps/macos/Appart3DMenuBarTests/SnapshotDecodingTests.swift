import Foundation
import Testing
@testable import Appart3DMenuBar

private func fixture(_ name: String) throws -> Data {
    let url = try #require(Bundle(for: BundleToken.self).url(forResource: name, withExtension: "json"))
    return try Data(contentsOf: url)
}

private final class BundleToken {}

@Suite("Décodage du HomeSnapshot")
struct SnapshotDecodingTests {
    @Test func decodesFixture() throws {
        let snapshot = try JSONDecoder().decode(HomeSnapshot.self, from: fixture("home-snapshot"))
        #expect(snapshot.home == "Appartement d'Alex")
        #expect(snapshot.devices.count == 7)
        #expect(snapshot.scenes.map(\.id) == ["bright", "cozy", "movie", "night", "away"])
        #expect(snapshot.updatedAt == "2026-10-14T18:42:00.000Z")

        let ceiling = try #require(snapshot.devices.first { $0.id == "hue:light:1" })
        #expect(ceiling.kind == .light)
        #expect(ceiling.room == "Salon")
        #expect(ceiling.itemId == "item-ceiling-1")
        #expect(ceiling.state.on == true)
        #expect(ceiling.state.brightness == 80)
        #expect(ceiling.state.color == "#ffb46b")

        let unreachable = try #require(snapshot.devices.first { $0.id == "hue:light:3" })
        #expect(unreachable.state.on == nil)
        #expect(unreachable.state.reachable == false)

        let tv = try #require(snapshot.devices.first { $0.id == "robot:tv" })
        #expect(tv.state.source == "Netflix")
    }

    @Test func toleratesUnknownKindsAndFields() throws {
        let snapshot = try JSONDecoder().decode(HomeSnapshot.self, from: fixture("home-snapshot"))
        let aquarium = try #require(snapshot.devices.first { $0.id == "mock:aquarium" })
        #expect(aquarium.kind == .unknown("aquarium"))
        #expect(!aquarium.kind.countsAsLight)
    }

    @Test func lightsOnCountsOnlyLitLightsAndPlugs() throws {
        let snapshot = try JSONDecoder().decode(HomeSnapshot.self, from: fixture("home-snapshot"))
        // Plafonnier (light on) + Lampadaire (plug on). Fan/TV/inconnu allumés ignorés ; null et false ignorés.
        #expect(snapshot.lightsOnCount == 2)
    }

    @Test func lightsOnCountEdgeCases() {
        #expect(HomeSnapshot(home: "", devices: []).lightsOnCount == 0)
        let devices = [
            Device(id: "a", name: "A", kind: .light, state: DeviceState(on: true)),
            Device(id: "b", name: "B", kind: .light, state: DeviceState(on: nil, reachable: false)),
            Device(id: "c", name: "C", kind: .plug, state: DeviceState(on: false)),
            Device(id: "d", name: "D", kind: .fan, state: DeviceState(on: true)),
        ]
        #expect(HomeSnapshot(home: "x", devices: devices).lightsOnCount == 1)
    }

    @Test func minimalPayloadUsesDefaults() throws {
        let json = #"{"home":"Maison","devices":[{"id":"x","name":"X","kind":"light","source":"mock","room":"","state":{"on":true,"reachable":true},"capabilities":{}}],"scenes":[],"updatedAt":""}"#
        let snapshot = try JSONDecoder().decode(HomeSnapshot.self, from: Data(json.utf8))
        #expect(snapshot.lightsOnCount == 1)
        let sparse = try JSONDecoder().decode(HomeSnapshot.self, from: Data(#"{"home":"M"}"#.utf8))
        #expect(sparse.devices.isEmpty)
    }

    @Test func menuBarSymbol() {
        #expect(MenuBarLabel.symbolName(reachable: false, lightsOn: 3) == "house.slash")
        #expect(MenuBarLabel.symbolName(reachable: true, lightsOn: 0) == "house")
        #expect(MenuBarLabel.symbolName(reachable: true, lightsOn: 2) == "house.fill")
    }
}

@Suite("Événements SSE")
struct HomeEventTests {
    @Test func parsesSSEFramesIntoEvents() throws {
        var parser = SSEParser()
        let deviceJSON = #"{"type":"device","device":{"id":"hue:light:2","name":"Lampe chambre","kind":"light","source":"hue","room":"Chambre","state":{"on":true,"reachable":true},"capabilities":{}}}"#
        let lines = [": keep-alive", "event: message", "data: \(deviceJSON)\r", "", "", "data: {\"type\":\"error\",", "data: \"message\":\"hue down\"}", ""]
        var payloads: [String] = []
        for line in lines { if let p = parser.feed(line: line) { payloads.append(p) } }
        #expect(payloads.count == 2)

        let first = try JSONDecoder().decode(HomeEvent.self, from: Data(payloads[0].utf8))
        guard case .device(let device) = first else { Issue.record("attendu .device"); return }
        #expect(device.isLitLight)

        let second = try JSONDecoder().decode(HomeEvent.self, from: Data(payloads[1].utf8))
        #expect(second == .error("hue down"))
    }

    @Test func deviceEventUpsertsIntoSnapshot() throws {
        var snapshot = try JSONDecoder().decode(HomeSnapshot.self, from: fixture("home-snapshot"))
        #expect(snapshot.lightsOnCount == 2)
        snapshot.upsert(Device(id: "hue:light:2", name: "Lampe chambre", kind: .light, state: DeviceState(on: true)))
        #expect(snapshot.lightsOnCount == 3)
        #expect(snapshot.devices.count == 7)
        snapshot.upsert(Device(id: "hue:light:99", name: "Nouvelle", kind: .light, state: DeviceState(on: true)))
        #expect(snapshot.devices.count == 8)
        #expect(snapshot.lightsOnCount == 4)
    }

    @Test func snapshotEventDecodes() throws {
        let inner = String(decoding: try fixture("home-snapshot"), as: UTF8.self)
        let event = try JSONDecoder().decode(HomeEvent.self, from: Data(#"{"type":"snapshot","snapshot":\#(inner)}"#.utf8))
        guard case .snapshot(let s) = event else { Issue.record("attendu .snapshot"); return }
        #expect(s.lightsOnCount == 2)
    }

    @Test @MainActor func storeAppliesEvents() throws {
        let store = HomeStore(autoStart: false)
        store.apply(.snapshot(try JSONDecoder().decode(HomeSnapshot.self, from: fixture("home-snapshot"))))
        #expect(store.lightsOn == 2)
        store.apply(.device(Device(id: "hue:light:1", name: "Plafonnier", kind: .light, state: DeviceState(on: false))))
        #expect(store.lightsOn == 1)
    }
}

@Suite("URLs")
struct URLTests {
    @Test func widgetURL() {
        let url = AppSettings.webURL(widget: true, bridge: "http://localhost:8787/", scene: "/shared/demo-apartment.json")
        #expect(url?.absoluteString == "http://localhost:8787/?widget=1&scene=/shared/demo-apartment.json")
        #expect(AppSettings.apiURL("/api/home", bridge: "mac-mini.local:8787")?.absoluteString == "http://mac-mini.local:8787/api/home")
        #expect(AppSettings.webURL(widget: false, bridge: "http://192.168.1.20:8787", scene: "")?.absoluteString == "http://192.168.1.20:8787/")
        #expect(AppSettings.baseURL(from: "  ") == nil)
    }
}
