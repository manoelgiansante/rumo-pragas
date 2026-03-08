import SwiftUI

@Observable
@MainActor
class HistoryViewModel {
    var diagnoses: [DiagnosisResult] = []
    var isLoading = false
    var searchText = ""
    var selectedCropFilter: CropType?
    var deleteError: String?

    var filteredDiagnoses: [DiagnosisResult] {
        var results = diagnoses
        if let crop = selectedCropFilter {
            results = results.filter { $0.cropType == crop }
        }
        if !searchText.isEmpty {
            results = results.filter {
                $0.displayName.localizedCaseInsensitiveContains(searchText) ||
                ($0.scientificName?.localizedCaseInsensitiveContains(searchText) ?? false) ||
                ($0.pestId?.localizedCaseInsensitiveContains(searchText) ?? false)
            }
        }
        return results
    }

    func loadHistory(token: String?, userId: String?) async {
        guard let token, let userId else { return }
        isLoading = true
        do {
            diagnoses = try await SupabaseService.shared.fetchDiagnoses(token: token, userId: userId)
        } catch {
            diagnoses = []
        }
        isLoading = false
    }

    func deleteDiagnosis(_ diagnosis: DiagnosisResult, token: String?) async {
        guard let token else { return }
        let id = diagnosis.id
        diagnoses.removeAll { $0.id == id }
        do {
            try await SupabaseService.shared.deleteDiagnosis(token: token, id: id)
        } catch {
            deleteError = "Não foi possível excluir o diagnóstico."
        }
    }
}
