import SwiftUI

struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPlan: SubscriptionPlan = .pro
    @State private var appeared = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    headerSection
                    planCards
                    featureComparison
                    subscribeButton
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 20)
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 16)
            }
            .background(Color(.systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
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
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [AppTheme.brandGold.opacity(0.2), .clear],
                            center: .center,
                            startRadius: 0,
                            endRadius: 60
                        )
                    )
                    .frame(width: 120, height: 120)

                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [AppTheme.brandGold, AppTheme.brandGold.opacity(0.7)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 72, height: 72)
                        .shadow(color: AppTheme.brandGold.opacity(0.4), radius: 16, y: 6)

                    Image(systemName: "crown.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(.white)
                        .symbolEffect(.bounce, options: .nonRepeating)
                }
            }

            VStack(spacing: 6) {
                Text("Rumo Pragas Pro")
                    .font(.title.bold())
                Text("Desbloqueie todo o potencial da IA\npara proteger sua lavoura")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)
            }
        }
    }

    private var planCards: some View {
        HStack(spacing: 10) {
            ForEach(SubscriptionPlan.allCases, id: \.rawValue) { plan in
                Button {
                    withAnimation(.snappy(duration: 0.25)) {
                        selectedPlan = plan
                    }
                } label: {
                    VStack(spacing: 10) {
                        if plan == .pro {
                            HStack(spacing: 4) {
                                Image(systemName: "star.fill")
                                    .font(.system(size: 8))
                                Text("Popular")
                                    .font(.system(size: 10, weight: .bold))
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(AppTheme.brandGold)
                            .clipShape(Capsule())
                        }

                        Text(plan.displayName)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(selectedPlan == plan ? .white : .primary)

                        Text(plan.price)
                            .font(.caption.weight(.bold).monospacedDigit())
                            .foregroundStyle(selectedPlan == plan ? .white.opacity(0.9) : .secondary)

                        Text("\(plan.diagnosisLimit) diag/mês")
                            .font(.caption2)
                            .foregroundStyle(selectedPlan == plan ? .white.opacity(0.7) : Color.gray)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                    .background(
                        Group {
                            if selectedPlan == plan {
                                LinearGradient(
                                    colors: [AppTheme.brandGreen, AppTheme.brandDarkGreen],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            } else {
                                Color(.secondarySystemGroupedBackground)
                            }
                        }
                    )
                    .clipShape(.rect(cornerRadius: 16))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .strokeBorder(
                                selectedPlan == plan
                                    ? AppTheme.brandGreen
                                    : Color(.separator).opacity(0.5),
                                lineWidth: selectedPlan == plan ? 2 : 1
                            )
                    )
                    .shadow(
                        color: selectedPlan == plan ? AppTheme.brandGreen.opacity(0.3) : .clear,
                        radius: 12, y: 6
                    )
                }
                .sensoryFeedback(.selection, trigger: selectedPlan)
            }
        }
    }

    private var featureComparison: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(AppTheme.brandGreen)
                Text("Recursos incluídos")
                    .font(.headline)
            }

            ForEach(selectedPlan.features, id: \.self) { feature in
                HStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(AppTheme.brandGreen.opacity(0.12))
                            .frame(width: 24, height: 24)
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(AppTheme.brandGreen)
                    }
                    Text(feature)
                        .font(.subheadline)
                }
            }
        }
        .premiumCard()
    }

    private var subscribeButton: some View {
        VStack(spacing: 14) {
            Button {
                dismiss()
            } label: {
                Text(selectedPlan == .free ? "Continuar Gratuito" : "Assinar \(selectedPlan.displayName)")
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.brandGreen)
            .clipShape(.rect(cornerRadius: 14))
            .shadow(color: AppTheme.brandGreen.opacity(0.3), radius: 12, y: 6)

            Text("Cancele a qualquer momento. Sem compromisso.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }
}
