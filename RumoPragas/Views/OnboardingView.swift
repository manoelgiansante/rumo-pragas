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

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            icon: "camera.viewfinder",
            iconColor: Color(red: 0.13, green: 0.54, blue: 0.26),
            title: "Diagnóstico com IA",
            subtitle: "Tire uma foto da praga ou sintoma e receba identificação instantânea com inteligência artificial",
            features: [
                (icon: "bolt.fill", text: "Resultado em segundos"),
                (icon: "checkmark.seal.fill", text: "Alta precisão de identificação"),
                (icon: "leaf.arrow.triangle.circlepath", text: "Tratamentos personalizados")
            ],
            backgroundColors: [
                Color(red: 0.04, green: 0.16, blue: 0.07),
                Color(red: 0.08, green: 0.32, blue: 0.14)
            ]
        ),
        OnboardingPage(
            icon: "list.clipboard.fill",
            iconColor: Color(red: 0.20, green: 0.60, blue: 0.85),
            title: "Histórico Completo",
            subtitle: "Acompanhe todas as suas análises em um só lugar, com filtros e busca inteligente",
            features: [
                (icon: "clock.arrow.circlepath", text: "Timeline de diagnósticos"),
                (icon: "magnifyingglass", text: "Busca por praga ou cultura"),
                (icon: "star.fill", text: "Favoritos para acesso rápido")
            ],
            backgroundColors: [
                Color(red: 0.04, green: 0.12, blue: 0.22),
                Color(red: 0.10, green: 0.30, blue: 0.50)
            ]
        ),
        OnboardingPage(
            icon: "books.vertical.fill",
            iconColor: Color(red: 0.80, green: 0.68, blue: 0.28),
            title: "Biblioteca de Pragas",
            subtitle: "Acesse informações detalhadas sobre pragas das principais culturas do Brasil",
            features: [
                (icon: "leaf.fill", text: "Soja, Milho, Café, Algodão e mais"),
                (icon: "info.circle.fill", text: "Sintomas e ciclo de vida"),
                (icon: "cross.vial.fill", text: "Controle cultural, químico e biológico")
            ],
            backgroundColors: [
                Color(red: 0.18, green: 0.14, blue: 0.04),
                Color(red: 0.38, green: 0.30, blue: 0.10)
            ]
        ),
        OnboardingPage(
            icon: "shield.checkered",
            iconColor: Color(red: 0.13, green: 0.54, blue: 0.26),
            title: "Proteja sua Lavoura",
            subtitle: "Tecnologia de ponta para o agronegócio brasileiro — do campo à tomada de decisão",
            features: [
                (icon: "sun.max.fill", text: "Avaliação de risco climático"),
                (icon: "chart.bar.fill", text: "Níveis de severidade detalhados"),
                (icon: "bell.badge.fill", text: "Alertas e prevenção")
            ],
            backgroundColors: [
                Color(red: 0.04, green: 0.18, blue: 0.08),
                Color(red: 0.13, green: 0.42, blue: 0.20)
            ]
        )
    ]

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

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
            withAnimation(.easeOut(duration: 0.6)) {
                appeared = true
            }
        }
    }

    private var bottomControls: some View {
        VStack(spacing: 20) {
            HStack(spacing: 8) {
                ForEach(0..<pages.count, id: \.self) { index in
                    Capsule()
                        .fill(index == currentPage ? Color.white : Color.white.opacity(0.3))
                        .frame(width: index == currentPage ? 24 : 8, height: 8)
                        .animation(.snappy(duration: 0.3), value: currentPage)
                }
            }

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
                .tint(AppTheme.brandGreen)
                .clipShape(.rect(cornerRadius: 16))
                .shadow(color: AppTheme.brandGreen.opacity(0.4), radius: 16, y: 8)
                .transition(.scale.combined(with: .opacity))
            } else {
                HStack {
                    Button {
                        onFinish()
                    } label: {
                        Text("Pular")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.5))
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
                        .background(.white.opacity(0.15))
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
                animateContent = false
                withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.15)) {
                    animateContent = true
                }
            }
        }
        .onAppear {
            if isActive {
                withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.3)) {
                    animateContent = true
                }
            }
        }
    }

    private var iconSection: some View {
        ZStack {
            Circle()
                .fill(page.iconColor.opacity(0.15))
                .frame(width: 140, height: 140)

            Circle()
                .fill(page.iconColor.opacity(0.1))
                .frame(width: 110, height: 110)

            Circle()
                .fill(page.iconColor.opacity(0.2))
                .frame(width: 80, height: 80)

            Image(systemName: page.icon)
                .font(.system(size: 38, weight: .medium))
                .foregroundStyle(.white)
                .symbolEffect(.breathe, options: .repeating.speed(0.4))
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
                .foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var featuresSection: some View {
        VStack(spacing: 14) {
            ForEach(Array(page.features.enumerated()), id: \.offset) { index, feature in
                HStack(spacing: 14) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(.white.opacity(0.1))
                            .frame(width: 40, height: 40)

                        Image(systemName: feature.icon)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(page.iconColor)
                    }

                    Text(feature.text)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white.opacity(0.85))

                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.white.opacity(0.06))
                .clipShape(.rect(cornerRadius: 14))
                .animation(
                    .spring(response: 0.4, dampingFraction: 0.8).delay(Double(index) * 0.08),
                    value: animateContent
                )
            }
        }
    }
}
