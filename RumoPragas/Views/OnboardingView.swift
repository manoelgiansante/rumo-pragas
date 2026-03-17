import SwiftUI

struct OnboardingPage: Identifiable {
    let id = UUID()
    let icon: String
    let iconColor: Color
    let title: String
    let subtitle: String
    let features: [(icon: String, text: String)]
    let backgroundColors: [Color]
}

struct OnboardingView: View {
    let onFinish: () -> Void
    @State private var currentPage: Int = 0
    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            icon: "camera.viewfinder",
            iconColor: AppTheme.accent,
            title: "Diagnóstico com IA",
            subtitle: "Tire uma foto da praga ou sintoma e receba identificação instantânea com inteligência artificial",
            features: [
                (icon: "bolt.fill", text: "Resultado em segundos"),
                (icon: "checkmark.seal.fill", text: "Alta precisão de identificação"),
                (icon: "leaf.arrow.triangle.circlepath", text: "Tratamentos personalizados")
            ],
            backgroundColors: [
                Color(red: 0.06, green: 0.42, blue: 0.30),
                Color(red: 0.12, green: 0.62, blue: 0.46)
            ]
        ),
        OnboardingPage(
            icon: "list.clipboard.fill",
            iconColor: AppTheme.techBlue,
            title: "Histórico Completo",
            subtitle: "Acompanhe todas as suas análises em um só lugar, com filtros e busca inteligente",
            features: [
                (icon: "clock.arrow.circlepath", text: "Timeline de diagnósticos"),
                (icon: "magnifyingglass", text: "Busca por praga ou cultura"),
                (icon: "star.fill", text: "Favoritos para acesso rápido")
            ],
            backgroundColors: [
                Color(red: 0.14, green: 0.38, blue: 0.82),
                Color(red: 0.22, green: 0.51, blue: 0.95)
            ]
        ),
        OnboardingPage(
            icon: "books.vertical.fill",
            iconColor: AppTheme.warmAmber,
            title: "Biblioteca de Pragas",
            subtitle: "Acesse informações detalhadas sobre pragas das principais culturas do Brasil",
            features: [
                (icon: "leaf.fill", text: "Soja, Milho, Café, Algodão e mais"),
                (icon: "info.circle.fill", text: "Sintomas e ciclo de vida"),
                (icon: "cross.vial.fill", text: "Controle cultural, químico e biológico")
            ],
            backgroundColors: [
                Color(red: 0.78, green: 0.56, blue: 0.10),
                Color(red: 0.92, green: 0.69, blue: 0.15)
            ]
        ),
        OnboardingPage(
            icon: "shield.checkered",
            iconColor: AppTheme.accent,
            title: "Proteja sua Lavoura",
            subtitle: "Tecnologia de ponta para o agronegócio brasileiro — do campo à tomada de decisão",
            features: [
                (icon: "sun.max.fill", text: "Avaliação de risco climático"),
                (icon: "chart.bar.fill", text: "Níveis de severidade detalhados"),
                (icon: "bell.badge.fill", text: "Alertas e prevenção")
            ],
            backgroundColors: [
                Color(red: 0.08, green: 0.48, blue: 0.35),
                Color(red: 0.16, green: 0.72, blue: 0.53)
            ]
        )
    ]

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            TabView(selection: $currentPage) {
                ForEach(Array(pages.enumerated()), id: \.element.id) { index, page in
                    OnboardingPageView(page: page, isActive: currentPage == index)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()

            VStack {
                Spacer()
                bottomControls
            }
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(.easeOut(duration: 0.6)) {
                    appeared = true
                }
            }
        }
    }

    private var bottomControls: some View {
        VStack(spacing: 20) {
            HStack(spacing: 8) {
                ForEach(0..<pages.count, id: \.self) { index in
                    Capsule()
                        .fill(index == currentPage ? Color.white : Color.white.opacity(0.35))
                        .frame(width: index == currentPage ? 24 : 8, height: 8)
                        .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: currentPage)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Página \(currentPage + 1) de \(pages.count)")

            if currentPage == pages.count - 1 {
                Button {
                    onFinish()
                } label: {
                    HStack(spacing: 10) {
                        Text("Começar Agora")
                            .fontWeight(.bold)
                        Image(systemName: "arrow.right")
                            .fontWeight(.bold)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                }
                .buttonStyle(.borderedProminent)
                .tint(.white)
                .foregroundStyle(AppTheme.accent)
                .clipShape(.rect(cornerRadius: 16))
                .shadow(color: .white.opacity(0.25), radius: 16, y: 6)
                .transition(.scale.combined(with: .opacity))
            } else {
                HStack {
                    Button {
                        onFinish()
                    } label: {
                        Text("Pular")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.85))
                    }

                    Spacer()

                    Button {
                        withAnimation(.snappy) {
                            currentPage += 1
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text("Próximo")
                                .fontWeight(.semibold)
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.bold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 14)
                        .background(.white.opacity(0.18))
                        .clipShape(.rect(cornerRadius: 14))
                    }
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 36)
        .animation(.snappy, value: currentPage)
    }
}

struct OnboardingPageView: View {
    let page: OnboardingPage
    let isActive: Bool
    @State private var animateContent = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            LinearGradient(
                colors: page.backgroundColors,
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()
                    .frame(height: 80)

                iconSection
                    .opacity(animateContent ? 1 : 0)
                    .scaleEffect(animateContent ? 1 : 0.7)

                Spacer()
                    .frame(height: 40)

                textSection
                    .opacity(animateContent ? 1 : 0)
                    .offset(y: animateContent ? 0 : 30)

                Spacer()
                    .frame(height: 36)

                featuresSection
                    .opacity(animateContent ? 1 : 0)
                    .offset(y: animateContent ? 0 : 20)

                Spacer()
                    .frame(minHeight: 140)
            }
            .padding(.horizontal, 24)
        }
        .onChange(of: isActive) { _, newValue in
            if newValue {
                if reduceMotion {
                    animateContent = true
                } else {
                    animateContent = false
                    withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.15)) {
                        animateContent = true
                    }
                }
            }
        }
        .onAppear {
            if isActive {
                if reduceMotion {
                    animateContent = true
                } else {
                    withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.3)) {
                        animateContent = true
                    }
                }
            }
        }
    }

    private var iconSection: some View {
        ZStack {
            Circle()
                .fill(.white.opacity(0.08))
                .frame(width: 140, height: 140)

            Circle()
                .fill(.white.opacity(0.12))
                .frame(width: 100, height: 100)

            Image(systemName: page.icon)
                .font(.system(size: 42, weight: .medium))
                .foregroundStyle(.white)
                .symbolEffect(.breathe, options: .repeating.speed(0.4), isActive: !reduceMotion)
        }
    }

    private var textSection: some View {
        VStack(spacing: 14) {
            Text(page.title)
                .font(.system(.title, design: .default, weight: .bold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)

            Text(page.subtitle)
                .font(.body)
                .foregroundStyle(.white.opacity(0.9))
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var featuresSection: some View {
        VStack(spacing: 12) {
            ForEach(Array(page.features.enumerated()), id: \.offset) { index, feature in
                HStack(spacing: 14) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(.white.opacity(0.12))
                            .frame(width: 40, height: 40)

                        Image(systemName: feature.icon)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                    }

                    Text(feature.text)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white.opacity(0.9))

                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.white.opacity(0.08))
                .clipShape(.rect(cornerRadius: 14))
                .animation(
                    reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.8).delay(Double(index) * 0.08),
                    value: animateContent
                )
            }
        }
    }
}
