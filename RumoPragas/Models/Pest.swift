import Foundation

nonisolated struct Pest: Identifiable, Codable, Sendable, Hashable {
    let id: String
    let namePt: String
    let nameEs: String
    let scientificName: String
    let crop: String
    let category: String
    let description: String
    let symptoms: [String]
    let lifecycle: String
    let treatmentCultural: String
    let treatmentConventional: String
    let treatmentOrganic: String
    let prevention: String
    let imageURL: String?
    let severity: SeverityLevel
    let isNotifiable: Bool

    nonisolated enum CodingKeys: String, CodingKey {
        case id, namePt, nameEs, scientificName, crop, category, description
        case symptoms, lifecycle, treatmentCultural, treatmentConventional
        case treatmentOrganic, prevention, imageURL, severity, isNotifiable
    }

    nonisolated func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    nonisolated static func == (lhs: Pest, rhs: Pest) -> Bool {
        lhs.id == rhs.id
    }
}
