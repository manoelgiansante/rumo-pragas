import SwiftUI

struct MainTabView: View {
    let authVM: AuthViewModel
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab("Início", systemImage: "leaf.fill", value: 0) {
                HomeView(authVM: authVM)
            }

            Tab("Histórico", systemImage: "clock.arrow.circlepath", value: 1) {
                HistoryView(authVM: authVM)
            }

            Tab("Biblioteca", systemImage: "books.vertical.fill", value: 2) {
                LibraryView()
            }

            Tab("Agro IA", systemImage: "sparkles", value: 3) {
                AIChatView()
            }

            Tab("Ajustes", systemImage: "gearshape.fill", value: 4) {
                SettingsView(authVM: authVM)
            }
        }
        .tint(AppTheme.brandGreen)
    }
}
