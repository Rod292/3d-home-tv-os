import Foundation
import Security

/// Réglages partagés entre l'app, les widgets et les contrôles (App Group).
enum SharedStore {
    static let appGroup = "group.com.example.appart3d"

    /// UserDefaults de l'App Group (repli sur les réglages standard si l'App Group est indisponible).
    nonisolated(unsafe) static let defaults: UserDefaults = UserDefaults(suiteName: appGroup) ?? .standard

    private enum Key {
        static let bridgeURL = "maison.bridgeURL"
        static let serviceName = "maison.serviceName"
        static let homeName = "maison.homeName"
        static let mockMode = "maison.mockMode"
        static let lastScene = "maison.lastScene"
        static let snapshot = "maison.snapshot"
        static let mockSnapshot = "maison.mockSnapshot"
        static let night3D = "maison.night3D"
        static let webDemo = "maison.webDemo"
        static let kiosk = "maison.kiosk"
    }

    static var bridgeURL: URL? {
        get { defaults.string(forKey: Key.bridgeURL).flatMap(URL.init(string:)) }
        set { defaults.set(newValue?.absoluteString, forKey: Key.bridgeURL) }
    }

    /// Nom Bonjour du pont (pour le retrouver si son adresse IP change).
    static var bridgeServiceName: String? {
        get { defaults.string(forKey: Key.serviceName) }
        set { defaults.set(newValue, forKey: Key.serviceName) }
    }

    static var homeName: String {
        get { defaults.string(forKey: Key.homeName) ?? "Home" }
        set { defaults.set(newValue, forKey: Key.homeName) }
    }

    /// Mode démo persistant (réglage) ; l'argument de lancement `-mock` l'active pour la session.
    static var mockModeSetting: Bool {
        get { defaults.bool(forKey: Key.mockMode) }
        set { defaults.set(newValue, forKey: Key.mockMode) }
    }

    static var launchedWithMock: Bool {
        ProcessInfo.processInfo.arguments.contains("-mock")
    }

    static var isMock: Bool { mockModeSetting || launchedWithMock }

    /// Dernière scène lancée (pour « Basculer les lumières »).
    static var lastSceneId: String? {
        get { defaults.string(forKey: Key.lastScene) }
        set { defaults.set(newValue, forKey: Key.lastScene) }
    }

    /// Mode nuit de la maquette 3D : "auto" | "night" | "day".
    static var night3D: String {
        get { defaults.string(forKey: Key.night3D) ?? "auto" }
        set { defaults.set(newValue, forKey: Key.night3D) }
    }

    /// En mode démo, charger la maquette web publique plutôt que l'illustration native.
    static var webDemo: Bool {
        get { defaults.bool(forKey: Key.webDemo) }
        set { defaults.set(newValue, forKey: Key.webDemo) }
    }

    /// Mode écran mural (activé par défaut sur iPad).
    /// nil = jamais réglé (l'app choisit selon l'appareil).
    static var kioskMode: Bool? {
        get { defaults.object(forKey: Key.kiosk) as? Bool }
        set { defaults.set(newValue, forKey: Key.kiosk) }
    }

    /// Dernier état connu (affiché hors ligne, utilisé par les widgets et les intents).
    static var lastSnapshot: HomeSnapshot? {
        get { load(Key.snapshot) }
        set { save(newValue, Key.snapshot) }
    }

    /// État de la maison simulée (mode démo), partagé entre processus.
    static var mockSnapshot: HomeSnapshot? {
        get { load(Key.mockSnapshot) }
        set { save(newValue, Key.mockSnapshot) }
    }

    static var isPaired: Bool { bridgeURL != nil && TokenStore.token != nil }

    static func forgetPairing() {
        TokenStore.token = nil
        bridgeURL = nil
        bridgeServiceName = nil
        lastSnapshot = nil
    }

    private static func load<T: Decodable>(_ key: String) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private static func save<T: Encodable>(_ value: T?, _ key: String) {
        if let value, let data = try? JSONEncoder().encode(value) {
            defaults.set(data, forKey: key)
        } else {
            defaults.removeObject(forKey: key)
        }
    }
}

/// Jeton du bridge : Keychain partagé (groupe d'accès = App Group), sinon fichier protégé dans le conteneur.
enum TokenStore {
    private static let service = "com.example.appart3d.home"
    private static let account = "bridge-token"
    private static let fileName = "bridge-token"

    static var token: String? {
        get {
            if let t = keychainRead(group: SharedStore.appGroup) { return t }
            if let t = keychainRead(group: nil) { return t }
            return fileRead()
        }
        set {
            keychainDelete(group: SharedStore.appGroup)
            keychainDelete(group: nil)
            fileDelete()
            guard let newValue, !newValue.isEmpty else { return }
            if keychainWrite(newValue, group: SharedStore.appGroup) { return }
            // Groupe d'accès indisponible (ex. build non signé) : fichier de l'App Group avec protection.
            if fileWrite(newValue) { return }
            _ = keychainWrite(newValue, group: nil)
        }
    }

    private static func baseQuery(group: String?) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let group { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    private static func keychainRead(group: String?) -> String? {
        var q = baseQuery(group: group)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    private static func keychainWrite(_ token: String, group: String?) -> Bool {
        var q = baseQuery(group: group)
        q[kSecValueData as String] = Data(token.utf8)
        // Lisible après le premier déverrouillage : les contrôles fonctionnent écran verrouillé.
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    private static func keychainDelete(group: String?) {
        SecItemDelete(baseQuery(group: group) as CFDictionary)
    }

    private static var fileURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: SharedStore.appGroup)?
            .appendingPathComponent("Library/Application Support", isDirectory: true)
            .appendingPathComponent(fileName)
    }

    private static func fileRead() -> String? {
        guard let url = fileURL, let data = try? Data(contentsOf: url) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func fileWrite(_ token: String) -> Bool {
        guard let url = fileURL else { return false }
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(token.utf8).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch {
            return false
        }
    }

    private static func fileDelete() {
        guard let url = fileURL else { return }
        try? FileManager.default.removeItem(at: url)
    }
}
