import SwiftUI

@main
struct RumoPragasApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.locale, Locale(identifier: "pt_BR"))
        }
    }
}
