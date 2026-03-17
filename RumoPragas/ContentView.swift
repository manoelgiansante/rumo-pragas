import SwiftUI

struct ContentView: View {
    @State private var authVM = AuthViewModel()
    @AppStorage("hasSeenOnboarding") private var hasSeenOnboarding = false
    @AppStorage("isDarkMode") private var isDarkMode = false
    @State private var showSplash = true

    var body: some View {
        ZStack {
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
            .opacity(showSplash ? 0 : 1)

            if showSplash {
                SplashView()
                    .transition(.opacity)
            }
        }
        .preferredColorScheme(isDarkMode ? .dark : nil)
        .task {
            await authVM.validateSession()
            try? await Task.sleep(for: .seconds(1.5))
            withAnimation(.easeOut(duration: 0.5)) {
                showSplash = false
            }
        }
    }
}

struct SplashView: View {
    @State private var leafScale: CGFloat = 0.5
    @State private var leafOpacity: Double = 0
    @State private var textOpacity: Double = 0
    @State private var pulseScale: CGFloat = 1.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            AppTheme.meshBackground

            VStack(spacing: 24) {
                ZStack {
                    ForEach(0..<3, id: \.self) { i in
                        Circle()
                            .stroke(Color.white.opacity(0.08 - Double(i) * 0.02), lineWidth: 1.5)
                            .frame(width: CGFloat(120 + i * 40), height: CGFloat(120 + i * 40))
                            .scaleEffect(reduceMotion ? 1.0 : pulseScale)
                    }

                    ZStack {
                        Circle()
                            .fill(.white.opacity(0.15))
                            .frame(width: 100, height: 100)

                        Circle()
                            .fill(.white.opacity(0.1))
                            .frame(width: 80, height: 80)

                        Image(systemName: "leaf.fill")
                            .font(.system(size: 38, weight: .medium))
                            .foregroundStyle(.white)
                            .symbolEffect(.breathe, options: .repeating.speed(0.3), isActive: !reduceMotion)
                    }
                    .scaleEffect(leafScale)
                    .opacity(leafOpacity)
                }

                VStack(spacing: 8) {
                    Text("Rumo Pragas")
                        .font(.system(.title, design: .default, weight: .bold))
                        .foregroundStyle(.white)

                    Text("Inteligência artificial para\nproteção de lavouras")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.9))
                        .multilineTextAlignment(.center)
                        .lineSpacing(2)
                }
                .opacity(textOpacity)
            }
        }
        .ignoresSafeArea()
        .onAppear {
            if reduceMotion {
                leafScale = 1.0
                leafOpacity = 1.0
                textOpacity = 1.0
            } else {
                withAnimation(.spring(response: 0.7, dampingFraction: 0.7)) {
                    leafScale = 1.0
                    leafOpacity = 1.0
                }
                withAnimation(.easeOut(duration: 0.6).delay(0.3)) {
                    textOpacity = 1.0
                }
                withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                    pulseScale = 1.08
                }
            }
        }
    }
}
