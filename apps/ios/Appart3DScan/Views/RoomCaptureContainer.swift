import RoomPlan
import SwiftUI
import UIKit

/// Héberge la `RoomCaptureView` unique de la session dans SwiftUI.
/// La vue est possédée par `ScanSession` (et non recréée ici) pour conserver l'ARSession entre les pièces.
struct RoomCaptureContainer: UIViewControllerRepresentable {
    let session: ScanSession

    func makeUIViewController(context: Context) -> CaptureViewController {
        CaptureViewController(captureView: session.captureView)
    }

    func updateUIViewController(_ controller: CaptureViewController, context: Context) {}

    final class CaptureViewController: UIViewController {
        private let captureView: RoomCaptureView

        init(captureView: RoomCaptureView) {
            self.captureView = captureView
            super.init(nibName: nil, bundle: nil)
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError("init(coder:) non supporté") }

        override func viewDidLoad() {
            super.viewDidLoad()
            view.backgroundColor = .black
            captureView.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(captureView)
            NSLayoutConstraint.activate([
                captureView.topAnchor.constraint(equalTo: view.topAnchor),
                captureView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
                captureView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                captureView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            ])
        }
    }
}
