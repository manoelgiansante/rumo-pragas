import SwiftUI

@Observable
@MainActor
class LibraryViewModel {
    var searchText = ""
    var selectedCrop: CropType?

    var filteredPests: [Pest] {
        var results: [Pest]
        if let crop = selectedCrop {
            results = PestDataService.pests(for: crop)
        } else {
            results = PestDataService.allPests
        }
        if !searchText.isEmpty {
            results = results.filter {
                $0.namePt.localizedCaseInsensitiveContains(searchText) ||
                $0.scientificName.localizedCaseInsensitiveContains(searchText) ||
                $0.description.localizedCaseInsensitiveContains(searchText)
            }
        }
        return results
    }

    var cropCounts: [(CropType, Int)] {
        CropType.allCases.map { crop in
            (crop, PestDataService.pests(for: crop).count)
        }
    }
}
