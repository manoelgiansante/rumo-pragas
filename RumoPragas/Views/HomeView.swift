import SwiftUI

struct HomeView: View {
    @State private var viewModel = HomeViewModel()
    @State private var appeared = false
    @State private var showDiagnosisFlow = false
    @State private var navigateToHistory = false
    @State private var navigateToMonitoring = false
    let authVM: AuthViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    heroHeader
                    mainContent
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        Image(systemName: "leaf.fill")
                            .font(.headline)
                            .foregroundStyle(AppTheme.brandGreen)
                        Text("Rumo Pragas")
                            .font(.headline.weight(.bold))
                    }
                }
            }
            .fullScreenCover(isPresented: $showDiagnosisFlow) {
                DiagnosisFlowView(isPresented: $showDiagnosisFlow, authVM: authVM)
            }
            .navigationDestination(isPresented: $navigateToHistory) {
                HistoryView(authVM: authVM)
            }
            .navigationDestination(isPresented: $navigateToMonitoring) {
                MonitoringView(weather: viewModel.weather)
            }
        }
        .task {
            await viewModel.loadWeather()
            withAnimation(.easeOut(duration: 0.6)) {
                appeared = true
            }
        }
    }

    private var heroHeader: some View {
        ZStack(alignment: .bottomLeading) {
            AppTheme.meshBackground
                .frame(height: 200)

            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0.0),
                    .init(color: Color(.systemGroupedBackground), location: 1.0)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 80)
            .frame(maxHeight: .infinity, alignment: .bottom)

            VStack(alignment: .leading, spacing: 6) {
                Text(greetingText)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
                Text(authVM.currentUser?.userMetadata?.fullName ?? "Produtor")
                    .font(.title.bold())
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .frame(height: 200)
    }

    private var mainContent: some View {
        VStack(spacing: 20) {
            weatherCard
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 16)

            scanButton
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 20)

            statsRow
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 24)

            recentDiagnosisSection
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 28)

            tipsSection
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 32)
        }
        .padding(.horizontal, 16)
        .padding(.top, -20)
        .padding(.bottom, 40)
        .animation(.easeOut(duration: 0.7).delay(0.1), value: appeared)
    }

    private var weatherCard: some View {
        Group {
            if let weather = viewModel.weather {
                HStack(spacing: 0) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [.orange.opacity(0.3), .yellow.opacity(0.2)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 52, height: 52)
                            Image(systemName: weather.icon)
                                .font(.title2)
                                .foregroundStyle(.yellow)
                                .symbolEffect(.pulse, options: .repeating.speed(0.5))
                        }

                        VStack(alignment: .leading, spacing: 3) {
                            Text(weather.location)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("\(Int(weather.temperature))°C")
                                .font(.system(.title, design: .default, weight: .bold))
                            Text(weather.description.capitalized)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: "humidity.fill")
                                .font(.caption)
                                .foregroundStyle(.cyan)
                            Text("\(Int(weather.humidity))%")
                                .font(.subheadline.weight(.semibold).monospacedDigit())
                        }
                        HStack(spacing: 6) {
                            Image(systemName: "cloud.rain.fill")
                                .font(.caption)
                                .foregroundStyle(.blue)
                            Text(String(format: "%.1f mm", weather.dailyPrecipitation))
                                .font(.subheadline.weight(.semibold).monospacedDigit())
                        }
                        HStack(spacing: 6) {
                            Image(systemName: "wind")
                                .font(.caption)
                                .foregroundStyle(.teal)
                            Text(String(format: "%.0f km/h", weather.windSpeed))
                                .font(.subheadline.weight(.semibold).monospacedDigit())
                        }
                    }
                }
                .premiumCard()
            } else if viewModel.isLoadingWeather {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Carregando condições climáticas...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .premiumCard()
            }
        }
    }

    private var scanButton: some View {
        Button {
            showDiagnosisFlow = true
        } label: {
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [AppTheme.brandGreen, AppTheme.brandDarkGreen],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 64, height: 64)
                        .shadow(color: AppTheme.brandGreen.opacity(0.4), radius: 12, y: 4)

                    Image(systemName: "camera.viewfinder")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundStyle(.white)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Diagnosticar Praga")
                        .font(.title3.bold())
                        .foregroundStyle(.primary)
                    Text("Foto ou galeria • IA especializada")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .premiumCard(padding: 20)
        }
        .sensoryFeedback(.impact(weight: .light), trigger: showDiagnosisFlow)
    }

    private var statsRow: some View {
        HStack(spacing: 12) {
            Button {
                navigateToHistory = true
            } label: {
                StatMiniCard(
                    icon: "doc.text.magnifyingglass",
                    value: "—",
                    label: "Diagnósticos",
                    color: AppTheme.brandGreen
                )
            }
            .buttonStyle(.plain)

            Button {
                showDiagnosisFlow = true
            } label: {
                StatMiniCard(
                    icon: "shield.checkered",
                    value: "MIP",
                    label: "Estratégia",
                    color: .cyan
                )
            }
            .buttonStyle(.plain)

            Button {
                navigateToMonitoring = true
            } label: {
                StatMiniCard(
                    icon: "chart.line.uptrend.xyaxis",
                    value: "—",
                    label: "Monitoramento",
                    color: .orange
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var recentDiagnosisSection: some View {
        Group {
            if let recent = viewModel.recentDiagnosis {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Último Diagnóstico")
                            .font(.title3.bold())
                        Spacer()
                        Image(systemName: "clock.fill")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    DiagnosisCardView(diagnosis: recent)
                }
            }
        }
    }

    private var tipsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Boas Práticas")
                    .font(.title3.bold())
                Spacer()
                Image(systemName: "lightbulb.fill")
                    .font(.caption)
                    .foregroundStyle(AppTheme.brandGold)
            }

            ForEach(Array(viewModel.tips.enumerated()), id: \.element.id) { index, tip in
                HStack(spacing: 14) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(
                                LinearGradient(
                                    colors: [tip.color.opacity(0.2), tip.color.opacity(0.08)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 44, height: 44)
                        Image(systemName: tip.icon)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(tip.color)
                    }

                    VStack(alignment: .leading, spacing: 3) {
                        Text(tip.title)
                            .font(.subheadline.weight(.semibold))
                        Text(tip.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }

                    Spacer(minLength: 0)
                }
                .premiumCard(padding: 14)
            }
        }
    }

    private var greetingText: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 12 { return "Bom dia" }
        if hour < 18 { return "Boa tarde" }
        return "Boa noite"
    }

}

struct StatMiniCard: View {
    let icon: String
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(color)
            Text(value)
                .font(.subheadline.bold().monospacedDigit())
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .premiumCard(padding: 14)
    }
}

struct DiagnosisErrorView: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            ZStack {
                Circle()
                    .fill(.orange.opacity(0.12))
                    .frame(width: 100, height: 100)
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(.orange)
                    .symbolEffect(.bounce, options: .nonRepeating)
            }

            VStack(spacing: 8) {
                Text("Erro no Diagnóstico")
                    .font(.title2.bold())
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            Button {
                onDismiss()
            } label: {
                Text("Fechar")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.brandGreen)
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity)
    }
}
