import SwiftUI

/// Maquette isométrique native (mode démo, ou en attendant la maquette 3D du pont) :
/// pièces en coupe, halos des lampes allumées teintés de leur couleur, ventilateur qui tourne.
struct ApartmentIllustration: View {
    var devices: [Device]
    var focusedDeviceId: String?
    var onTap: (Device) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Plan en mètres : x vers la droite-bas, y vers la gauche-bas.
    struct Room { var name: String; var rect: CGRect; var floor: Color }
    static let rooms: [Room] = [
        Room(name: "Salon", rect: CGRect(x: 0, y: 0, width: 6, height: 7), floor: Color(hex: "#4c3858")),
        Room(name: "Cuisine", rect: CGRect(x: 6, y: 0, width: 4, height: 3), floor: Color(hex: "#3d3d5c")),
        Room(name: "Chambre", rect: CGRect(x: 6, y: 3, width: 4, height: 4), floor: Color(hex: "#463452")),
    ]

    /// Position (plan) et hauteur de chaque appareil connu.
    static func anchor(for d: Device) -> (CGPoint, CGFloat)? {
        switch d.itemId ?? d.id {
        case "item_10": (CGPoint(x: 0.7, y: 6.2), 0.8)              // Bandeau bureau
        case "item_homepod": (CGPoint(x: 0.4, y: 5.6), 0.85)        // HomePod mini sur le bureau
        case "item_floorlamp": (CGPoint(x: 5.3, y: 0.7), 1.5)       // Lampadaire
        case "item_pendant_rattan": (CGPoint(x: 8, y: 1.5), 2.1)    // Lustre cuisine
        case "item_varmblixt": (CGPoint(x: 9.3, y: 6.3), 0.7)       // Lampe VARMBLIXT
        case "item_fan": (CGPoint(x: 7.4, y: 4.6), 1.0)             // Ventilateur
        case "item_30": d.kind == .tv ? (CGPoint(x: 0.25, y: 2.4), 1.1) : (CGPoint(x: 0.25, y: 3.7), 0.5) // TV / Ambilight
        default:
            switch d.id {
            case "hue:light:9": (CGPoint(x: 3, y: 3.5), 2.3)        // Lustre salon
            default: nil
            }
        }
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            GeometryReader { geo in
                let proj = Projection(size: geo.size)
                ZStack {
                    // Toile débordante : les halos ne sont pas coupés au bord de la vue.
                    Canvas { ctx, _ in
                        ctx.translateBy(x: 80, y: 80)
                        draw(in: &ctx, proj: proj, t: reduceMotion ? 0 : t)
                    }
                    .padding(-80)
                    .allowsHitTesting(false)
                    ForEach(devices) { d in
                        if let (p, z) = Self.anchor(for: d) {
                            marker(d, t: t, size: min(56, max(30, proj.scale * 0.62)))
                                .position(proj.point(p.x, p.y, z))
                        }
                    }
                }
                .offset(y: reduceMotion ? 0 : sin(t * 0.6) * 3)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Plan de l'appartement")
    }

    @ViewBuilder
    private func marker(_ d: Device, t: TimeInterval, size: CGFloat) -> some View {
        let on = d.state.on == true && d.state.reachable
        let tint = on ? DeviceStyle.glow(for: d) : Color.white.opacity(0.5)
        let focused = focusedDeviceId == d.id
        Button {
            onTap(d)
        } label: {
            ZStack {
                Circle()
                    .fill(on ? tint.opacity(0.28) : Color.white.opacity(0.08))
                    .frame(width: focused ? size * 1.3 : size, height: focused ? size * 1.3 : size)
                    .overlay(Circle().strokeBorder(focused ? Color.white.opacity(0.9) : tint.opacity(on ? 0.7 : 0.25), lineWidth: focused ? 1.5 : 1))
                Image(systemName: DeviceStyle.symbol(for: d))
                    .font(.system(size: size * 0.43, weight: .semibold))
                    .foregroundStyle(on ? Color.white : Color.white.opacity(0.55))
                    .rotationEffect(d.kind == .fan && on && !reduceMotion ? .degrees(t * 120 * max(0.6, (d.state.speed ?? 50) / 25)) : .zero)
            }
            .frame(width: max(44, size * 1.3), height: max(44, size * 1.3))
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(d.name), \(HomeText.deviceState(d))")
        .animation(.spring(duration: 0.35), value: focused)
    }

    private func draw(in ctx: inout GraphicsContext, proj: Projection, t: TimeInterval) {
        // Ombre portée sous le plan.
        let shadow = Path(ellipseIn: CGRect(center: proj.point(5, 3.5, -0.4), size: CGSize(width: proj.scale * 13, height: proj.scale * 5)))
        ctx.fill(shadow, with: .radialGradient(Gradient(colors: [.black.opacity(0.45), .clear]),
                                               center: proj.point(5, 3.5, -0.4), startRadius: 0, endRadius: proj.scale * 6.5))

        // Socle (épaisseur de dalle).
        let slab: CGFloat = 0.25
        let outline = CGRect(x: 0, y: 0, width: 10, height: 7)
        ctx.fill(proj.face([(outline.maxX, 0), (outline.maxX, outline.maxY)], z0: -slab, z1: 0), with: .color(Color(hex: "#1b1430")))
        ctx.fill(proj.face([(0, outline.maxY), (outline.maxX, outline.maxY)], z0: -slab, z1: 0), with: .color(Color(hex: "#241a3a")))

        // Sols.
        for room in Self.rooms {
            let r = room.rect
            let path = proj.polygon([(r.minX, r.minY), (r.maxX, r.minY), (r.maxX, r.maxY), (r.minX, r.maxY)], z: 0)
            ctx.fill(path, with: .color(room.floor))
            // Lames de parquet.
            var lines = Path()
            var x = r.minX + 0.5
            while x < r.maxX {
                lines.move(to: proj.point(x, r.minY, 0))
                lines.addLine(to: proj.point(x, r.maxY, 0))
                x += 0.5
            }
            ctx.stroke(lines, with: .color(.white.opacity(0.025)), lineWidth: 0.6)
        }

        // Mobilier (silhouettes discrètes).
        let furniture: [(CGRect, CGFloat, Color)] = [
            (CGRect(x: 2.2, y: 4.6, width: 2.4, height: 0.9), 0.45, Color(hex: "#5b4a78")),   // canapé
            (CGRect(x: 2.6, y: 2.6, width: 1.4, height: 0.8), 0.25, Color(hex: "#4a3c63")),   // table basse
            (CGRect(x: 0.1, y: 2.2, width: 0.3, height: 1.6), 0.55, Color(hex: "#1c1a2c")),   // meuble TV
            (CGRect(x: 0.2, y: 5.6, width: 1.6, height: 0.7), 0.75, Color(hex: "#4e3f5e")),   // bureau
            (CGRect(x: 6.1, y: 0.1, width: 3.8, height: 0.6), 0.9, Color(hex: "#44445e")),    // plan de travail
            (CGRect(x: 7.6, y: 4.9, width: 2.2, height: 2.0), 0.45, Color(hex: "#5a4a6e")),   // lit
        ]
        for (r, h, c) in furniture { drawBox(&ctx, proj: proj, rect: r, height: h, color: c) }

        // Murs en coupe (arrière + cloisons).
        let wallH: CGFloat = 1.1
        let wallColor = Color(hex: "#4b3d68")
        let walls: [(CGPoint, CGPoint)] = [
            (CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 0)),
            (CGPoint(x: 0, y: 0), CGPoint(x: 0, y: 7)),
            (CGPoint(x: 6, y: 0), CGPoint(x: 6, y: 1.6)),
            (CGPoint(x: 6, y: 2.6), CGPoint(x: 6, y: 5.0)),
            (CGPoint(x: 6, y: 6.1), CGPoint(x: 6, y: 7)),
            (CGPoint(x: 6, y: 3), CGPoint(x: 7.2, y: 3)),
            (CGPoint(x: 8.2, y: 3), CGPoint(x: 10, y: 3)),
        ]
        for (a, b) in walls {
            let face = proj.face([(a.x, a.y), (b.x, b.y)], z0: 0, z1: wallH)
            let back = a.y == 0 && b.y == 0
            ctx.fill(face, with: .color(back ? wallColor : wallColor.opacity(0.85)))
            var top = Path()
            top.move(to: proj.point(a.x, a.y, wallH))
            top.addLine(to: proj.point(b.x, b.y, wallH))
            ctx.stroke(top, with: .color(Color(hex: "#8f7bb8").opacity(0.7)), lineWidth: 1.2)
        }

        // Halos des lampes allumées, au sol.
        ctx.drawLayer { layer in
            layer.blendMode = .plusLighter
            for d in devices where d.state.on == true && d.state.reachable && d.kind != .fan {
                guard let (p, _) = Self.anchor(for: d) else { continue }
                let color = DeviceStyle.glow(for: d)
                let level = d.kind == .tv ? 0.35 : max(0.35, (d.state.brightness ?? 80) / 100)
                let breathe = 1 + 0.04 * sin(t * 1.3 + p.x)
                let radius = proj.scale * (d.kind == .plug ? 2.4 : 3.3) * level.squareRoot() * breathe
                let center = proj.point(p.x, p.y, 0)
                let rect = CGRect(center: center, size: CGSize(width: radius * 2, height: radius * 1.16))
                layer.fill(Path(ellipseIn: rect),
                           with: .radialGradient(Gradient(colors: [color.opacity(0.5 * level + 0.25), color.opacity(0.16), .clear]),
                                                 center: center, startRadius: 0, endRadius: radius))
            }
        }

        // Liseré lumineux du contour.
        let rim = proj.polygon([(0, 0), (10, 0), (10, 7), (0, 7)], z: 0)
        ctx.stroke(rim, with: .color(.white.opacity(0.08)), lineWidth: 1)
    }

    private func drawBox(_ ctx: inout GraphicsContext, proj: Projection, rect r: CGRect, height h: CGFloat, color: Color) {
        ctx.fill(proj.face([(r.maxX, r.minY), (r.maxX, r.maxY)], z0: 0, z1: h), with: .color(color.mix(with: .black, by: 0.35)))
        ctx.fill(proj.face([(r.minX, r.maxY), (r.maxX, r.maxY)], z0: 0, z1: h), with: .color(color.mix(with: .black, by: 0.2)))
        ctx.fill(proj.polygon([(r.minX, r.minY), (r.maxX, r.minY), (r.maxX, r.maxY), (r.minX, r.maxY)], z: h), with: .color(color))
    }

    /// Projection isométrique ajustée à la taille de la vue.
    struct Projection {
        var scale: CGFloat
        var origin: CGPoint
        static let cos30: CGFloat = 0.866
        static let sin30: CGFloat = 0.5

        init(size: CGSize) {
            // Étendue du plan 10 × 7 projeté : largeur (10+7)·cos30, hauteur (10+7)·sin30 + murs.
            let w = 17 * Self.cos30
            let h = 17 * Self.sin30 + 1.6
            scale = min(size.width * 0.98 / w, size.height * 0.94 / h)
            let projectedWidth = w * scale
            origin = CGPoint(x: (size.width - projectedWidth) / 2 + 7 * Self.cos30 * scale,
                             y: (size.height - h * scale) / 2 + 1.3 * scale)
        }

        func point(_ x: CGFloat, _ y: CGFloat, _ z: CGFloat) -> CGPoint {
            CGPoint(x: origin.x + (x - y) * Self.cos30 * scale,
                    y: origin.y + (x + y) * Self.sin30 * scale - z * scale)
        }

        func polygon(_ pts: [(CGFloat, CGFloat)], z: CGFloat) -> Path {
            var p = Path()
            for (i, q) in pts.enumerated() {
                let s = point(q.0, q.1, z)
                if i == 0 { p.move(to: s) } else { p.addLine(to: s) }
            }
            p.closeSubpath()
            return p
        }

        /// Face verticale entre deux points du plan.
        func face(_ seg: [(CGFloat, CGFloat)], z0: CGFloat, z1: CGFloat) -> Path {
            var p = Path()
            p.move(to: point(seg[0].0, seg[0].1, z0))
            p.addLine(to: point(seg[1].0, seg[1].1, z0))
            p.addLine(to: point(seg[1].0, seg[1].1, z1))
            p.addLine(to: point(seg[0].0, seg[0].1, z1))
            p.closeSubpath()
            return p
        }
    }
}

extension CGRect {
    init(center: CGPoint, size: CGSize) {
        self.init(x: center.x - size.width / 2, y: center.y - size.height / 2, width: size.width, height: size.height)
    }
}
