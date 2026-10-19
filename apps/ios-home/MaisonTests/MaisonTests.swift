import Foundation
import Testing
@testable import Maison

// MARK: - Décodage

struct SnapshotDecodingTests {
    func fixture() throws -> Data {
        let url = try #require(Bundle(for: BundleToken.self).url(forResource: "home-snapshot", withExtension: "json"))
        return try Data(contentsOf: url)
    }

    @Test func decodesFixtureTolerantly() throws {
        let snap = try JSONDecoder().decode(HomeSnapshot.self, from: fixture())
        #expect(snap.home == "Appartement d'Alex")
        #expect(snap.devices.count == 7)
        #expect(snap.scenes.map(\.id) == ["bright", "cozy", "movie", "night", "away"])
        let ceiling = try #require(snap.device("hue:light:1"))
        #expect(ceiling.state.brightness == 80)
        #expect(ceiling.capabilities.color == true)
        #expect(ceiling.itemId == "item-ceiling-1")
        let unreachable = try #require(snap.device("hue:light:3"))
        #expect(unreachable.state.on == nil)
        #expect(unreachable.state.reachable == false)
        let fan = try #require(snap.device("ha:fan.windcalm"))
        #expect(fan.capabilities.speedSteps == 6)
        #expect(fan.state.lightOn == true)
        let tv = try #require(snap.device("robot:tv"))
        #expect(tv.capabilities.buttons == ["power", "vol+", "vol-"])
        let aquarium = try #require(snap.device("mock:aquarium"))
        #expect(aquarium.kind == .unknown("aquarium"))
        #expect(!aquarium.isSupported)
        // Plafonnier + lampadaire (prise) ; la lampe injoignable ne compte pas.
        #expect(snap.lightsOnCount == 2)
    }

    @Test func roundTripsThroughCache() throws {
        let snap = MockHomeHub.initialSnapshot()
        let data = try JSONEncoder().encode(snap)
        let back = try JSONDecoder().decode(HomeSnapshot.self, from: data)
        #expect(back == snap)
    }

    @Test func encodesActionsLikeTheContract() throws {
        func json(_ a: DeviceAction) throws -> [String: AnyHashable] {
            try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(a)) as? [String: AnyHashable])
        }
        #expect(try json(.toggle) == ["type": "toggle"])
        #expect(try json(.power(false)) == ["type": "power", "on": false])
        #expect(try json(.brightness(42)) == ["type": "brightness", "value": 42])
        #expect(try json(.color("#ff0000")) == ["type": "color", "hex": "#ff0000"])
        #expect(try json(.volumeStep(-3)) == ["type": "volumeStep", "delta": -1])
        #expect(try json(.button("source:HDMI 1")) == ["type": "button", "name": "source:HDMI 1"])
    }

    @Test func encodesPathsLikeEncodeURIComponent() {
        #expect(HomeAPI.action("hue:light:12") == "/api/home/devices/hue%3Alight%3A12/action")
        #expect(HomeAPI.action("ha:fan.create_windcalm") == "/api/home/devices/ha%3Afan.create_windcalm/action")
        #expect(HomeAPI.scene("cozy") == "/api/home/scenes/cozy")
    }

    @Test func decodesEmbedEvents() {
        #expect(EmbedEvent.from(messageBody: ["type": "ready"]) == .ready)
        #expect(EmbedEvent.from(messageBody: ["type": "itemTapped", "itemId": "item_30", "deviceIds": ["a", "b"]])
                == .itemTapped(itemId: "item_30", deviceIds: ["a", "b"]))
        #expect(EmbedEvent.from(messageBody: "{\"type\":\"error\",\"message\":\"x\"}") == .error("x"))
        #expect(EmbedCommand.focusItem("item_fan").json.contains("\"itemId\":\"item_fan\""))
        #expect(EmbedCommand.focusItem(nil).json.contains("\"itemId\":null"))
    }
}

final class BundleToken {}

// MARK: - SSE

struct SSEParserTests {
    @Test func parsesEventsAcrossLines() {
        var p = SSEParser()
        let a = p.feed(line: ": keep-alive")
        let b = p.feed(line: "event: message")
        let c = p.feed(line: "data: {\"type\":\"device\",")
        let d = p.feed(line: "data:\"device\":{\"id\":\"x\",\"kind\":\"light\"}}\r")
        #expect(a == nil && b == nil && c == nil && d == nil)
        let payload = p.feed(line: "")
        #expect(payload == "{\"type\":\"device\",\n\"device\":{\"id\":\"x\",\"kind\":\"light\"}}")
        let again = p.feed(line: "")
        #expect(again == nil)
    }

    @Test func decodesHomeEvents() throws {
        let device = #"{"type":"device","device":{"id":"hue:light:12","name":"Bandeau","kind":"light","source":"hue","room":"Salon","state":{"on":true,"reachable":true,"brightness":50},"capabilities":{"brightness":true}}}"#
        guard case .device(let d) = try JSONDecoder().decode(HomeEvent.self, from: Data(device.utf8)) else {
            Issue.record("événement device attendu"); return
        }
        #expect(d.state.brightness == 50)
        let other = try JSONDecoder().decode(HomeEvent.self, from: Data(#"{"type":"hello"}"#.utf8))
        #expect(other == .unknown("hello"))
    }
}

// MARK: - Réducteur optimiste

struct ReducerTests {
    let base = MockHomeHub.initialSnapshot()

    @Test func togglesAndDims() throws {
        let strip = try #require(base.device("hue:light:12"))
        let off = HomeReducer.apply(.toggle, to: strip)
        #expect(off.state.on == false)
        let dim = HomeReducer.apply(.brightness(30), to: off)
        #expect(dim.state.on == true)
        #expect(dim.state.brightness == 30)
        #expect(HomeReducer.apply(.brightness(0), to: dim).state.on == false)
        #expect(HomeReducer.apply(.brightness(250), to: dim).state.brightness == 100)
    }

    @Test func colorAndKelvin() throws {
        let lamp = try #require(base.device("hue:light:18"))
        let red = HomeReducer.apply(.color("#FF0000"), to: lamp)
        #expect(red.state.color == "#ff0000")
        #expect(red.state.kelvin == nil)
        let warm = HomeReducer.apply(.kelvin(2700), to: red)
        #expect(warm.state.kelvin == 2700)
        #expect(warm.state.color == "#ffb46b")
    }

    @Test func unreachableIsUntouched() throws {
        let lustre = try #require(base.device("hue:light:9"))
        #expect(HomeReducer.apply(.toggle, to: lustre) == lustre)
    }

    @Test func fanSpeedAndPower() throws {
        let fan = try #require(base.device("ha:fan.create_windcalm"))
        let stopped = HomeReducer.apply(.speed(0), to: fan)
        #expect(stopped.state.on == false)
        let restarted = HomeReducer.apply(.toggle, to: stopped)
        #expect(restarted.state.on == true)
        #expect(restarted.state.speed == 17)
        #expect(FanMath.step(for: 50, steps: 6) == 3)
        #expect(FanMath.speed(forStep: 6, steps: 6) == 100)
        #expect(FanMath.step(for: 1, steps: 6) == 1)
        #expect(HomeReducer.apply(.fanLight(true), to: fan).state.lightOn == true)
    }

    @Test func tvButtons() throws {
        var tv = try #require(base.device("ha:media_player.philips_tv"))
        tv = HomeReducer.apply(.power(true), to: tv)
        tv = HomeReducer.apply(.volume(20), to: tv)
        tv = HomeReducer.apply(.volumeStep(1), to: tv)
        tv = HomeReducer.apply(.button("source:Netflix"), to: tv)
        #expect(tv.state.volume == 21)
        #expect(tv.state.source == "Netflix")
    }

    @Test func scenesMatchBridgePlans() {
        let away = HomeReducer.apply(scene: "away", to: base)
        #expect(away.lightsOnCount == 0)
        #expect(away.device("ha:fan.create_windcalm")?.state.on == false)
        let bright = HomeReducer.apply(scene: "bright", to: away)
        // Toutes les lampes joignables (le lustre est injoignable ; l'Ambilight n'est plus une lampe).
        #expect(bright.lightsOnCount == 4)
        #expect(bright.device("hue:light:17")?.state.kelvin == 4000)
        let movie = HomeReducer.apply(scene: "movie", to: bright)
        // Film : l'Ambilight (dans la télé) en violet tamisé, toutes les lampes éteintes.
        let tv = try? #require(movie.device("ha:media_player.philips_tv"))
        #expect(tv?.state.on == true)
        #expect(tv?.state.ambilight == AmbilightState(on: true, color: "#4b1fd1", brightness: 25, effect: nil))
        #expect(movie.lightsOnCount == 0)
        // Absent : Ambilight éteint avec la télé.
        let away2 = HomeReducer.apply(scene: "away", to: movie)
        #expect(away2.device("ha:media_player.philips_tv")?.state.ambilight?.on == false)
        #expect(away2.device("ha:media_player.philips_tv")?.state.on == false)
        // Cosy ne touche pas à l'Ambilight.
        let cozy = HomeReducer.apply(scene: "cozy", to: movie)
        #expect(cozy.device("ha:media_player.philips_tv")?.state.ambilight == tv?.state.ambilight)
    }

    @Test func noStandaloneAmbilightInDemo() {
        #expect(!base.devices.contains { $0.name == "Ambilight" })
        #expect(base.devices.filter { $0.kind == .tv }.count == 1)
    }

    @Test func ambilightAndAppPredictions() throws {
        var tv = try #require(base.device("ha:media_player.philips_tv"))
        tv = HomeReducer.apply(.ambilight(on: false), to: tv)
        #expect(tv.state.ambilight?.on == false)
        tv = HomeReducer.apply(.ambilight(on: true, hex: "#FF4F3D"), to: tv)
        #expect(tv.state.ambilight == AmbilightState(on: true, color: "#ff4f3d", brightness: nil, effect: nil))
        tv = HomeReducer.apply(.ambilight(on: true, brightness: 140), to: tv)
        #expect(tv.state.ambilight?.brightness == 100)
        tv = HomeReducer.apply(.ambilight(effect: "FOLLOW_AUDIO: VU_METER"), to: tv)
        #expect(tv.state.ambilight?.effect == "FOLLOW_AUDIO: VU_METER")
        #expect(tv.state.ambilight?.color == nil)
        tv = HomeReducer.apply(.power(false), to: tv)
        tv = HomeReducer.apply(.button("app:com.disney.disneyplus"), to: tv)
        #expect(tv.state.on == true)
        #expect(tv.state.media?.app == "Disney+")
    }
}

// MARK: - Ordre des tuiles

struct DeviceOrderTests {
    let order = ["a1", "b1", "a2", "c1", "a3", "b2"]

    @Test func movesForwardAndBackward() {
        #expect(DeviceOrder.move("a1", onto: "c1", in: order) == ["b1", "a2", "c1", "a1", "a3", "b2"])
        #expect(DeviceOrder.move("b2", onto: "b1", in: order) == ["a1", "b2", "b1", "a2", "c1", "a3"])
        #expect(DeviceOrder.move("a1", onto: "a1", in: order) == order)
        #expect(DeviceOrder.move("zz", onto: "a1", in: order) == order)
    }

    @Test func moveWithinFilteredRoomKeepsGlobalConsistency() {
        // Pièce « a » filtrée : a1, a2, a3. Glisser a3 sur a1 (vers le haut) → a3 juste avant a1.
        let up = DeviceOrder.move("a3", onto: "a1", in: order)
        #expect(up == ["a3", "a1", "b1", "a2", "c1", "b2"])
        #expect(up.filter { $0.hasPrefix("a") } == ["a3", "a1", "a2"])
        // Glisser a1 sur a2 (vers le bas) → juste après a2, les autres pièces gardent leur ordre relatif.
        let down = DeviceOrder.move("a1", onto: "a2", in: order)
        #expect(down.filter { $0.hasPrefix("a") } == ["a2", "a1", "a3"])
        #expect(down.filter { !$0.hasPrefix("a") } == ["b1", "c1", "b2"])
    }

    @Test func appliesOrderUnlistedLast() {
        let devices = ["x", "y", "z", "w"].map { Device(id: $0, name: $0, kind: .light, state: DeviceState(on: false)) }
        #expect(DeviceOrder.apply(["z", "x"], to: devices).map(\.id) == ["z", "x", "y", "w"])
    }

    @Test func mockReorderPersistsOrder() async throws {
        let ids = MockHomeHub.initialSnapshot().devices.map(\.id)
        let snap = await MockHomeHub().setOrder(ids.reversed())
        #expect(snap.devices.map(\.id) == ids.reversed())
        await MockHomeHub.shared.reset()
    }
}

// MARK: - Ambilight et applis TV

struct TvContractTests {
    let json = """
    {"id":"ha:media_player.tv","name":"TV","kind":"tv","source":"homeassistant","room":"Salon","itemId":"item_30",
     "state":{"on":true,"reachable":true,"media":{"state":"playing","app":"YouTube"},
              "ambilight":{"on":true,"effect":"FOLLOW_VIDEO: STANDARD","future":1}},
     "capabilities":{"volume":true,"buttons":["source:HDMI 1","app:com.netflix.ninja","app:tv.arte.plus7","tv_power"],
              "ambilight":{"color":true,"brightness":true,"effects":["FOLLOW_VIDEO: STANDARD","FOLLOW_AUDIO: VU_METER"]},
              "apps":[{"id":"com.netflix.ninja","label":"Netflix"},{"id":"tv.arte.plus7","label":"ARTE"}]}}
    """

    @Test func decodesAmbilightAndApps() throws {
        let tv = try JSONDecoder().decode(Device.self, from: Data(json.utf8))
        #expect(tv.state.ambilight == AmbilightState(on: true, effect: "FOLLOW_VIDEO: STANDARD"))
        #expect(tv.capabilities.ambilight?.effects?.count == 2)
        #expect(tv.capabilities.tvApps.map(\.label) == ["Netflix", "ARTE"])
        #expect(tv.capabilities.sources == ["HDMI 1"])
        #expect(tv.capabilities.remoteButtons == ["tv_power"])
    }

    @Test func appsFallBackToButtons() throws {
        let caps = DeviceCapabilities(buttons: ["app:com.example.super_app"])
        #expect(caps.tvApps == [TvApp(id: "com.example.super_app", label: "Super app")])
    }

    @Test func encodesAmbilightAction() throws {
        let data = try JSONEncoder().encode(DeviceAction.ambilight(on: true, hex: "#4b1fd1", brightness: 25))
        let obj = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(obj["type"] as? String == "ambilight")
        #expect(obj["hex"] as? String == "#4b1fd1")
        #expect(obj["brightness"] as? Int == 25)
        #expect(obj["effect"] == nil)
        let off = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(DeviceAction.ambilight(on: false))) as? [String: Any])
        #expect(off.count == 2)
        #expect(off["on"] as? Bool == false)
    }

    @Test func effectLabels() {
        #expect(AmbilightText.label("FOLLOW_VIDEO: STANDARD") == "Vidéo · Standard")
        #expect(AmbilightText.label("FOLLOW_AUDIO: VU_METER") == "Son · VU-mètre")
        #expect(AmbilightText.label("FOLLOW_COLOR: HOT_LAVA") == "Couleur · Lave")
        #expect(AmbilightText.label("FOLLOW_AUDIO: PARTY: Expert") == "Son · Fête (expert)")
        #expect(AmbilightText.label("Mode: lounge") == "Mode · Lounge")
        #expect(AmbilightText.label("FOLLOW_VIDEO: NEW_THING") == "Vidéo · New thing")
        #expect(AmbilightText.label("weird") == "weird")
        #expect(AmbilightText.shortLabel("FOLLOW_VIDEO: VIVID") == "Vif")
    }

    @Test func brandStyles() {
        #expect(TvAppStyle.brand(id: "com.netflix.ninja", label: "Netflix").accent == "#e50914")
        #expect(TvAppStyle.brand(label: "TF1+").accent == "#e2001a")
        #expect(TvAppStyle.brand(id: "org.droidtv.playtv", label: "TV").symbol == "antenna.radiowaves.left.and.right")
        let g = TvAppStyle.brand(label: "Inconnue")
        #expect(g.symbol == "app.fill")
        #expect(g == TvAppStyle.brand(label: "Inconnue"))
    }
}

// MARK: - Lien d'appairage

struct PairLinkTests {
    @Test func parsesQRCodeURL() throws {
        let link = try #require(PairLink.parse("http://192.168.1.20:8787/pair?code=123456"))
        #expect(link.bridgeURL.absoluteString == "http://192.168.1.20:8787")
        #expect(link.code == "123456")
    }

    @Test func toleratesVariants() throws {
        #expect(PairLink.parse("  192.168.1.20:8787 ")?.bridgeURL.absoluteString == "http://192.168.1.20:8787")
        #expect(PairLink.parse("192.168.1.20:8787")?.code == nil)
        #expect(PairLink.parse("http://mac.local:8787/pair?code=12345")?.code == nil)
        #expect(PairLink.parse("ftp://x/pair?code=123456") == nil)
        #expect(PairLink.parse("") == nil)
        #expect(PairLink.normalizeCode("123 456") == "123456")
        #expect(PairLink.baseURL(from: "192.168.1.20")?.absoluteString == "http://192.168.1.20:8787")
        #expect(PairLink.baseURL(from: "http://192.168.1.20")?.absoluteString == "http://192.168.1.20")
        let local = PairLink.parse("http://my-macbook-pro.local:8787/pair?code=654321")
        #expect(local?.bridgeURL.absoluteString == "http://my-macbook-pro.local:8787")
        #expect(local?.code == "654321")
    }

    @Test func ignoresTestBridges() {
        #expect(BridgeResolver.isTestService("Chez Alex et Sam (simulation)"))
        #expect(BridgeResolver.isTestService("Appart3D test"))
        #expect(!BridgeResolver.isTestService("Chez Alex et Sam"))
    }
}

// MARK: - Logique des intents (faux client)

actor FakeClient: HomeClient {
    var snap: HomeSnapshot
    var actions: [(String, DeviceAction)] = []
    var scenes: [String] = []
    var failing = false

    init(_ snap: HomeSnapshot) { self.snap = snap }

    func setFailing(_ f: Bool) { failing = f }

    func snapshot() async throws -> HomeSnapshot {
        if failing { throw HomeError.offline }
        return snap
    }

    func perform(_ action: DeviceAction, on deviceId: String) async throws -> Device {
        if failing { throw HomeError.offline }
        actions.append((deviceId, action))
        snap = HomeReducer.apply(action, deviceId: deviceId, to: snap)
        return snap.device(deviceId)!
    }

    func activateScene(_ sceneId: String) async throws -> HomeSnapshot {
        if failing { throw HomeError.offline }
        scenes.append(sceneId)
        snap = HomeReducer.apply(scene: sceneId, to: snap)
        return snap
    }

    nonisolated func events() -> AsyncThrowingStream<HomeEvent, Error> {
        AsyncThrowingStream { $0.finish() }
    }
}

struct IntentLogicTests {
    @Test func toggleTurnsEverythingOffWhenSomethingIsOn() async throws {
        let fake = FakeClient(MockHomeHub.initialSnapshot())
        let (outcome, after) = try await HomeActions(client: fake).toggleLights(lastSceneId: "cozy")
        #expect(outcome == .turnedOff(count: 2))
        #expect(after.lightsOnCount == 0)
        let sent = await fake.actions
        #expect(sent.count == 2)
        #expect(sent.allSatisfy { $0.1 == .power(false) })
        #expect(await fake.scenes.isEmpty)
    }

    @Test func toggleRestoresLastSceneWhenDark() async throws {
        let dark = HomeReducer.apply(scene: "away", to: MockHomeHub.initialSnapshot())
        let fake = FakeClient(dark)
        let (outcome, after) = try await HomeActions(client: fake).toggleLights(lastSceneId: "cozy")
        #expect(outcome == .scene(id: "cozy", name: "Cosy"))
        #expect(after.anyLightOn)
        #expect(await fake.scenes == ["cozy"])
    }

    @Test func toggleFallsBackToBright() {
        let dark = HomeReducer.apply(scene: "away", to: MockHomeHub.initialSnapshot())
        #expect(HomeActions.togglePlan(for: dark, lastSceneId: nil) == .scene(id: "bright", name: "Lumineux"))
        // « Nuit » / « Absent » ne sont pas des ambiances à rallumer.
        #expect(HomeActions.togglePlan(for: dark, lastSceneId: "away") == .scene(id: "bright", name: "Lumineux"))
    }

    @Test func setLightsAndAllOff() async throws {
        let fake = FakeClient(MockHomeHub.initialSnapshot())
        let actions = HomeActions(client: fake)
        let on = try await actions.setLights(on: true, lastSceneId: nil)
        #expect(on.lightsOnCount == 2) // déjà allumées : rien à faire
        #expect(await fake.scenes.isEmpty)
        let off = try await actions.allOff()
        #expect(off.lightsOnCount == 0)
        #expect(await fake.scenes == ["away"])
    }

    @Test func failsGracefullyOffLAN() async {
        let fake = FakeClient(MockHomeHub.initialSnapshot())
        await fake.setFailing(true)
        await #expect(throws: HomeError.offline) {
            try await HomeActions(client: fake).toggleLights(lastSceneId: nil)
        }
        #expect(HomeError.offline.shortMessage.contains("Wi-Fi"))
        let intentError = MaisonIntentError(URLError(.timedOut))
        #expect(intentError.message == HomeError.offline.shortMessage)
    }

    @Test func summaries() {
        #expect(HomeText.lightsSummary(0) == "Tout est éteint")
        #expect(HomeText.lightsSummary(1) == "1 lumière allumée")
        #expect(HomeText.lightsSummary(2) == "2 lumières allumées")
    }
}

// MARK: - Soleil et ambiance 3D

struct DaylightTests {
    private func json(_ c: EmbedCommand) throws -> [String: AnyHashable] {
        try #require(JSONSerialization.jsonObject(with: Data(c.json.utf8)) as? [String: AnyHashable])
    }

    @Test func decodesSunWhenPresent() throws {
        let data = Data("""
        {"home":"H","devices":[],"scenes":[],"updatedAt":"x",
         "sun":{"elevation":12.5,"isDay":true,"nextRising":"2026-10-15T06:10:00Z","nextSetting":"2026-10-14T17:05:00Z"}}
        """.utf8)
        let snap = try JSONDecoder().decode(HomeSnapshot.self, from: data)
        let sun = try #require(snap.sun)
        #expect(sun.elevation == 12.5)
        #expect(sun.isDay)
        #expect(sun.nextSetting == "2026-10-14T17:05:00Z")
        // Conservé par le cache (SharedStore).
        let back = try JSONDecoder().decode(HomeSnapshot.self, from: JSONEncoder().encode(snap))
        #expect(back.sun == sun)
    }

    @Test func toleratesMissingOrBrokenSun() throws {
        let absent = try JSONDecoder().decode(HomeSnapshot.self, from: Data(#"{"home":"H","devices":[]}"#.utf8))
        #expect(absent.sun == nil)
        let broken = try JSONDecoder().decode(HomeSnapshot.self, from: Data(#"{"home":"H","devices":[],"sun":{"elevation":"haut"}}"#.utf8))
        #expect(broken.sun == nil)
        #expect(broken.home == "H")
    }

    @Test func encodesNewEmbedCommands() throws {
        #expect(try json(.setDaylight(.auto)) == ["type": "setDaylight", "mode": "auto"])
        #expect(try json(.setDaylight(.night)) == ["type": "setDaylight", "mode": "night"])
        #expect(try json(.frame(.living)) == ["type": "frame", "target": "living"])
        #expect(try json(.frame(.all)) == ["type": "frame", "target": "all"])
    }

    @Test func sceneURLCarriesDaylightAndFrame() throws {
        let url = try #require(EmbedController.sceneURL(bridge: URL(string: "http://192.168.1.20:8787"), demo: false, daylight: .night, frame: .all))
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        #expect(items.contains(URLQueryItem(name: "view", value: "3d")))
        #expect(items.contains(URLQueryItem(name: "daylight", value: "night")))
        #expect(items.contains(URLQueryItem(name: "frame", value: "all")))
        #expect(!items.contains { $0.name == "night" })
        let def = try #require(EmbedController.sceneURL(bridge: URL(string: "http://h:8787"), demo: false))
        #expect(def.absoluteString.contains("daylight=auto"))
        #expect(def.absoluteString.contains("frame=living"))
    }

    @Test func mixFollowsElevation() {
        #expect(Daylight.dayMix(elevation: 30) == 1)
        #expect(Daylight.dayMix(elevation: 6) == 1)
        #expect(Daylight.dayMix(elevation: -6) == 0)
        #expect(Daylight.dayMix(elevation: -20) == 0)
        #expect(abs(Daylight.dayMix(elevation: 0) - 0.5) < 1e-9)
        #expect(Daylight.dayMix(elevation: 2) > 0.5 && Daylight.dayMix(elevation: 2) < 1)
        // Crépuscule : maximal à l'horizon, nul en plein jour / pleine nuit.
        #expect(Daylight.dusk(elevation: 0) == 1)
        #expect(Daylight.dusk(elevation: 30) == 0)
        #expect(Daylight.dusk(elevation: -20) == 0)
        #expect(Daylight.dusk(elevation: 2) > 0.5)
    }

    @Test func modesAndFallbacks() {
        let up = SunInfo(elevation: 25, isDay: true)
        let down = SunInfo(elevation: -15, isDay: false)
        #expect(Daylight.ambiance(mode: .auto, sun: up).day == 1)
        #expect(Daylight.ambiance(mode: .auto, sun: down).day == 0)
        #expect(Daylight.ambiance(mode: .day, sun: down).day == 1)
        #expect(Daylight.ambiance(mode: .night, sun: up).day == 0)
        #expect(Daylight.mode("auto") == .auto)
        #expect(Daylight.mode("weird") == .auto)
        #expect(Daylight.mode("night") == .night)
        // Sans soleil : l'heure locale.
        #expect(Daylight.dayMix(hour: 13) == 1)
        #expect(Daylight.dayMix(hour: 2) == 0)
        #expect(Daylight.dayMix(hour: 7) > 0 && Daylight.dayMix(hour: 7) < 1)
        #expect(Daylight.isNight(mode: .auto, sun: down))
        #expect(!Daylight.isNight(mode: .auto, sun: up))
        #expect(Daylight.isNight(mode: .night, sun: up))
    }
}

// MARK: - Lecture en cours (HomePod, TV)

struct MediaTests {
    let speakerJSON = """
    {"id":"airplay:homepod","name":"HomePod mini","kind":"speaker","source":"airplay","room":"Salon","itemId":"item_homepod",
     "state":{"on":true,"reachable":true,"volume":49,"media":{"state":"playing","title":"Lumière d'octobre","artist":"Les Voisins",
       "app":"Musique","position":60,"duration":200,"updatedAt":"2026-10-14T15:00:00.000Z","artworkUrl":"/api/home/media/airplay%3Ahomepod/artwork?h=abc","future":1}},
     "capabilities":{"volume":true,"media":["play","pause","next"]}}
    """

    @Test func decodesSpeakerWithMedia() throws {
        let d = try JSONDecoder().decode(Device.self, from: Data(speakerJSON.utf8))
        #expect(d.kind == .speaker)
        #expect(d.isSupported)
        #expect(d.state.media?.state == .playing)
        #expect(d.state.media?.title == "Lumière d'octobre")
        #expect(d.state.media?.artworkUrl?.hasPrefix("/api/home/media/") == true)
        #expect(d.capabilities.canMedia(.playPause))
        #expect(d.capabilities.canMedia(.next))
        #expect(!d.capabilities.canMedia(.previous))
        #expect(HomeText.deviceState(d) == "♪ Lumière d'octobre")
    }

    @Test func unknownMediaStateIsIdle() throws {
        let m = try JSONDecoder().decode(MediaInfo.self, from: Data(#"{"state":"buffering"}"#.utf8))
        #expect(m.state == .idle)
        #expect(!m.isActive)
    }

    @Test func positionInterpolation() throws {
        let at = try #require(MediaInfo.parseDate("2026-10-14T15:00:00.000Z"))
        let m = MediaInfo(state: .playing, position: 60, duration: 200, updatedAt: "2026-10-14T15:00:00.000Z")
        #expect(abs((m.position(at: at.addingTimeInterval(15)) ?? 0) - 75) < 0.01)
        #expect(m.position(at: at.addingTimeInterval(9999)) == 200)
        var paused = m
        paused.state = .paused
        #expect(paused.position(at: at.addingTimeInterval(15)) == 60)
        #expect(MediaInfo.format(187) == "3:07")
        #expect(MediaInfo.format(nil) == "–:––")
    }

    @Test func encodesMediaAction() throws {
        let json = String(decoding: try JSONEncoder().encode(DeviceAction.media(.playPause)), as: UTF8.self)
        #expect(json.contains(#""type":"media""#))
        #expect(json.contains(#""command":"playPause""#))
        #expect(HomeAPI.artwork("airplay:homepod") == "/api/home/media/airplay%3Ahomepod/artwork")
    }

    @Test func reducerAndScenes() throws {
        let d = try JSONDecoder().decode(Device.self, from: Data(speakerJSON.utf8))
        let paused = HomeReducer.apply(.toggle, to: d)
        #expect(paused.state.media?.state == .paused)
        #expect(paused.state.on == false)
        #expect(HomeReducer.apply(.media(.play), to: paused).state.media?.state == .playing)
        #expect(HomeReducer.apply(.media(.next), to: d).state.media?.position == 0)
        let movie = try #require(ScenePlanner.plan("movie", devices: [d]))
        #expect(movie.first { $0.deviceId == d.id }?.actions == [.media(.pause)])
        #expect(ScenePlanner.plan("away", devices: [d])?.contains { $0.deviceId == d.id } == true)
        #expect(ScenePlanner.plan("movie", devices: [paused])?.contains { $0.deviceId == d.id } == false)
        #expect(ScenePlanner.plan("cozy", devices: [d])?.contains { $0.deviceId == d.id } == false)
    }

    @Test func mockHasHomePodAndNetflix() {
        let snap = MockHomeHub.initialSnapshot()
        #expect(snap.devices.nowPlaying?.id == "airplay:homepod")
        #expect(snap.device("ha:media_player.philips_tv")?.state.media?.app == "Netflix")
    }
}
