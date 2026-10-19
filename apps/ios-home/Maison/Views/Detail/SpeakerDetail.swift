import SwiftUI
import UIKit

// MARK: - Pochette

/// Charge les pochettes servies par le pont (`MediaInfo.artworkUrl`, relative, même jeton que l'API).
@MainActor
final class ArtworkCache {
    static let shared = ArtworkCache()
    private var images: [String: UIImage] = [:]

    func image(for path: String) -> UIImage? { images[path] }

    func load(_ path: String) async -> UIImage? {
        if let img = images[path] { return img }
        guard let request = Self.request(for: path) else { return nil }
        guard let (data, response) = try? await BridgeClient.session.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let img = UIImage(data: data) else { return nil }
        if images.count > 20 { images.removeAll() }
        images[path] = img
        return img
    }

    /// Requête authentifiée vers le pont (nil en mode démo ou sans pont appairé).
    nonisolated static func request(for path: String) -> URLRequest? {
        if path.hasPrefix("http://") || path.hasPrefix("https://") {
            return URL(string: path).map { URLRequest(url: $0) }
        }
        guard !SharedStore.isMock, let base = SharedStore.bridgeURL else { return nil }
        var root = base.absoluteString
        while root.hasSuffix("/") { root.removeLast() }
        guard let url = URL(string: root + (path.hasPrefix("/") ? path : "/" + path)) else { return nil }
        var r = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 10)
        if let token = TokenStore.token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return r
    }
}

struct ArtworkView: View {
    var path: String?
    var tint: Color
    var cornerRadius: CGFloat
    var playing: Bool = false
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            LinearGradient(colors: [tint.mix(with: Color(hex: "#2a1f3a"), by: 0.35), Color(hex: "#1b1622")],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .transition(.opacity)
            } else {
                Image(systemName: "music.note")
                    .font(.system(size: cornerRadius * 1.4, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.75))
                    .symbolEffect(.pulse, isActive: playing)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .task(id: path) {
            guard let path else { image = nil; return }
            if let cached = ArtworkCache.shared.image(for: path) { image = cached; return }
            let loaded = await ArtworkCache.shared.load(path)
            withAnimation(.easeOut(duration: 0.3)) { image = loaded }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Progression et commandes

struct MediaProgress: View {
    var media: MediaInfo
    var tint: Color
    var showTimes = true

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let pos = media.position(at: context.date)
            if let pos, let duration = media.duration, duration > 0 {
                VStack(spacing: 6) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(.white.opacity(0.16))
                            Capsule()
                                .fill(LinearGradient(colors: [tint.mix(with: .white, by: 0.4), .white], startPoint: .leading, endPoint: .trailing))
                                .frame(width: geo.size.width * min(1, pos / duration))
                                .animation(.linear(duration: 1), value: pos)
                        }
                    }
                    .frame(height: 5)
                    if showTimes {
                        HStack {
                            Text(MediaInfo.format(pos))
                            Spacer()
                            Text("-" + MediaInfo.format(max(0, duration - pos)))
                        }
                        .font(.system(.caption, design: .rounded).weight(.semibold).monospacedDigit())
                        .foregroundStyle(.white.opacity(0.55))
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(MediaInfo.format(pos)) sur \(MediaInfo.format(duration))")
            }
        }
    }
}

struct TransportControls: View {
    var device: Device
    var big = false
    @Environment(HomeStore.self) private var store
    @State private var taps = 0

    private var playing: Bool { device.state.media?.state == .playing }

    var body: some View {
        let caps = device.capabilities
        HStack(spacing: big ? 30 : 6) {
            // Carte compacte : lecture / pause et suivant seulement (le titre garde la place).
            if big && caps.canMedia(.previous) {
                button("backward.fill", label: "Piste précédente", size: big ? 26 : 16) { store.perform(.media(.previous), on: device.id) }
            }
            if caps.canMedia(.playPause) {
                Button {
                    taps += 1
                    store.perform(.media(playing ? .pause : .play), on: device.id)
                } label: {
                    Image(systemName: playing ? "pause.fill" : "play.fill")
                        .font(.system(size: big ? 30 : 17, weight: .bold))
                        .contentTransition(.symbolEffect(.replace))
                        .foregroundStyle(Color.black.opacity(0.85))
                        .frame(width: big ? 76 : 40, height: big ? 76 : 40)
                        .background(Circle().fill(.white))
                        .shadow(color: DeviceStyle.glow(for: device).opacity(0.6), radius: big ? 18 : 6)
                }
                .buttonStyle(PressableStyle())
                .accessibilityLabel(playing ? "Pause" : "Lecture")
            }
            if caps.canMedia(.next) {
                button("forward.fill", label: "Piste suivante", size: big ? 26 : 16) { store.perform(.media(.next), on: device.id) }
            }
        }
        .sensoryFeedback(.impact(weight: .medium), trigger: taps)
    }

    private func button(_ symbol: String, label: String, size: CGFloat, action: @escaping () -> Void) -> some View {
        Button {
            taps += 1
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: size, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: size * 2.2, height: size * 2.2)
                .contentShape(Circle())
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(label)
    }
}

// MARK: - Fiche enceinte

struct SpeakerDetail: View {
    var device: Device
    @Environment(HomeStore.self) private var store
    @State private var volume: Double?

    private var media: MediaInfo? { device.state.media }
    private var tint: Color { Color(hex: "#d77dff") }

    var body: some View {
        VStack(spacing: 22) {
            let active = media?.isActive == true
            ArtworkView(path: active ? media?.artworkUrl : nil, tint: tint, cornerRadius: 28, playing: media?.state == .playing)
                .frame(width: 250, height: 250)
                .scaleEffect(media?.state == .playing ? 1 : 0.9)
                .shadow(color: tint.opacity(0.45), radius: 30, y: 16)
                .animation(.spring(duration: 0.5), value: media?.state)

            VStack(spacing: 4) {
                Text(active ? (media?.title ?? "Sans titre") : "Rien en lecture")
                    .font(.system(.title2, design: .rounded).weight(.bold))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                if active, let artist = media?.artist {
                    Text(artist)
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(tint.mix(with: .white, by: 0.45))
                }
                let detail = active ? [media?.album, media?.app].compactMap { $0 }.joined(separator: " · ")
                    : "Lancez de la musique depuis l'iPhone (AirPlay) ou demandez à Siri."
                if !detail.isEmpty {
                    Text(detail)
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }

            if active, let media {
                MediaProgress(media: media, tint: tint)
                TransportControls(device: device, big: true)
                if device.capabilities.media?.isEmpty ?? true {
                    Text("Commandes de lecture non proposées par le HomePod pour cette source.")
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }

            if device.capabilities.volume == true {
                VStack(spacing: 10) {
                    SectionTitle(text: "Volume")
                    HStack(spacing: 12) {
                        Image(systemName: "speaker.fill").foregroundStyle(.secondary)
                        Slider(value: Binding(get: { volume ?? device.state.volume ?? 0 }, set: { v in
                            volume = v
                            store.performThrottled(.volume(Int(v.rounded())), on: device.id, key: "volume")
                        }), in: 0...100) { editing in
                            if !editing { volume = nil }
                        }
                        .tint(tint)
                        Image(systemName: "speaker.wave.3.fill").foregroundStyle(.secondary)
                    }
                    .padding(16)
                    .glassCard(radius: 20)
                    .accessibilityLabel("Volume")
                }
            }
        }
    }
}

// MARK: - Carte « Lecture en cours » (écran principal)

struct NowPlayingCard: View {
    var device: Device
    var open: () -> Void

    var body: some View {
        let media = device.state.media ?? MediaInfo(state: .idle)
        let tint = Color(hex: "#d77dff")
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                Button(action: open) {
                    HStack(spacing: 12) {
                        ArtworkView(path: media.artworkUrl, tint: tint, cornerRadius: 12, playing: media.state == .playing)
                            .frame(width: 56, height: 56)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 5) {
                                if media.state == .playing {
                                    Image(systemName: "waveform")
                                        .symbolEffect(.variableColor.iterative, isActive: true)
                                }
                                Text((media.state == .playing ? "Lecture en cours" : "En pause") + " · " + [media.app, device.name].compactMap { $0 }.joined(separator: " · "))
                                    .lineLimit(1)
                            }
                            .font(.system(.caption, design: .rounded).weight(.bold))
                            .foregroundStyle(tint.mix(with: .white, by: 0.35))
                            Text(media.title ?? "Sans titre")
                                .font(.system(.headline, design: .rounded))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                            if let artist = media.artist {
                                Text(artist)
                                    .font(.system(.subheadline, design: .rounded))
                                    .foregroundStyle(.white.opacity(0.65))
                                    .lineLimit(1)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Lecture en cours sur \(device.name) : \(media.title ?? "sans titre")")
                TransportControls(device: device)
            }
            MediaProgress(media: media, tint: tint, showTimes: false)
        }
        .padding(14)
        .glassCard(radius: 24, tint: tint, amount: media.state == .playing ? 0.22 : 0.08)
    }
}

extension Array where Element == Device {
    /// Enceinte qui joue (sinon en pause) — pour la carte « Lecture en cours ».
    var nowPlaying: Device? {
        let speakers = filter { $0.kind == .speaker && $0.state.reachable && $0.state.media?.isActive == true }
        return speakers.first { $0.state.media?.state == .playing } ?? speakers.first
    }
}
