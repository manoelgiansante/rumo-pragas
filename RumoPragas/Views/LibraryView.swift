import SwiftUI

struct LibraryView: View {
    @State private var viewModel = LibraryViewModel()
    @State private var selectedPest: Pest?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    cropCategorySection
                    pestGridSection
                }
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Biblioteca")
            .searchable(text: $viewModel.searchText, prompt: "Buscar praga...")
            .sheet(item: $selectedPest) { pest in
                PestDetailView(pest: pest)
            }
        }
    }

    private var cropCategorySection: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 10) {
                CropCategoryChip(
                    icon: "square.grid.2x2.fill",
                    name: "Todos",
                    color: AppTheme.techBlue,
                    isSelected: viewModel.selectedCrop == nil,
                    count: nil
                ) {
                    viewModel.selectedCrop = nil
                }

                ForEach(viewModel.cropCounts, id: \.0) { crop, count in
                    CropCategoryChip(
                        icon: crop.icon,
                        name: crop.displayName,
                        color: crop.accentColor,
                        isSelected: viewModel.selectedCrop == crop,
                        count: count
                    ) {
                        viewModel.selectedCrop = viewModel.selectedCrop == crop ? nil : crop
                    }
                }
            }
        }
        .contentMargins(.horizontal, 16)
        .scrollClipDisabled()
        .scrollIndicators(.hidden)
    }

    private var pestGridSection: some View {
        LazyVStack(spacing: 10) {
            if viewModel.filteredPests.isEmpty {
                ContentUnavailableView(
                    "Nenhuma praga encontrada",
                    systemImage: "magnifyingglass",
                    description: Text("Tente buscar por outro termo.")
                )
                .padding(.top, 40)
            } else {
                ForEach(viewModel.filteredPests) { pest in
                    Button {
                        selectedPest = pest
                    } label: {
                        PestCardView(pest: pest)
                    }
                    .sensoryFeedback(.selection, trigger: selectedPest)
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

struct CropCategoryChip: View {
    let icon: String
    let name: String
    let color: Color
    let isSelected: Bool
    let count: Int?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack(alignment: .topTrailing) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(
                                isSelected
                                    ? LinearGradient(colors: [color, color.opacity(0.8)], startPoint: .topLeading, endPoint: .bottomTrailing)
                                    : LinearGradient(colors: [color.opacity(0.12), color.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing)
                            )
                            .frame(width: 52, height: 52)
                            .shadow(color: isSelected ? color.opacity(0.25) : .clear, radius: 8, y: 4)

                        Image(systemName: icon)
                            .font(.title3)
                            .foregroundStyle(isSelected ? .white : color)
                    }

                    if let count {
                        Text("\(count)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(color)
                            .clipShape(Capsule())
                            .offset(x: 6, y: -4)
                    }
                }

                Text(name)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(isSelected ? color : .secondary)
                    .lineLimit(1)
            }
            .frame(minWidth: 72)
            .fixedSize(horizontal: true, vertical: false)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(count != nil ? "\(name), \(count!) pragas" : name)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

struct PestCardView: View {
    let pest: Pest

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(
                        LinearGradient(
                            colors: [pest.severity.color.opacity(0.12), pest.severity.color.opacity(0.04)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 52, height: 52)
                Image(systemName: pestIcon)
                    .font(.title3)
                    .foregroundStyle(pest.severity.color)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(pest.namePt)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(pest.scientificName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .italic()
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let crop = CropType(rawValue: pest.crop) {
                        HStack(spacing: 3) {
                            Image(systemName: crop.icon)
                                .font(.system(size: 9))
                            Text(crop.displayName)
                        }
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(crop.accentColor.opacity(0.1))
                        .foregroundStyle(crop.accentColor)
                        .clipShape(Capsule())
                    }
                    Text(pest.category)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            VStack(spacing: 4) {
                Capsule()
                    .fill(pest.severity.color)
                    .frame(width: 4, height: 20)
                Text(pest.severity.displayName)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
            }

            Image(systemName: "chevron.right")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.quaternary)
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 16))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 3)
    }

    private var pestIcon: String {
        switch pest.category.lowercased() {
        case "lepidoptera": "ant.fill"
        case "hemiptera": "ladybug.fill"
        case "fungi": "leaf.fill"
        case "coleoptera": "ant.fill"
        default: "leaf.arrow.triangle.circlepath"
        }
    }
}
