import Foundation
import Testing
@testable import Appart3DScan

/// Pièce factice Codable : l'enveloppe est générique, on teste l'encodage sans RoomPlan.
private struct FakeRoom: Codable, Sendable, Equatable {
    var identifier: String
    var walls: [FakeSurface]
    var objects: [FakeObject]
}

private struct FakeSurface: Codable, Sendable, Equatable {
    var dimensions: [Float]
}

private struct FakeObject: Codable, Sendable, Equatable {
    var category: [String: [String: String]]
}

private struct FakeStructure: Codable, Sendable {
    var rooms: [FakeRoom]
    var walls: [FakeSurface]
    var objects: [FakeObject]
}

private func json(_ data: Data) throws -> [String: Any] {
    try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
}

private let livingRoom = FakeRoom(identifier: "A", walls: [FakeSurface(dimensions: [5, 2.5, 0])],
                                  objects: [FakeObject(category: ["sofa": [:]])])
private let bedroom = FakeRoom(identifier: "B", walls: [FakeSurface(dimensions: [3, 2.5, 0])],
                               objects: [FakeObject(category: ["bed": [:]]), FakeObject(category: ["storage": [:]])])

@Suite("Enveloppe appart3d.roomplan")
struct EnvelopeExporterTests {
    private let date = Date(timeIntervalSince1970: 1_791_547_200) // 2026-10-09T12:00:00Z

    @Test func headerKeysArePresent() throws {
        let envelope = EnvelopeExporter.makeEnvelope(
            structure: Optional<FakeStructure>.none, rooms: [livingRoom], roomNames: ["Séjour"],
            capturedAt: date, device: "iPhone17,1", appVersion: "0.1.0")
        let root = try json(try EnvelopeExporter.encode(envelope))

        #expect(root["format"] as? String == "appart3d.roomplan")
        #expect(root["version"] as? Int == 1)
        #expect(root["capturedAt"] as? String == "2026-10-09T12:00:00Z")
        #expect(root["device"] as? String == "iPhone17,1")
        #expect(root["appVersion"] as? String == "0.1.0")
        #expect(Set(root.keys) == ["format", "version", "capturedAt", "device", "appVersion",
                                   "structure", "rooms", "roomNames"])
    }

    @Test func missingStructureIsEncodedAsNull() throws {
        let envelope = EnvelopeExporter.makeEnvelope(
            structure: Optional<FakeStructure>.none, rooms: [livingRoom], roomNames: ["Séjour"], capturedAt: date)
        let root = try json(try EnvelopeExporter.encode(envelope))
        #expect(root.keys.contains("structure"))
        #expect(root["structure"] is NSNull)
    }

    @Test func roomsAreEmbeddedAsTheirCodableRepresentation() throws {
        let structure = FakeStructure(rooms: [livingRoom, bedroom], walls: livingRoom.walls + bedroom.walls,
                                      objects: livingRoom.objects + bedroom.objects)
        let envelope = EnvelopeExporter.makeEnvelope(
            structure: structure, rooms: [livingRoom, bedroom], roomNames: ["Séjour", "Chambre"], capturedAt: date)
        let data = try EnvelopeExporter.encode(envelope)
        let root = try json(data)

        let rooms = try #require(root["rooms"] as? [[String: Any]])
        #expect(rooms.count == 2)
        #expect(rooms[0]["identifier"] as? String == "A")
        #expect((root["structure"] as? [String: Any])?["rooms"] is [Any])

        // Round-trip : les pièces décodées sont identiques aux originales (pas de mapping manuel).
        struct Decoded: Decodable { var rooms: [FakeRoom] }
        #expect(try JSONDecoder().decode(Decoded.self, from: data).rooms == [livingRoom, bedroom])
    }

    @Test func roomNamesAreAlignedWithRooms() throws {
        let tooFew = EnvelopeExporter.makeEnvelope(
            structure: Optional<FakeStructure>.none, rooms: [livingRoom, bedroom], roomNames: ["Séjour"], capturedAt: date)
        #expect(tooFew.roomNames == ["Séjour", "Pièce 2"])

        let tooMany = EnvelopeExporter.makeEnvelope(
            structure: Optional<FakeStructure>.none, rooms: [livingRoom], roomNames: ["Séjour", "Cuisine"], capturedAt: date)
        #expect(tooMany.roomNames == ["Séjour"])

        let blank = EnvelopeExporter.alignedNames(["  ", "Chambre "], count: 2)
        #expect(blank == ["Pièce 1", "Chambre"])

        let root = try json(try EnvelopeExporter.encode(tooFew))
        #expect((root["roomNames"] as? [String])?.count == (root["rooms"] as? [Any])?.count)
    }

    @Test func fileNameIsSanitized() {
        #expect(EnvelopeExporter.fileName(for: "Mon appart") == "Mon appart.appart3d.json")
        #expect(EnvelopeExporter.fileName(for: "Rue: 12/3") == "Rue- 12-3.appart3d.json")
        #expect(EnvelopeExporter.fileName(for: "   ") == "appartement.appart3d.json")
    }
}

@Suite("Résumé d'enveloppe")
struct ScanSummaryTests {
    @Test func summaryPrefersStructure() throws {
        let structure = FakeStructure(rooms: [livingRoom, bedroom], walls: [FakeSurface(dimensions: [1, 1, 0])],
                                      objects: [FakeObject(category: ["sofa": [:]])])
        let envelope = EnvelopeExporter.makeEnvelope(
            structure: structure, rooms: [livingRoom, bedroom], roomNames: ["Séjour", "Chambre"])
        let summary = try ScanSummary.from(envelopeData: try EnvelopeExporter.encode(envelope))
        #expect(summary.fromMergedStructure)
        #expect(summary.roomCount == 2)
        #expect(summary.walls == 1)
        #expect(summary.objectsByCategory == ["sofa": 1])
    }

    @Test func summaryFallsBackToRooms() throws {
        let envelope = EnvelopeExporter.makeEnvelope(
            structure: Optional<FakeStructure>.none, rooms: [livingRoom, bedroom], roomNames: [])
        let summary = try ScanSummary.from(envelopeData: try EnvelopeExporter.encode(envelope))
        #expect(!summary.fromMergedStructure)
        #expect(summary.walls == 2)
        #expect(summary.objectsByCategory == ["sofa": 1, "bed": 1, "storage": 1])
    }

    @Test func bundledDemoEnvelopeMatchesContract() throws {
        let url = try #require(Bundle(for: BundleToken.self).url(forResource: "sample.appart3d", withExtension: "json")
            ?? Bundle.main.url(forResource: "sample.appart3d", withExtension: "json"))
        let data = try Data(contentsOf: url)
        let root = try json(data)
        #expect(root["format"] as? String == "appart3d.roomplan")
        #expect(root["version"] as? Int == 1)
        #expect((root["roomNames"] as? [String])?.count == (root["rooms"] as? [Any])?.count)
        let summary = try ScanSummary.from(envelopeData: data)
        #expect(summary.roomCount == 2)
        #expect(summary.objectCount > 0)
    }
}

private final class BundleToken {}
