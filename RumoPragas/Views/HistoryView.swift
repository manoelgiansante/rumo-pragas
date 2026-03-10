import SwiftUI

struct HistoryView: View {
    @State private var viewModel = HistoryViewModel()
    @State private var selectedDiagnosis: DiagnosisResult?
    let authVM: AuthViewModel
    var embedded = false

    var body: some View {
        Group {
            if embedded {
                historyContent
            } else {
                NavigationStack {
                    historyContent
                }
            }
        }
        .task {
            await viewModel.loadHistory(
                token: authVM.accessToken,
                userId: authVM.currentUser?.id
            )
        }
        .refreshable {
            await viewModel.loadHistory(
                token: authVM.accessToken,
                userId: authVM.currentUser?.id
            )
        }
    }

    private var historyContent: some View {
        Group {
            if viewModel.isLoading {
                loadingState
            } else if viewModel.filteredDiagnoses.isEmpty {
                emptyState
            } else {
                diagnosisList
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Histórico")
        .searchable(text: $viewModel.searchText, prompt: "Buscar por praga...")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        viewModel.selectedCropFilter = nil
                    } label: {
                        Label("Todos", systemImage: "square.grid.2x2")
                    }
                    ForEach(CropType.allCases) { crop in
                        Button {
                            viewModel.selectedCropFilter = crop
                        } label: {
                            Label(crop.displayName, systemImage: crop.icon)
                        }
                    }
                } label: {
                    Image(systemName: viewModel.selectedCropFilter != nil ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                        .symbolRenderingMode(.hierarchical)
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
        .alert("Erro", isPresented: $viewModel.showDeleteError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.deleteError ?? "Erro desconhecido")
        }
    }

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
            Text("Carregando histórico...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("Nenhum diagnóstico", systemImage: "doc.text.magnifyingglass")
        } description: {
            Text("Seus diagnósticos aparecerão aqui após a primeira análise.")
        } actions: {
            Text("Use a aba Início para fazer seu primeiro diagnóstico")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }

    private var diagnosisList: some View {
        List {
            if let filter = viewModel.selectedCropFilter {
                Section {
                    HStack(spacing: 8) {
                        Image(systemName: filter.icon)
                            .foregroundStyle(filter.accentColor)
                        Text("Filtro: \(filter.displayName)")
                            .font(.subheadline.weight(.medium))
                        Spacer()
                        Button("Limpar") {
                            viewModel.selectedCropFilter = nil
                        }
                        .font(.subheadline)
                    }
                }
            }

            Section {
                ForEach(viewModel.filteredDiagnoses) { diagnosis in
                    Button {
                        selectedDiagnosis = diagnosis
                    } label: {
                        DiagnosisRowView(diagnosis: diagnosis)
                    }
                    .listRowBackground(Color(.secondarySystemGroupedBackground))
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            Task {
                                await viewModel.deleteDiagnosis(diagnosis, token: authVM.accessToken)
                            }
                        } label: {
                            Label("Excluir", systemImage: "trash")
                        }
                    }
                }
            } header: {
                Text("\(viewModel.filteredDiagnoses.count) diagnósticos")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .listStyle(.insetGrouped)
    }
}

struct DiagnosisRowView: View {
    let diagnosis: DiagnosisResult

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(
                        LinearGradient(
                            colors: [
                                diagnosis.severityLevel.color.opacity(0.15),
                                diagnosis.severityLevel.color.opacity(0.05)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 48, height: 48)
                Image(systemName: diagnosis.isHealthy ? "checkmark.circle.fill" : diagnosis.severityLevel.icon)
                    .font(.title3)
                    .foregroundStyle(diagnosis.isHealthy ? AppTheme.accent : diagnosis.severityLevel.color)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(diagnosis.displayName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    if let crop = diagnosis.cropType {
                        HStack(spacing: 3) {
                            Image(systemName: crop.icon)
                                .font(.system(size: 9))
                            Text(crop.displayName)
                                .font(.caption2.weight(.medium))
                        }
                        .foregroundStyle(crop.accentColor)
                    }

                    if let confidence = diagnosis.confidence {
                        Text("•")
                            .font(.caption2)
                            .foregroundStyle(.quaternary)
                        Text("\(Int(confidence * 100))%")
                            .font(.caption2.weight(.semibold).monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text(shortDate(diagnosis.createdAt))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.tertiary)

                Capsule()
                    .fill(diagnosis.severityLevel.color)
                    .frame(width: 24, height: 4)
            }
        }
        .padding(.vertical, 2)
    }

    private func shortDate(_ dateString: String) -> String {
        DateFormatUtility.shortDate(dateString)
    }
}
