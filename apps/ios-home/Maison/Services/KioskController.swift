import Observation
import SwiftUI
import UIKit

/// Mode écran mural : après 45 s sans toucher, économiseur d'écran ambiant ; écran jamais en veille.
@MainActor
@Observable
final class KioskController {
    static let idleDelay: TimeInterval = 45

    private(set) var saverShown = false
    /// Pas d'économiseur pendant l'appairage.
    @ObservationIgnored var suspended = false
    var enabled: Bool {
        didSet {
            SharedStore.kioskMode = enabled
            apply()
        }
    }

    @ObservationIgnored private var lastTouch = Date()
    @ObservationIgnored private var timer: Task<Void, Never>?
    @ObservationIgnored private var savedBrightness: CGFloat?

    init() {
        enabled = SharedStore.kioskMode ?? (UIDevice.current.userInterfaceIdiom == .pad)
        if ProcessInfo.processInfo.arguments.contains("-screensaver") {
            enabled = true
            saverShown = true
        }
        apply()
    }

    /// Appelé à chaque contact avec l'écran.
    func touched() {
        lastTouch = Date()
    }

    func dismissSaver() {
        lastTouch = Date()
        guard saverShown else { return }
        withAnimation(.easeOut(duration: 0.35)) { saverShown = false }
        restoreBrightness()
    }

    private func apply() {
        UIApplication.shared.isIdleTimerDisabled = enabled
        timer?.cancel()
        guard enabled else {
            if saverShown { dismissSaver() }
            return
        }
        lastTouch = Date()
        timer = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                guard let self else { return }
                if !self.saverShown, !self.suspended, Date().timeIntervalSince(self.lastTouch) >= Self.idleDelay {
                    self.showSaver()
                }
                // La nuit, l'économiseur baisse la luminosité de l'écran.
                if self.saverShown { self.adjustBrightness() }
            }
        }
    }

    private func showSaver() {
        withAnimation(.easeInOut(duration: 1.2)) { saverShown = true }
        adjustBrightness()
    }

    static func isNightHour(_ date: Date = Date()) -> Bool {
        let h = Calendar.current.component(.hour, from: date)
        return h >= 19 || h < 7
    }

    private var screen: UIScreen? {
        (UIApplication.shared.connectedScenes.first { $0.activationState == .foregroundActive } as? UIWindowScene)?.screen
    }

    private func adjustBrightness() {
        guard let screen else { return }
        // Le soleil du pont quand il est connu (dernier instantané), sinon les heures fixes.
        if Daylight.isNight(mode: .auto, sun: SharedStore.lastSnapshot?.sun) {
            if savedBrightness == nil { savedBrightness = screen.brightness }
            if screen.brightness > 0.2 { screen.brightness = 0.2 }
        } else {
            restoreBrightness()
        }
    }

    private func restoreBrightness() {
        guard let saved = savedBrightness else { return }
        screen?.brightness = saved
        savedBrightness = nil
    }
}

/// Observe tous les contacts de la fenêtre sans interférer avec les gestes.
struct TouchObserver: UIViewRepresentable {
    var onTouch: @MainActor () -> Void

    func makeUIView(context: Context) -> ObserverView {
        let v = ObserverView()
        v.onTouch = onTouch
        v.isUserInteractionEnabled = false
        return v
    }

    func updateUIView(_ uiView: ObserverView, context: Context) {
        uiView.onTouch = onTouch
    }

    final class ObserverView: UIView {
        var onTouch: (@MainActor () -> Void)?
        private var recognizer: PassiveTouchRecognizer?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            if let recognizer { recognizer.view?.removeGestureRecognizer(recognizer) }
            guard let window else { return }
            let r = PassiveTouchRecognizer { [weak self] in self?.onTouch?() }
            window.addGestureRecognizer(r)
            recognizer = r
        }
    }
}

final class PassiveTouchRecognizer: UIGestureRecognizer {
    private let handler: @MainActor () -> Void

    init(_ handler: @escaping @MainActor () -> Void) {
        self.handler = handler
        super.init(target: nil, action: nil)
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        handler()
        state = .failed
    }

    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }
    override func canBePrevented(by preventingGestureRecognizer: UIGestureRecognizer) -> Bool { false }
}
