import SwiftUI

struct DiagnosisResultView: View {
    let result: DiagnosisResult
    @State private var expandedSections: Set<String> = ["description", "symptoms"]
    @State private var appeared = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                headerSection
                contentSection
            }
        }
        .background(Color(.systemGroupedBackground))
        .onAppear {
            withAnimation(.easeOut(duration: 0.5)) {
                appeared = true
            }
        }
    }

    private var headerSection: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                if result.isHealthy {
                    LinearGradient(
                        colors: [
                            AppTheme.accent,
                            AppTheme.accentLight
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .frame(height: 160)
                } else {
                    LinearGradient(
                        colors: [
                            result.severityLevel.color.opacity(0.15),
                            result.severityLevel.color.opacity(0.04)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 160)
                    .background(Color(.secondarySystemGroupedBackground))
                }

                VStack(alignment: .leading, spacing: 12) {
                    if result.isHealthy {
                        healthyHeader
                    } else {
                        pestHeader
                    }
                }
                .padding(20)
            }
            .frame(height: 160)

            VStack(spacing: 12) {
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        PremiumBadge(
                            text: result.severityLevel.displayName,
                            icon: result.severityLevel.icon,
                            color: result.severityLevel.color
                        )
                        PremiumBadge(
                            text: "Confiança: \(result.confidenceLevel.percentage)",
                            icon: "chart.bar.fill",
                            color: result.confidenceLevel.color
                        )
                        if let crop = result.cropType {
                            PremiumBadge(
                                text: crop.displayName,
                                icon: crop.icon,
                                color: crop.accentColor
                            )
                        }
                        if let cropDetected = result.cropDetectedName {
                            PremiumBadge(
                                text: "Detectado: \(cropDetected)",
                                icon: "eye.fill",
                                color: AppTheme.techIndigo
                            )
                        }
                    }
                }
                .contentMargins(.horizontal, 20)
                .scrollIndicators(.hidden)

                if result.allPredictions.count > 1 {
                    predictionsRow
                        .padding(.horizontal, 20)
                }
            }
            .padding(.vertical, 16)
            .background(Color(.secondarySystemGroupedBackground))
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : -10)
    }

    private var healthyHeader: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(.white.opacity(0.2))
                    .frame(width: 64, height: 64)
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(.white)
                    .symbolEffect(.bounce, options: .nonRepeating)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Planta Saudável")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                Text("Nenhuma praga ou doença detectada")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.85))
            }
            Spacer()
        }
    }

    private var pestHeader: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(result.severityLevel.color.opacity(0.15))
                    .frame(width: 64, height: 64)
                Image(systemName: result.severityLevel.icon)
                    .font(.system(size: 28))
                    .foregroundStyle(result.severityLevel.color)
                    .symbolEffect(.bounce, options: .nonRepeating)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(result.displayName)
                    .font(.title2.bold())
                if let scientific = result.scientificName {
                    Text(scientific)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .italic()
                }
            }
            Spacer()
        }
    }

    private var predictionsRow: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Outras possibilidades", systemImage: "arrow.triangle.branch")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            ForEach(Array(result.allPredictions.dropFirst().prefix(3))) { prediction in
                HStack(spacing: 10) {
                    Circle()
                        .fill(predictionColor(prediction.confidence))
                        .frame(width: 8, height: 8)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(prediction.commonName ?? prediction.id)
                            .font(.subheadline)
                        if let sci = prediction.scientificName {
                            Text(sci)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                                .italic()
                        }
                    }
                    Spacer()
                    Text("\(Int(prediction.confidence * 100))%")
                        .font(.subheadline.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(14)
        .background(Color(.tertiarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 12))
    }

    private var contentSection: some View {
        VStack(spacing: 12) {
            if let desc = result.descriptionText, !desc.isEmpty {
                CollapsibleSection(
                    title: "Descrição",
                    icon: "doc.text.fill",
                    color: AppTheme.accent,
                    isExpanded: expandedSections.contains("description"),
                    toggle: { toggleSection("description") }
                ) {
                    Text(desc)
                        .font(.subheadline)
                        .lineSpacing(4)
                }
            }

            if !result.symptomsList.isEmpty {
                CollapsibleSection(
                    title: "Sintomas",
                    icon: "eye.fill",
                    color: AppTheme.coral,
                    isExpanded: expandedSections.contains("symptoms"),
                    toggle: { toggleSection("symptoms") }
                ) {
                    bulletList(result.symptomsList)
                }
            }

            if !result.causesList.isEmpty {
                CollapsibleSection(
                    title: "Causas",
                    icon: "exclamationmark.triangle.fill",
                    color: AppTheme.warmAmber,
                    isExpanded: expandedSections.contains("causes"),
                    toggle: { toggleSection("causes") }
                ) {
                    bulletList(result.causesList)
                }
            }

            if !result.favorableConditions.isEmpty {
                CollapsibleSection(
                    title: "Condições Favoráveis",
                    icon: "cloud.sun.fill",
                    color: .cyan,
                    isExpanded: expandedSections.contains("conditions"),
                    toggle: { toggleSection("conditions") }
                ) {
                    bulletList(result.favorableConditions)
                }
            }

            if let lifecycle = result.lifecycleText, !lifecycle.isEmpty {
                CollapsibleSection(
                    title: "Ciclo de Vida",
                    icon: "arrow.triangle.2.circlepath",
                    color: .teal,
                    isExpanded: expandedSections.contains("lifecycle"),
                    toggle: { toggleSection("lifecycle") }
                ) {
                    Text(lifecycle)
                        .font(.subheadline)
                        .lineSpacing(4)
                }
            }

            if !result.monitoringTips.isEmpty {
                CollapsibleSection(
                    title: "Monitoramento",
                    icon: "binoculars.fill",
                    color: AppTheme.techIndigo,
                    isExpanded: expandedSections.contains("monitoring"),
                    toggle: { toggleSection("monitoring") }
                ) {
                    bulletList(result.monitoringTips)
                }
            }

            if !result.culturalTreatmentList.isEmpty {
                CollapsibleSection(
                    title: "Controle Cultural / MIP",
                    icon: "hand.raised.fill",
                    color: AppTheme.accent,
                    isExpanded: expandedSections.contains("cultural"),
                    toggle: { toggleSection("cultural") }
                ) {
                    bulletList(result.culturalTreatmentList)
                }
            }

            if !result.chemicalTreatmentList.isEmpty {
                CollapsibleSection(
                    title: "Controle Químico",
                    icon: "flask.fill",
                    color: AppTheme.techBlue,
                    isExpanded: expandedSections.contains("chemical"),
                    toggle: { toggleSection("chemical") }
                ) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.caption)
                            Text("Consulte um agrônomo para receituário agronômico")
                                .font(.caption)
                        }
                        .foregroundStyle(.orange)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.orange.opacity(0.08))
                        .clipShape(.rect(cornerRadius: 8))

                        bulletList(result.chemicalTreatmentList)
                    }
                }
            }

            if !result.biologicalTreatmentList.isEmpty {
                CollapsibleSection(
                    title: "Controle Biológico",
                    icon: "ladybug.fill",
                    color: AppTheme.accentLight,
                    isExpanded: expandedSections.contains("biological"),
                    toggle: { toggleSection("biological") }
                ) {
                    bulletList(result.biologicalTreatmentList)
                }
            }

            if !result.recommendedProducts.isEmpty {
                CollapsibleSection(
                    title: "Produtos Recomendados",
                    icon: "pills.fill",
                    color: .mint,
                    isExpanded: expandedSections.contains("products"),
                    toggle: { toggleSection("products") }
                ) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.caption)
                            Text("Verifique registro no AGROFIT/MAPA antes de aplicar")
                                .font(.caption)
                        }
                        .foregroundStyle(.orange)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.orange.opacity(0.08))
                        .clipShape(.rect(cornerRadius: 8))

                        ForEach(result.recommendedProducts) { product in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(product.name)
                                    .font(.subheadline.weight(.semibold))
                                if let active = product.activeIngredient {
                                    HStack(spacing: 4) {
                                        Text("Princípio ativo:")
                                            .foregroundStyle(.secondary)
                                        Text(active)
                                    }
                                    .font(.caption)
                                }
                                if let dosage = product.dosage {
                                    HStack(spacing: 4) {
                                        Text("Dosagem:")
                                            .foregroundStyle(.secondary)
                                        Text(dosage)
                                    }
                                    .font(.caption)
                                }
                                if let safety = product.safetyPeriod {
                                    HStack(spacing: 4) {
                                        Text("Carência:")
                                            .foregroundStyle(.secondary)
                                        Text(safety)
                                    }
                                    .font(.caption)
                                }
                                if let toxicClass = product.toxicClass {
                                    HStack(spacing: 4) {
                                        Text("Classe:")
                                            .foregroundStyle(.secondary)
                                        Text(toxicClass)
                                    }
                                    .font(.caption)
                                }
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.tertiarySystemGroupedBackground))
                            .clipShape(.rect(cornerRadius: 8))
                        }
                    }
                }
            }

            if !result.preventionList.isEmpty {
                CollapsibleSection(
                    title: "Prevenção",
                    icon: "shield.checkered",
                    color: .cyan,
                    isExpanded: expandedSections.contains("prevention"),
                    toggle: { toggleSection("prevention") }
                ) {
                    bulletList(result.preventionList)
                }
            }

            if let resistance = result.resistanceInfo, !resistance.isEmpty {
                CollapsibleSection(
                    title: "Resistência",
                    icon: "exclamationmark.shield.fill",
                    color: AppTheme.coral,
                    isExpanded: expandedSections.contains("resistance"),
                    toggle: { toggleSection("resistance") }
                ) {
                    Text(resistance)
                        .font(.subheadline)
                        .lineSpacing(4)
                }
            }

            if let impact = result.economicImpactText, !impact.isEmpty {
                CollapsibleSection(
                    title: "Impacto Econômico",
                    icon: "chart.line.downtrend.xyaxis",
                    color: AppTheme.coral,
                    isExpanded: expandedSections.contains("impact"),
                    toggle: { toggleSection("impact") }
                ) {
                    Text(impact)
                        .font(.subheadline)
                        .lineSpacing(4)
                }
            }

            if !result.relatedPests.isEmpty {
                CollapsibleSection(
                    title: "Pragas Relacionadas",
                    icon: "link",
                    color: AppTheme.techIndigo,
                    isExpanded: expandedSections.contains("related"),
                    toggle: { toggleSection("related") }
                ) {
                    bulletList(result.relatedPests)
                }
            }

            if let mip = result.enrichment?.mipStrategy, !mip.isEmpty {
                CollapsibleSection(
                    title: "Estratégia MIP",
                    icon: "shield.lefthalf.filled",
                    color: AppTheme.accent,
                    isExpanded: expandedSections.contains("mip"),
                    toggle: { toggleSection("mip") }
                ) {
                    Text(mip)
                        .font(.subheadline)
                        .lineSpacing(4)
                }
            }

            if let threshold = result.enrichment?.actionThreshold, !threshold.isEmpty {
                CollapsibleSection(
                    title: "Nível de Ação",
                    icon: "speedometer",
                    color: AppTheme.warmAmber,
                    isExpanded: expandedSections.contains("threshold"),
                    toggle: { toggleSection("threshold") }
                ) {
                    Text(threshold)
                        .font(.subheadline)
                        .lineSpacing(4)
                }
            }

            if result.allPredictions.count > 1 {
                similarDetectionsCard
            }

            confidenceDetailCard
                .padding(.bottom, 32)
        }
        .padding(.top, 16)
    }

    private var similarDetectionsCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "arrow.triangle.branch")
                    .foregroundStyle(AppTheme.techIndigo)
                Text("Detecções Similares")
                    .font(.subheadline.weight(.bold))
            }

            ForEach(result.allPredictions) { prediction in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(prediction.commonName ?? prediction.id)
                            .font(.subheadline.weight(.medium))
                        if let sci = prediction.scientificName {
                            Text(sci)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .italic()
                        }
                        if let cat = prediction.category {
                            Text(cat)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    }

                    Spacer()

                    ConfidenceBar(value: prediction.confidence)
                }
            }
        }
        .premiumCard()
        .padding(.horizontal, 16)
    }

    private var confidenceDetailCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Detalhes da Análise", systemImage: "cpu.fill")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(AppTheme.accent)

            Divider()

            DetailRow(label: "Cultura selecionada", value: result.crop)

            if let detected = result.cropDetectedName {
                DetailRow(label: "Cultura detectada", value: detected)
            }

            if let cropConf = result.cropDetectedConfidence {
                DetailRow(label: "Confiança da cultura", value: "\(Int(cropConf * 100))%")
            }

            if let confidence = result.confidence {
                DetailRow(label: "Confiança da praga", value: "\(Int(confidence * 100))%")
            }

            if let pestId = result.pestId {
                DetailRow(label: "ID Agrio", value: pestId)
            }

            if let location = result.locationName {
                DetailRow(label: "Localização", value: location)
            }
        }
        .premiumCard()
        .padding(.horizontal, 16)
    }

    private func bulletList(_ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(items, id: \.self) { item in
                HStack(alignment: .top, spacing: 10) {
                    Circle()
                        .fill(AppTheme.accent)
                        .frame(width: 6, height: 6)
                        .padding(.top, 7)
                    Text(item)
                        .font(.subheadline)
                        .lineSpacing(2)
                }
            }
        }
    }

    private func predictionColor(_ confidence: Double) -> Color {
        if confidence >= 0.7 { return AppTheme.coral }
        if confidence >= 0.4 { return AppTheme.warmAmber }
        return .gray
    }

    private func toggleSection(_ id: String) {
        withAnimation(.snappy(duration: 0.25)) {
            if expandedSections.contains(id) {
                expandedSections.remove(id)
            } else {
                expandedSections.insert(id)
            }
        }
    }
}

struct ConfidenceBar: View {
    let value: Double

    private var barColor: Color {
        if value >= 0.7 { return AppTheme.coral }
        if value >= 0.4 { return AppTheme.warmAmber }
        return .gray
    }

    var body: some View {
        HStack(spacing: 8) {
            GeometryReader { geo in
                Capsule()
                    .fill(Color(.systemGray5))
                    .overlay(alignment: .leading) {
                        Capsule()
                            .fill(barColor)
                            .frame(width: geo.size.width * value)
                    }
            }
            .frame(width: 50, height: 6)

            Text("\(Int(value * 100))%")
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 36, alignment: .trailing)
        }
    }
}

struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline.weight(.semibold))
        }
    }
}

struct PremiumBadge: View {
    let text: String
    let icon: String
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.caption2.weight(.semibold))
            Text(text)
                .font(.caption.weight(.semibold))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.12))
        .foregroundStyle(color)
        .clipShape(Capsule())
    }
}

struct CollapsibleSection<Content: View>: View {
    let title: String
    let icon: String
    let color: Color
    let isExpanded: Bool
    let toggle: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                toggle()
            } label: {
                HStack(spacing: 10) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(color.opacity(0.12))
                            .frame(width: 32, height: 32)
                        Image(systemName: icon)
                            .font(.subheadline)
                            .foregroundStyle(color)
                    }

                    Text(title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .animation(.snappy(duration: 0.2), value: isExpanded)
                }
                .padding(16)
            }
            .accessibilityLabel("\(title), \(isExpanded ? "expandido" : "recolhido")")
            .accessibilityHint("Toque para \(isExpanded ? "recolher" : "expandir")")

            if isExpanded {
                Divider()
                    .padding(.horizontal, 16)
                content
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 16))
        .shadow(color: .black.opacity(0.04), radius: 8, y: 4)
        .padding(.horizontal, 16)
    }
}

struct TagBadge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(color.opacity(0.12))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}
