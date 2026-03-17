import SwiftUI

struct CropSelectorSheet: View {
    @Binding var selectedCrop: CropType
    let onConfirm: () -> Void
    @State private var searchText = ""

    let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10)
    ]

    private var filteredCrops: [CropType] {
        if searchText.isEmpty { return CropType.allCases }
        return CropType.allCases.filter {
            $0.displayName.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 6) {
                Image(systemName: "leaf.circle.fill")
                    .font(.title)
                    .foregroundStyle(AppTheme.accent)
                    .symbolEffect(.bounce, options: .nonRepeating)
                Text("Qual cultura está afetada?")
                    .font(.title3.bold())
                Text("Selecione para melhor precisão do diagnóstico")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 8)

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                TextField("Buscar cultura...", text: $searchText)
                    .font(.subheadline)
            }
            .padding(10)
            .background(Color(.tertiarySystemGroupedBackground))
            .clipShape(.rect(cornerRadius: 10))
            .padding(.horizontal)

            ScrollView {
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(filteredCrops) { crop in
                        Button {
                            selectedCrop = crop
                        } label: {
                            VStack(spacing: 6) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 14)
                                        .fill(
                                            selectedCrop == crop
                                                ? LinearGradient(colors: [crop.accentColor, crop.accentColor.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing)
                                                : LinearGradient(colors: [crop.accentColor.opacity(0.12), crop.accentColor.opacity(0.05)], startPoint: .topLeading, endPoint: .bottomTrailing)
                                        )
                                        .frame(width: 48, height: 48)
                                        .shadow(color: selectedCrop == crop ? crop.accentColor.opacity(0.25) : .clear, radius: 6, y: 3)

                                    Image(systemName: crop.icon)
                                        .font(.title3)
                                        .foregroundStyle(selectedCrop == crop ? .white : crop.accentColor)
                                }

                                Text(crop.displayName)
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(selectedCrop == crop ? crop.accentColor : .primary)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.8)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(
                                selectedCrop == crop
                                    ? crop.accentColor.opacity(0.06)
                                    : Color(.secondarySystemGroupedBackground)
                            )
                            .clipShape(.rect(cornerRadius: 14))
                            .overlay(
                                RoundedRectangle(cornerRadius: 14)
                                    .strokeBorder(
                                        selectedCrop == crop ? crop.accentColor.opacity(0.5) : .clear,
                                        lineWidth: 2
                                    )
                            )
                        }
                        .sensoryFeedback(.selection, trigger: selectedCrop)
                        .accessibilityLabel(crop.displayName)
                        .accessibilityAddTraits(crop == selectedCrop ? .isSelected : [])
                    }
                }
                .padding(.horizontal)
            }

            Button {
                onConfirm()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "sparkle.magnifyingglass")
                        .font(.subheadline.weight(.semibold))
                    Text("Iniciar Diagnóstico")
                        .fontWeight(.bold)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 54)
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.accent)
            .clipShape(.rect(cornerRadius: 14))
            .shadow(color: AppTheme.accent.opacity(0.25), radius: 10, y: 4)
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
    }
}
