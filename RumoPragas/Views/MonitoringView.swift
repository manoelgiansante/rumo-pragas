import SwiftUI

struct MonitoringView: View {
    let weather: WeatherData?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let weather {
                    weatherDetailCard(weather)
                    riskAssessmentCard(weather)
                    recommendationsCard(weather)
                } else {
                    ContentUnavailableView {
                        Label("Sem dados climáticos", systemImage: "cloud.slash")
                    } description: {
                        Text("Não foi possível carregar as condições climáticas. Verifique sua conexão.")
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Monitoramento")
        .navigationBarTitleDisplayMode(.large)
    }

    private func weatherDetailCard(_ w: WeatherData) -> some View {
        VStack(spacing: 16) {
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
                        .frame(width: 56, height: 56)
                    Image(systemName: w.icon)
                        .font(.title2)
                        .foregroundStyle(.yellow)
                        .symbolEffect(.pulse, options: .repeating.speed(0.5))
                }

                VStack(alignment: .leading, spacing: 4) {
                    if !w.location.isEmpty {
                        Text(w.location)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text("\(Int(w.temperature))°C")
                        .font(.system(.largeTitle, design: .default, weight: .bold))
                    Text(w.description.capitalized)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }

            Divider()

            HStack(spacing: 0) {
                weatherMetric(icon: "humidity.fill", value: "\(Int(w.humidity))%", label: "Umidade", color: .cyan)
                Spacer()
                weatherMetric(icon: "cloud.rain.fill", value: String(format: "%.1f mm", w.dailyPrecipitation), label: "Chuva Hoje", color: .blue)
                Spacer()
                weatherMetric(icon: "wind", value: String(format: "%.0f km/h", w.windSpeed), label: "Vento", color: .teal)
            }

            Divider()

            HStack(spacing: 0) {
                weatherMetric(icon: "thermometer.variable", value: "\(Int(w.apparentTemperature))°C", label: "Sensação", color: .orange)
                Spacer()
                weatherMetric(icon: "drop.fill", value: String(format: "%.1f mm", w.precipitation), label: "Última Hora", color: .indigo)
                Spacer()
                weatherMetric(icon: "exclamationmark.triangle.fill", value: riskLevel(w), label: "Risco", color: riskColor(w))
            }
        }
        .premiumCard()
    }

    private func weatherMetric(icon: String, value: String, label: String, color: Color) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(color)
            Text(value)
                .font(.subheadline.bold().monospacedDigit())
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func riskAssessmentCard(_ w: WeatherData) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(riskColor(w))
                Text("Avaliação de Risco")
                    .font(.subheadline.weight(.bold))
            }

            VStack(alignment: .leading, spacing: 10) {
                riskRow(
                    title: "Doenças Fúngicas",
                    risk: w.humidity > 80 ? "Alto" : w.humidity > 60 ? "Médio" : "Baixo",
                    color: w.humidity > 80 ? .red : w.humidity > 60 ? .orange : .green,
                    detail: w.humidity > 80 ? "Umidade alta favorece fungos. Monitore intensamente." : "Condições dentro do normal."
                )

                Divider()

                riskRow(
                    title: "Pragas de Solo",
                    risk: w.dailyPrecipitation > 20 ? "Alto" : w.dailyPrecipitation > 5 ? "Médio" : "Baixo",
                    color: w.dailyPrecipitation > 20 ? .red : w.dailyPrecipitation > 5 ? .orange : .green,
                    detail: w.dailyPrecipitation > 20 ? "Chuva intensa favorece pragas de solo. Monitore com atenção." : w.dailyPrecipitation > 5 ? "Chuvas podem favorecer pragas de solo." : "Sem risco elevado no momento."
                )

                Divider()

                riskRow(
                    title: "Estresse Térmico",
                    risk: w.temperature > 35 ? "Alto" : w.temperature > 30 ? "Médio" : "Baixo",
                    color: w.temperature > 35 ? .red : w.temperature > 30 ? .orange : .green,
                    detail: w.temperature > 35 ? "Temperatura muito alta. Plantas sob estresse." : "Temperatura adequada para a maioria das culturas."
                )
            }
        }
        .premiumCard()
    }

    private func riskRow(title: String, risk: String, color: Color, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title)
                    .font(.subheadline.weight(.medium))
                Spacer()
                Text(risk)
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(color.opacity(0.15))
                    .foregroundStyle(color)
                    .clipShape(Capsule())
            }
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func recommendationsCard(_ w: WeatherData) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "lightbulb.fill")
                    .foregroundStyle(AppTheme.brandGold)
                Text("Recomendações")
                    .font(.subheadline.weight(.bold))
            }

            VStack(alignment: .leading, spacing: 10) {
                if w.humidity > 70 {
                    recommendationItem(
                        icon: "humidity.fill",
                        text: "Umidade elevada: monitore doenças fúngicas como ferrugem e oídio.",
                        color: .cyan
                    )
                }
                if w.temperature > 30 {
                    recommendationItem(
                        icon: "thermometer.sun.fill",
                        text: "Temperatura alta: aumente a frequência de irrigação e monitore pragas sugadoras.",
                        color: .red
                    )
                }
                if w.dailyPrecipitation > 10 {
                    recommendationItem(
                        icon: "cloud.rain.fill",
                        text: "Chuva acumulada de \(String(format: "%.0f", w.dailyPrecipitation)) mm hoje: evite aplicações de defensivos. Reavalie condições amanhã.",
                        color: .blue
                    )
                } else if w.precipitation > 3 {
                    recommendationItem(
                        icon: "cloud.rain.fill",
                        text: "Chuva recente: evite aplicações de defensivos nas próximas horas.",
                        color: .blue
                    )
                }
                if w.windSpeed > 15 {
                    recommendationItem(
                        icon: "wind",
                        text: "Vento acima de \(String(format: "%.0f", w.windSpeed)) km/h: evite pulverização para reduzir deriva.",
                        color: .teal
                    )
                }
                recommendationItem(
                    icon: "calendar.badge.clock",
                    text: "Realize amostragens semanais para detecção precoce de pragas.",
                    color: AppTheme.brandGreen
                )
                recommendationItem(
                    icon: "leaf.fill",
                    text: "Priorize o Manejo Integrado de Pragas (MIP) para resultados sustentáveis.",
                    color: Color(red: 0.18, green: 0.55, blue: 0.24)
                )
            }
        }
        .premiumCard()
    }

    private func recommendationItem(icon: String, text: String, color: Color) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(color)
                .frame(width: 24)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.primary)
        }
    }

    private func riskLevel(_ w: WeatherData) -> String {
        if w.humidity > 80 || w.temperature > 35 { return "Alto" }
        if w.humidity > 60 || w.temperature > 30 { return "Médio" }
        return "Baixo"
    }

    private func riskColor(_ w: WeatherData) -> Color {
        if w.humidity > 80 || w.temperature > 35 { return .red }
        if w.humidity > 60 || w.temperature > 30 { return .orange }
        return .green
    }
}
