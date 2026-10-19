import Foundation
import RoomPlan

/// Reçoit les callbacks RoomPlan (vue + session) et les relaie à `ScanSession` sur le MainActor.
///
/// Les protocoles RoomPlan ne sont pas annotés pour la concurrence : les méthodes sont donc `nonisolated`,
/// ne transportent que des valeurs `Sendable` (`CapturedRoom`, `ScanInstruction`, `String`) et sautent
/// explicitement sur le MainActor. `RoomCaptureViewDelegate` exige `NSCoding` (non utilisé ici).
@MainActor
final class RoomCaptureCoordinator: NSObject, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
    weak var owner: ScanSession?

    init(owner: ScanSession) {
        self.owner = owner
        super.init()
    }

    // MARK: NSCoding (exigé par RoomCaptureViewDelegate)

    nonisolated required init?(coder: NSCoder) { nil }
    nonisolated func encode(with coder: NSCoder) {}

    // MARK: RoomCaptureViewDelegate

    nonisolated func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: (any Error)?) -> Bool {
        // On laisse RoomCaptureView traiter et afficher le résultat, même en cas d'erreur partielle.
        true
    }

    nonisolated func captureView(didPresent processedResult: CapturedRoom, error: (any Error)?) {
        let message = error?.localizedDescription
        Task { @MainActor [weak self] in
            self?.owner?.roomProcessed(processedResult, errorMessage: message)
        }
    }

    // MARK: RoomCaptureSessionDelegate

    nonisolated func captureSession(_ session: RoomCaptureSession, didProvide instruction: RoomCaptureSession.Instruction) {
        let value = ScanInstruction(instruction)
        Task { @MainActor [weak self] in
            self?.owner?.instructionChanged(value)
        }
    }

    nonisolated func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: (any Error)?) {
        guard let message = error?.localizedDescription else { return }
        Task { @MainActor [weak self] in
            self?.owner?.captureFailed(message)
        }
    }
}
