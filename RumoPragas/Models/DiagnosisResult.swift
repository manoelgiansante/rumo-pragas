import Foundation

nonisolated struct DiagnosisResult: Identifiable, Codable, Sendable, Hashable {
    let id: String
    let userId: String
    let crop: String
    let pestId: String?
    let pestName: String?
    let confidence: Double?
    let imageUrl: String?
    let notes: String?
    let locationLat: Double?
    let locationLng: Double?
    let locationName: String?
    let createdAt: String

    nonisolated enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case crop
        case pestId = "pest_id"
        case pestName = "pest_name"
        case confidence
        case imageUrl = "image_url"
        case notes
        case locationLat = "location_lat"
        case locationLng = "location_lng"
        case locationName = "location_name"
        case createdAt = "created_at"
    }

    var parsedNotes: AgrioNotesData? {
        guard let notes, let data = notes.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(AgrioNotesData.self, from: data)
    }

    var enrichment: AgrioEnrichment? {
        parsedNotes?.enrichment
    }

    var displayName: String {
        enrichment?.namePt ?? pestName ?? pestId ?? "Diagnóstico"
    }

    var scientificName: String? {
        parsedNotes?.topPrediction?.scientificName
    }

    var confidenceLevel: ConfidenceLevel {
        guard let confidence else { return .low }
        if confidence >= 0.85 { return .high }
        if confidence >= 0.60 { return .medium }
        if confidence >= 0.40 { return .low }
        return .veryLow
    }

    var severityLevel: SeverityLevel {
        if let s = enrichment?.severity {
            return SeverityLevel(rawValue: s) ?? .medium
        }
        return .medium
    }

    var symptomsList: [String] {
        enrichment?.symptoms ?? []
    }

    var causesList: [String] {
        enrichment?.causes ?? []
    }

    var chemicalTreatmentList: [String] {
        enrichment?.chemicalTreatment ?? []
    }

    var biologicalTreatmentList: [String] {
        enrichment?.biologicalTreatment ?? []
    }

    var culturalTreatmentList: [String] {
        enrichment?.culturalTreatment ?? []
    }

    var preventionList: [String] {
        enrichment?.prevention ?? []
    }

    var descriptionText: String? {
        enrichment?.description
    }

    var lifecycleText: String? {
        enrichment?.lifecycle
    }

    var economicImpactText: String? {
        enrichment?.economicImpact
    }

    var monitoringTips: [String] {
        enrichment?.monitoring ?? []
    }

    var favorableConditions: [String] {
        enrichment?.favorableConditions ?? []
    }

    var resistanceInfo: String? {
        enrichment?.resistanceInfo
    }

    var recommendedProducts: [AgrioProduct] {
        enrichment?.recommendedProducts ?? []
    }

    var relatedPests: [String] {
        enrichment?.relatedPests ?? []
    }

    var allPredictions: [AgrioPrediction] {
        parsedNotes?.predictions ?? parsedNotes?.idArray ?? []
    }

    var cropDetectedName: String? {
        parsedNotes?.crop
    }

    var cropDetectedConfidence: Double? {
        parsedNotes?.cropConfidence
    }

    var cropType: CropType? {
        let cropLower = crop.lowercased()
        switch cropLower {
        case "soybean", "soja": return .soja
        case "corn", "milho": return .milho
        case "coffee", "cafe", "café": return .cafe
        case "cotton", "algodao", "algodão": return .algodao
        case "sugarcane", "cana", "cana-de-açúcar": return .cana
        case "wheat", "trigo": return .trigo
        case "rice", "arroz": return .arroz
        case "bean", "feijao", "feijão": return .feijao
        case "potato", "batata": return .batata
        case "tomato", "tomate": return .tomate
        case "cassava", "mandioca": return .mandioca
        case "citrus", "citros": return .citros
        case "grape", "uva": return .uva
        case "banana": return .banana
        case "sorghum", "sorgo": return .sorgo
        case "peanut", "amendoim": return .amendoim
        case "sunflower", "girassol": return .girassol
        case "onion", "cebola": return .cebola
        default: return nil
        }
    }

    var isHealthy: Bool {
        pestId == "Healthy" || pestName == "Healthy"
    }

    var isFavorite: Bool { false }

    nonisolated func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    nonisolated static func == (lhs: DiagnosisResult, rhs: DiagnosisResult) -> Bool {
        lhs.id == rhs.id
    }
}

nonisolated struct AgrioNotesData: Codable, Sendable {
    let message: String?
    let crop: String?
    let cropConfidence: Double?
    let idArray: [AgrioPrediction]?
    let predictions: [AgrioPrediction]?
    let enrichment: AgrioEnrichment?

    var topPrediction: AgrioPrediction? {
        let preds = predictions ?? idArray ?? []
        return preds.first(where: { $0.id != "Healthy" }) ?? preds.first
    }
}

nonisolated struct AgrioPrediction: Codable, Sendable, Identifiable {
    let id: String
    let confidence: Double
    let commonName: String?
    let scientificName: String?
    let category: String?
    let type: String?
}

nonisolated struct AgrioEnrichment: Codable, Sendable {
    let namePt: String?
    let nameEs: String?
    let description: String?
    let descriptionEs: String?
    let causes: [String]?
    let causesEs: [String]?
    let symptoms: [String]?
    let symptomsEs: [String]?
    let chemicalTreatment: [String]?
    let chemicalTreatmentEs: [String]?
    let biologicalTreatment: [String]?
    let biologicalTreatmentEs: [String]?
    let culturalTreatment: [String]?
    let culturalTreatmentEs: [String]?
    let prevention: [String]?
    let preventionEs: [String]?
    let severity: String?
    let lifecycle: String?
    let economicImpact: String?
    let monitoring: [String]?
    let favorableConditions: [String]?
    let resistanceInfo: String?
    let recommendedProducts: [AgrioProduct]?
    let relatedPests: [String]?
    let actionThreshold: String?
    let mipStrategy: String?
}

nonisolated struct AgrioProduct: Codable, Sendable, Identifiable {
    var id: String { name }
    let name: String
    let activeIngredient: String?
    let dosage: String?
    let interval: String?
    let safetyPeriod: String?
    let toxicClass: String?
}
