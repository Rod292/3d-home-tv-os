import ARKit
import Foundation
import Observation
import RoomPlan

/// Pilote une session de scan multi-pièces.
///
/// Approche multi-pièces d'Apple (« Scanning the rooms of a single structure ») : une seule `RoomCaptureView`
/// construite sur un seul `ARSession`, réutilisée pour toutes les pièces. Entre deux pièces on appelle
/// `stop(pauseARSession: false)` puis `run(configuration:)` : le suivi ARKit continue, donc toutes les
/// `CapturedRoom` partagent la même origine monde, ce qu'exige `StructureBuilder`.
@MainActor
@Observable
final class ScanSession {
    enum Phase: Equatable {
        /// Prêt à scanner (avant la première pièce ou entre deux pièces).
        case ready
        case scanning
        /// Scan arrêté, RoomPlan calcule la pièce.
        case processing
        /// Pièce prête : l'utilisateur la nomme.
        case naming
        case merging
        case exporting
        case finished
        case failed(String)
    }

    let projectID = UUID()
    let projectName: String

    private(set) var phase: Phase = .ready
    private(set) var rooms: [CapturedRoom] = []
    private(set) var roomNames: [String] = []
    private(set) var pendingRoom: CapturedRoom?
    private(set) var instruction: ScanInstruction = .normal
    /// Erreur non bloquante à afficher (scan interrompu, fusion échouée…).
    var notice: String?
    private(set) var result: ScanProject?

    @ObservationIgnored private let arSession = ARSession()
    @ObservationIgnored private var cachedCaptureView: RoomCaptureView?
    @ObservationIgnored private var coordinator: RoomCaptureCoordinator?

    static var isSupported: Bool { RoomCaptureSession.isSupported }

    init(projectName: String) {
        self.projectName = projectName
    }

    /// Vue de capture unique pour toute la session (créée à la demande, uniquement sur appareil compatible).
    var captureView: RoomCaptureView {
        if let cachedCaptureView { return cachedCaptureView }
        let view = RoomCaptureView(frame: .zero, arSession: arSession)
        let coordinator = RoomCaptureCoordinator(owner: self)
        view.delegate = coordinator
        view.captureSession.delegate = coordinator
        self.coordinator = coordinator
        cachedCaptureView = view
        return view
    }

    var nextRoomNumber: Int { rooms.count + 1 }

    // MARK: Actions utilisateur

    func startRoom() {
        guard Self.isSupported, phase == .ready else { return }
        pendingRoom = nil
        notice = nil
        instruction = .normal
        var configuration = RoomCaptureSession.Configuration()
        configuration.isCoachingEnabled = true
        captureView.captureSession.run(configuration: configuration)
        phase = .scanning
    }

    func stopRoom() {
        guard phase == .scanning else { return }
        // Ne pas mettre ARSession en pause : la pièce suivante doit garder le même repère monde.
        captureView.captureSession.stop(pauseARSession: false)
        phase = .processing
    }

    func acceptPendingRoom(named name: String) {
        guard let room = pendingRoom else { return }
        rooms.append(room)
        roomNames.append(EnvelopeExporter.alignedNames([name], count: 1).first ?? "Pièce \(rooms.count)")
        pendingRoom = nil
        phase = .ready
    }

    func discardPendingRoom() {
        pendingRoom = nil
        phase = .ready
    }

    func removeRoom(at index: Int) {
        guard rooms.indices.contains(index) else { return }
        rooms.remove(at: index)
        roomNames.remove(at: index)
    }

    /// Fusionne les pièces, exporte l'enveloppe + USDZ et enregistre le projet.
    func finish(store: ProjectStore) async {
        guard !rooms.isEmpty, phase == .ready else { return }
        arSession.pause()
        phase = .merging
        let outcome = await StructureMerger.merge(rooms)
        notice = outcome.warning

        phase = .exporting
        do {
            let folder = try store.makeFolder(for: projectID)
            let project = try await ScanExportService.exportCapture(
                id: projectID, name: projectName, structure: outcome.structure,
                rooms: rooms, roomNames: roomNames, folder: folder
            )
            try store.register(project)
            result = project
            phase = .finished
        } catch {
            store.discardFolder(for: projectID)
            phase = .failed("L'export a échoué : \(error.localizedDescription)")
        }
    }

    /// Retour à l'état prêt après un échec d'export (les pièces scannées sont conservées).
    func recoverFromFailure() {
        if case .failed = phase { phase = .ready }
    }

    func cancel() {
        if phase == .scanning { cachedCaptureView?.captureSession.stop() }
        arSession.pause()
    }

    // MARK: Callbacks RoomPlan (via RoomCaptureCoordinator)

    func roomProcessed(_ room: CapturedRoom, errorMessage: String?) {
        guard phase == .processing || phase == .scanning else { return }
        if let errorMessage { notice = "Résultat partiel : \(errorMessage)" }
        pendingRoom = room
        phase = .naming
    }

    func instructionChanged(_ value: ScanInstruction) {
        guard phase == .scanning else { return }
        instruction = value
    }

    func captureFailed(_ message: String) {
        notice = "Scan interrompu : \(message)"
        if phase == .scanning || phase == .processing { phase = .ready }
    }
}
