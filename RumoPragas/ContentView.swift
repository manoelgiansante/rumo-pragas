import SwiftUI

struct ContentView: View {
    @State private var authVM = AuthViewModel()
    @AppStorage("prefersDarkMode") private var prefersDarkMode = true
    @AppStorage("hasSeenOnboarding") private var hasSeenOnboarding = false

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
        .preferredColorScheme(prefersDarkMode ? .dark : .light)
        .task {
            await authVM.validateSession()
        }
    }
}
