#!/usr/bin/env swift
// Génère l'icône de l'app Maison (1024 px, format iOS « taille unique ») et les couleurs des catalogues :
// maison crème lumineuse, fenêtre chaude, sur un dégradé prune profond.
// Usage (depuis apps/ios-home) : swift scripts/make-icon.swift
import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
let appAssets = root.appendingPathComponent("Maison/Resources/Assets.xcassets")
let widgetAssets = root.appendingPathComponent("MaisonWidgets/Assets.xcassets")

func color(_ hex: UInt32, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255, alpha: a)
}

enum Variant { case standard, dark, tinted }

func render(_ px: Int, variant: Variant) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: px, height: px)
    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = ctx
    let s = CGFloat(px)
    let full = NSRect(x: 0, y: 0, width: s, height: s)

    // Fond (iOS applique lui-même le masque arrondi).
    switch variant {
    case .standard:
        NSGradient(colors: [color(0x3b1a55), color(0x24103f), color(0x0d0b26)],
                   atLocations: [0, 0.55, 1], colorSpace: .sRGB)!.draw(in: full, angle: -90)
    case .dark:
        NSGradient(colors: [color(0x1a0f2c), color(0x07061a)])!.draw(in: full, angle: -90)
    case .tinted:
        NSGradient(colors: [color(0x2a2a2a), color(0x000000)])!.draw(in: full, angle: -90)
    }

    // Halo chaud derrière la maison.
    let glowCenter = NSPoint(x: s * 0.5, y: s * 0.44)
    let glowColors: [NSColor] = variant == .tinted
        ? [color(0xffffff, 0.35), color(0xffffff, 0)]
        : [color(0xffc27a, 0.75), color(0xff8a4d, 0.32), color(0xb04a8a, 0.0)]
    NSGradient(colors: glowColors)!.draw(fromCenter: glowCenter, radius: 0, toCenter: glowCenter, radius: s * 0.48, options: [])

    // Silhouette de maison (toit + corps), crème avec léger dégradé.
    let w = s * 0.50, h = s * 0.44
    let x0 = (s - w) / 2, y0 = s * 0.25
    let roofPeak = NSPoint(x: s / 2, y: y0 + h)
    let eave = s * 0.06
    let body = NSBezierPath()
    body.move(to: NSPoint(x: x0 + eave, y: y0))
    body.line(to: NSPoint(x: x0 + w - eave, y: y0))
    body.line(to: NSPoint(x: x0 + w - eave, y: y0 + h * 0.55))
    body.line(to: NSPoint(x: x0 + w + s * 0.015, y: y0 + h * 0.55))
    body.line(to: roofPeak)
    body.line(to: NSPoint(x: x0 - s * 0.015, y: y0 + h * 0.55))
    body.line(to: NSPoint(x: x0 + eave, y: y0 + h * 0.55))
    body.close()
    let rounded = body.copy() as! NSBezierPath
    rounded.lineJoinStyle = .round
    rounded.lineWidth = s * 0.05

    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = variant == .tinted ? color(0x000000, 0.4) : color(0x2a0a1a, 0.55)
    shadow.shadowOffset = NSSize(width: 0, height: -s * 0.02)
    shadow.shadowBlurRadius = s * 0.05
    shadow.set()
    let houseColors: [NSColor] = variant == .tinted ? [color(0xffffff), color(0xd8d8d8)] : [color(0xfff7ec), color(0xffd9a8)]
    houseColors[0].setFill()
    houseColors[0].setStroke()
    rounded.stroke()
    rounded.fill()
    NSGraphicsContext.restoreGraphicsState()
    // Dégradé sur le corps ET le contour arrondi (sinon un liseré plus clair apparaît).
    NSGraphicsContext.saveGraphicsState()
    let cg = ctx.cgContext
    let stroked = rounded.cgPath.copy(strokingWithWidth: s * 0.05, lineCap: .round, lineJoin: .round, miterLimit: 10)
    let gradRect = rounded.bounds.insetBy(dx: -s * 0.03, dy: -s * 0.03)
    for clipPath in [rounded.cgPath, stroked] {
        cg.saveGState()
        cg.addPath(clipPath)
        cg.clip(using: .winding)
        NSGradient(colors: houseColors)!.draw(in: gradRect, angle: -90)
        cg.restoreGState()
    }
    NSGraphicsContext.restoreGraphicsState()

    // Porte-fenêtre lumineuse (ambre) au centre.
    let doorW = s * 0.13, doorH = s * 0.17
    let door = NSBezierPath(roundedRect: NSRect(x: s / 2 - doorW / 2, y: y0, width: doorW, height: doorH),
                            xRadius: s * 0.03, yRadius: s * 0.03)
    NSGraphicsContext.saveGraphicsState()
    let dShadow = NSShadow()
    dShadow.shadowColor = variant == .tinted ? color(0xffffff, 0.6) : color(0xff9a3d, 0.9)
    dShadow.shadowBlurRadius = s * 0.04
    dShadow.set()
    (variant == .tinted ? color(0x9a9a9a) : color(0xff9a3d)).setFill()
    door.fill()
    NSGraphicsContext.restoreGraphicsState()
    NSGraphicsContext.saveGraphicsState()
    door.addClip()
    let doorColors = variant == .tinted ? [color(0xbdbdbd), color(0x7a7a7a)] : [color(0xffd27a), color(0xff8a2a)]
    NSGradient(colors: doorColors)!.draw(in: door.bounds, angle: -90)
    NSGraphicsContext.restoreGraphicsState()

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

func write(_ json: Any, to url: URL) throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let data = try JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: url)
}

func colorSet(_ hex: UInt32) -> [String: Any] {
    [
        "colors": [[
            "idiom": "universal",
            "color": ["color-space": "srgb", "components": [
                "red": String(format: "0x%02X", (hex >> 16) & 0xff),
                "green": String(format: "0x%02X", (hex >> 8) & 0xff),
                "blue": String(format: "0x%02X", hex & 0xff),
                "alpha": "1.000"]],
        ]],
        "info": ["author": "xcode", "version": 1],
    ]
}

let info: [String: Any] = ["info": ["author": "xcode", "version": 1]]

// App
let iconSet = appAssets.appendingPathComponent("AppIcon.appiconset")
try FileManager.default.createDirectory(at: iconSet, withIntermediateDirectories: true)
try render(1024, variant: .standard).write(to: iconSet.appendingPathComponent("icon-1024.png"))
try render(1024, variant: .dark).write(to: iconSet.appendingPathComponent("icon-1024-dark.png"))
try render(1024, variant: .tinted).write(to: iconSet.appendingPathComponent("icon-1024-tinted.png"))
try write([
    "images": [
        ["idiom": "universal", "platform": "ios", "size": "1024x1024", "filename": "icon-1024.png"],
        ["idiom": "universal", "platform": "ios", "size": "1024x1024", "filename": "icon-1024-dark.png",
         "appearances": [["appearance": "luminosity", "value": "dark"]]],
        ["idiom": "universal", "platform": "ios", "size": "1024x1024", "filename": "icon-1024-tinted.png",
         "appearances": [["appearance": "luminosity", "value": "tinted"]]],
    ],
    "info": ["author": "xcode", "version": 1],
], to: iconSet.appendingPathComponent("Contents.json"))
try write(info, to: appAssets.appendingPathComponent("Contents.json"))
try write(colorSet(0xFFB45E), to: appAssets.appendingPathComponent("AccentColor.colorset/Contents.json"))
try write(colorSet(0x0D0B26), to: appAssets.appendingPathComponent("LaunchBackground.colorset/Contents.json"))

// Widgets
try write(info, to: widgetAssets.appendingPathComponent("Contents.json"))
try write(colorSet(0xFFB45E), to: widgetAssets.appendingPathComponent("AccentColor.colorset/Contents.json"))
try write(colorSet(0x1A0F35), to: widgetAssets.appendingPathComponent("WidgetBackground.colorset/Contents.json"))

print("Icône et couleurs générées.")
