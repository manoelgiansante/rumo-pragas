import SwiftUI

struct HomeView: View {
    @State private var viewModel = HomeViewModel()
    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showDiagnosisFlow = false
    @State private var navigateToHistory = false
    @State private var selectedDiagnosis: DiagnosisResult?
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
                            .foregroundStyle(AppTheme.accent)
                        Text("Rumo Pragas")
                            .font(.headline.weight(.bold))
                    }
                }
            }
            .fullScreenCover(isPresented: $showDiagnosisFlow) {
                DiagnosisFlowView(isPresented: $showDiagnosisFlow, authVM: authVM)
            }
            .navigationDestination(isPresented: $navigateToHistory) {
                HistoryView(authVM: authVM, embedded: true)
            }
            .navigationDestination(isPresented: $navigateToMonitoring) {
                MonitoringView(weather: viewModel.weather)
            }
        }
        .task {
            async let weatherTask: () = viewModel.loadWeather()
            async let recentTask: () = viewModel.loadRecentDiagnosis(token: authVM.accessToken, userId: authVM.currentUser?.id)
            async let countTask: () = viewModel.loadDiagnosisCount(token: authVM.accessToken, userId: authVM.currentUser?.id)
            _ = await (weatherTask, recentTask, countTask)
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(.easeOut(duration: 0.6)) {
                    appeared = true
                }
            }
        }
        .refreshable {
            async let weatherTask: () = viewModel.loadWeather()
            async let recentTask: () = viewModel.loadRecentDiagnosis(token: authVM.accessToken, userId: authVM.currentUser?.id)
            async let countTask: () = viewModel.loadDiagnosisCount(token: authVM.accessToken, userId: authVM.currentUser?.id)
            _ = await (weatherTask, recentTask, countTask)
        }
    }

    private var heroHeader: some View {
        ZStack(alignment: .bottomLeading) {
            AppTheme.meshBackground
                .frame(height: 190)

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

            VStack(alignment: .leading, spacing: 4) {
                Text(greetingText)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.9))
                Text(authVM.currentUser?.userMetadata?.fullName ?? "Produtor")
                    .font(.title.bold())
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .frame(height: 190)
    }

    private var mainContent: some View {
        VStack(spacing: 16) {
            weatherCard
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 14)

            scanButton
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 18)

            statsRow
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 22)

            recentDiagnosisSection
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 26)

            tipsSection
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 30)
        }
        .padding(.horizontal, 16)
        .padding(.top, -16)
        .padding(.bottom, 32)
        .animation(reduceMotion ? nil : .spring(response: 0.6, dampingFraction: 0.85).delay(0.1), value: appeared)
    }

    private var weatherCard: some View {
        Group {
            if let weather = viewModel.weather {
                HStack(spacing: 0) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(AppTheme.warmAmber.opacity(0.15))
                                .frame(width: 50, height: 50)
                            Image(systemName: weather.icon)
                                .font(.title3)
                                .foregroundStyle(AppTheme.warmAmber)
                                .symbolEffect(.pulse, options: .repeating.speed(0.5), isActive: !reduceMotion)
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(weather.location)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("\(Int(weather.temperature))°C")
                                .font(.system(.title2, design: .default, weight: .bold))
                            Text(weather.description.capitalized)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 8) {
                        weatherMetricSmall(icon: "humidity.fill", value: "\(Int(weather.humidity))%", color: .cyan)
                        weatherMetricSmall(icon: "cloud.rain.fill", value: String(format: "%.1f mm", weather.dailyPrecipitation), color: AppTheme.techBlue)
                        weatherMetricSmall(icon: "wind", value: String(format: "%.0f km/h", weather.windSpeed), color: .teal)
                    }
                }
                .premiumCard()
            } else if viewModel.isLoadingWeather {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Carregando clima...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .premiumCard()
            }
        }
    }

    private func weatherMetricSmall(icon: String, value: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundStyle(color)
            Text(value)
                .font(.caption.weight(.semibold).monospacedDigit())
        }
    }

    private var scanButton: some View {
        Button {
            showDiagnosisFlow = true
        } label: {
            HStack(spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(AppTheme.heroGradient)
                        .frame(width: 60, height: 60)
                        .shadow(color: AppTheme.accent.opacity(0.35), radius: 10, y: 4)

                    Image(systemName: "camera.viewfinder")
                        .font(.system(size: 26, weight: .medium))
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
            .premiumCard(padding: 18)
        }
        .sensoryFeedback(.impact(weight: .light), trigger: showDiagnosisFlow)
        .accessibilityLabel("Diagnosticar praga com câmera ou galeria")
    }

    private var statsRow: some View {
        HStack(spacing: 12) {
            Button {
                navigateToHistory = true
            } label: {
                StatMiniCard(
                    icon: "doc.text.magnifyingglass",
                    value: viewModel.diagnosisCount > 0 ? "\(viewModel.diagnosisCount)" : "—",
                    label: "Diagnósticos",
                    color: AppTheme.accent
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
                    color: AppTheme.techBlue
                )
            }
            .buttonStyle(.plain)

            Button {
                navigateToMonitoring = true
            } label: {
                StatMiniCard(
                    icon: "chart.line.uptrend.xyaxis",
                    value: riskLevelText,
                    label: "Monitoramento",
                    color: AppTheme.warmAmber
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
                    Button {
                        selectedDiagnosis = recent
                    } label: {
                        DiagnosisCardView(diagnosis: recent)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .sheet(item: $selectedDiagnosis) { diagnosis in
            NavigationStack {
                DiagnosisResultView(result: diagnosis)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .principal) {
                            Text("Resultado")
                                .font(.headline)
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Fechar") { selectedDiagnosis = nil }
                        }
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
                    .foregroundStyle(AppTheme.warmAmber)
            }

            ForEach(viewModel.tips) { tip in
                HStack(spacing: 14) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(AppTheme.accent.opacity(0.12))
                            .frame(width: 42, height: 42)
                        Image(systemName: tip.icon)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(AppTheme.accent)
                    }

                    VStack(alignment: .leading, spacing: 3) {
                        Text(tip.title)
                            .font(.subheadline.weight(.semibold))
                        Text(tip.descriptionText)
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

    private var riskLevelText: String {
        guard let w = viewModel.weather else { return "—" }
        if w.humidity > 80 || w.temperature > 35 { return "Alto" }
        if w.humidity > 60 || w.temperature > 30 { return "Médio" }
        return "Baixo"
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
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .premiumCard(padding: 14)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(value) \(label)")
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
                    .fill(AppTheme.coral.opacity(0.12))
                    .frame(width: 100, height: 100)
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(AppTheme.coral)
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
            .tint(AppTheme.accent)
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity)
    }
}
