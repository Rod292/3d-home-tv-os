import SwiftUI

@main
struct Appart3DMenuBarApp: App {
    @State private var store = HomeStore()
    @State private var web = WidgetWebController()

    var body: some Scene {
        MenuBarExtra {
            PopoverView(store: store, web: web)
        } label: {
            MenuBarLabel(store: store)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(store: store, web: web)
        }
    }
}
