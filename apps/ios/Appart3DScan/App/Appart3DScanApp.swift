import SwiftUI

@main
struct Appart3DScanApp: App {
    @State private var store = ProjectStore()

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environment(store)
                .tint(Theme.terracotta)
                .preferredColorScheme(.light)
        }
    }
}
