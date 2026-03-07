import SwiftUI

struct PestDetailView: View {
    let pest: Pest
    @Environment(\.dismiss) private var dismiss
    @State private var appeared = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    headerSection
                    detailSections
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Detalhes da Praga")
                        .font(.headline)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fechar") { dismiss() }
                }
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.5)) {
                appeared = true
            }
        }
    }

    private var headerSection: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                LinearGradient(
                    colors: [
                        pest.severity.color.opacity(0.25),
                        pest.severity.color.opacity(0.05)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .frame(height: 180)
                .background(Color(.secondarySystemGroupedBackground))

                HStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(pest.severity.color.opacity(0.15))
                            .frame(width: 72, height: 72)
                        Circle()
                            .strokeBorder(pest.severity.color.opacity(0.3), lineWidth: 2)
                            .frame(width: 72, height: 72)
                        Image(systemName: pest.severity.icon)
                            .font(.system(size: 30))
                            .foregroundStyle(pest.severity.color)
                            .symbolEffect(.bounce, options: .nonRepeating)
                    }

                    VStack(alignment: .leading, spacing: 5) {
                        Text(pest.namePt)
                            .font(.title2.bold())
                        Text(pest.scientificName)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .italic()
                        Text(pest.nameEs)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    Spacer()
                }
                .padding(20)
            }
            .frame(height: 180)

            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    if let crop = CropType(rawValue: pest.crop) {
                        PremiumBadge(text: crop.displayName, icon: crop.icon, color: crop.accentColor)
                    }
                    PremiumBadge(text: pest.category, icon: "tag.fill", color: .blue)
                    PremiumBadge(text: pest.severity.displayName, icon: pest.severity.icon, color: pest.severity.color)
                    if pest.isNotifiable {
                        PremiumBadge(text: "Notificação Obrigatória", icon: "exclamationmark.octagon.fill", color: .red)
                    }
                }
            }
            .contentMargins(.horizontal, 20)
            .scrollIndicators(.hidden)
            .padding(.vertical, 16)
            .background(Color(.secondarySystemGroupedBackground))
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : -8)
    }

    private var detailSections: some View {
        VStack(spacing: 12) {
            sectionCard(title: "Sobre", icon: "info.circle.fill", color: AppTheme.brandGreen) {
                Text(pest.description)
                    .font(.subheadline)
                    .lineSpacing(4)
            }

            sectionCard(title: "Sintomas", icon: "eye.fill", color: .red) {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(pest.symptoms, id: \.self) { symptom in
                        HStack(alignment: .top, spacing: 10) {
                            Circle()
                                .fill(.red.opacity(0.6))
                                .frame(width: 6, height: 6)
                                .padding(.top, 7)
                            Text(symptom)
                                .font(.subheadline)
                                .lineSpacing(2)
                        }
                    }
                }
            }

            sectionCard(title: "Ciclo de Vida", icon: "arrow.triangle.2.circlepath", color: .purple) {
                Text(pest.lifecycle)
                    .font(.subheadline)
                    .lineSpacing(4)
            }

            sectionCard(title: "Controle Cultural", icon: "leaf.fill", color: AppTheme.brandGreen) {
                Text(pest.treatmentCultural)
                    .font(.subheadline)
                    .lineSpacing(4)
            }

            sectionCard(title: "Controle Convencional", icon: "flask.fill", color: .blue) {
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

                    Text(pest.treatmentConventional)
                        .font(.subheadline)
                        .lineSpacing(4)
                }
            }

            sectionCard(title: "Controle Biológico", icon: "ladybug.fill", color: .orange) {
                Text(pest.treatmentOrganic)
                    .font(.subheadline)
                    .lineSpacing(4)
            }

            sectionCard(title: "Prevenção", icon: "shield.checkered", color: .cyan) {
                Text(pest.prevention)
                    .font(.subheadline)
                    .lineSpacing(4)
            }
        }
        .padding(.top, 16)
        .padding(.bottom, 32)
    }

    private func sectionCard(
        title: String,
        icon: String,
        color: Color,
        @ViewBuilder content: () -> some View
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
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
            }

            Divider()

            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 16))
        .shadow(color: .black.opacity(0.04), radius: 8, y: 4)
        .padding(.horizontal, 16)
    }
}
