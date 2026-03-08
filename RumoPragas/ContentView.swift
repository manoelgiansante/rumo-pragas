import SwiftUI

struct ContentView: View {
    @State private var authVM = AuthViewModel()
    @AppStorage("hasSeenOnboarding") private var hasSeenOnboarding = false
    @AppStorage("isDarkMode") private var isDarkMode = false

    var body: some View {
        Group {
            if authVM.isAuthenticated {
                MainTabView(authVM: authVM)
            } else if !hasSeenOnboarding {
                OnboardingView {
                    withAnimation(.smooth(duration: 0.5)) {
                        hasSeenOnboarding = true
                    }
                }
            } else {
                AuthView(viewModel: authVM)
            }
        }
        .preferredColorScheme(isDarkMode ? .dark : nil)
        .task {
            await authVM.validateSession()
        }
    }
}
