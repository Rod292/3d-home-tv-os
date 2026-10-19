#!/usr/bin/env swift
// Génère les PNG de l'AppIcon (macOS) : glyphe « maison » SF Symbol sur un carré arrondi
// aux couleurs chaudes de l'app (terracotta → abricot, maison crème).
// Usage (depuis apps/macos) : swift scripts/make-icon.swift
import AppKit

let outDir = URL(fileURLWithPath: CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "Appart3DMenuBar/Resources/Assets.xcassets/AppIcon.appiconset")

func color(_ hex: UInt32, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255, alpha: a)
}

func render(_ px: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: px, height: px)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = CGFloat(px)

    // Gabarit macOS : carré arrondi de 824/1024 centré, avec ombre portée.
    let inset = s * 100 / 1024
    let rect = NSRect(x: inset, y: inset, width: s - 2 * inset, height: s - 2 * inset)
    let path = NSBezierPath(roundedRect: rect, xRadius: rect.width * 0.225, yRadius: rect.width * 0.225)
    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.28)
    shadow.shadowOffset = NSSize(width: 0, height: -s * 0.012)
    shadow.shadowBlurRadius = s * 0.025
    shadow.set()
    color(0xd9824b).setFill()
    path.fill()
    NSGraphicsContext.restoreGraphicsState()

    NSGraphicsContext.saveGraphicsState()
    path.addClip()
    NSGradient(colors: [color(0xffb46b), color(0xe2725b), color(0xc95f48)],
               atLocations: [0, 0.6, 1], colorSpace: .sRGB)!.draw(in: rect, angle: -90)
    // Halo chaud en haut à gauche.
    NSGradient(colors: [color(0xfff1dd, 0.45), color(0xfff1dd, 0)])!
        .draw(fromCenter: NSPoint(x: rect.minX + rect.width * 0.3, y: rect.maxY - rect.height * 0.2), radius: 0,
              toCenter: NSPoint(x: rect.minX + rect.width * 0.3, y: rect.maxY - rect.height * 0.2),
              radius: rect.width * 0.75, options: [])
    NSGraphicsContext.restoreGraphicsState()

    // Glyphe maison (SF Symbol), crème.
    let config = NSImage.SymbolConfiguration(pointSize: rect.width * 0.5, weight: .semibold)
        .applying(NSImage.SymbolConfiguration(paletteColors: [color(0xfff7ec)]))
    if let glyph = NSImage(systemSymbolName: "house.fill", accessibilityDescription: nil)?
        .withSymbolConfiguration(config) {
        let g = glyph.size
        let scale = min(rect.width * 0.56 / g.width, rect.height * 0.56 / g.height)
        let w = g.width * scale, h = g.height * scale
        let target = NSRect(x: rect.midX - w / 2, y: rect.midY - h / 2 - rect.height * 0.01, width: w, height: h)
        NSGraphicsContext.saveGraphicsState()
        let gs = NSShadow()
        gs.shadowColor = color(0x7a3422, 0.35)
        gs.shadowOffset = NSSize(width: 0, height: -s * 0.008)
        gs.shadowBlurRadius = s * 0.015
        gs.set()
        glyph.draw(in: target)
        NSGraphicsContext.restoreGraphicsState()
    }

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

let entries: [(size: Int, scale: Int)] = [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)]
var images: [[String: String]] = []
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
for e in entries {
    let name = "icon_\(e.size)x\(e.size)\(e.scale == 2 ? "@2x" : "").png"
    try render(e.size * e.scale).write(to: outDir.appendingPathComponent(name))
    images.append(["idiom": "mac", "size": "\(e.size)x\(e.size)", "scale": "\(e.scale)x", "filename": name])
}
let contents: [String: Any] = ["images": images, "info": ["author": "xcode", "version": 1]]
let json = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
try json.write(to: outDir.appendingPathComponent("Contents.json"))
print("AppIcon généré dans \(outDir.path)")
