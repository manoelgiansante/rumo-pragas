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

    /// Cached parsed notes — populated once during decoding to avoid repeated JSONDecoder allocations.
    let parsedNotes: AgrioNotesData?

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

    init(
        id: String,
        userId: String,
        crop: String,
        pestId: String? = nil,
        pestName: String? = nil,
        confidence: Double? = nil,
        imageUrl: String? = nil,
        notes: String? = nil,
        locationLat: Double? = nil,
        locationLng: Double? = nil,
        locationName: String? = nil,
        createdAt: String
    ) {
        self.id = id
        self.userId = userId
        self.crop = crop
        self.pestId = pestId
        self.pestName = pestName
        self.confidence = confidence
        self.imageUrl = imageUrl
        self.notes = notes
        self.locationLat = locationLat
        self.locationLng = locationLng
        self.locationName = locationName
        self.createdAt = createdAt

        if let notes, let data = notes.data(using: .utf8) {
            self.parsedNotes = try? JSONDecoder().decode(AgrioNotesData.self, from: data)
        } else {
            self.parsedNotes = nil
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decode(String.self, forKey: .userId)
        crop = try container.decode(String.self, forKey: .crop)
        pestId = try container.decodeIfPresent(String.self, forKey: .pestId)
        pestName = try container.decodeIfPresent(String.self, forKey: .pestName)
        confidence = try container.decodeIfPresent(Double.self, forKey: .confidence)
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        notes = try container.decodeIfPresent(String.self, forKey: .notes)
        locationLat = try container.decodeIfPresent(Double.self, forKey: .locationLat)
        locationLng = try container.decodeIfPresent(Double.self, forKey: .locationLng)
        locationName = try container.decodeIfPresent(String.self, forKey: .locationName)
        createdAt = try container.decode(String.self, forKey: .createdAt)

        // Parse notes once during decoding
        if let notes, let data = notes.data(using: .utf8) {
            parsedNotes = try? JSONDecoder().decode(AgrioNotesData.self, from: data)
        } else {
            parsedNotes = nil
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(userId, forKey: .userId)
        try container.encode(crop, forKey: .crop)
        try container.encodeIfPresent(pestId, forKey: .pestId)
        try container.encodeIfPresent(pestName, forKey: .pestName)
        try container.encodeIfPresent(confidence, forKey: .confidence)
        try container.encodeIfPresent(imageUrl, forKey: .imageUrl)
        try container.encodeIfPresent(notes, forKey: .notes)
        try container.encodeIfPresent(locationLat, forKey: .locationLat)
        try container.encodeIfPresent(locationLng, forKey: .locationLng)
        try container.encodeIfPresent(locationName, forKey: .locationName)
        try container.encode(createdAt, forKey: .createdAt)
    }

    var enrichment: AgrioEnrichment? {
        parsedNotes?.enrichment
    }

    var displayName: String {
        enrichment?.namePt ?? pestName ?? pestId ?? "Diagn\u{00f3}stico"
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
        case "coffee", "cafe", "caf\u{00e9}": return .cafe
        case "cotton", "algodao", "algod\u{00e3}o": return .algodao
        case "sugarcane", "cana", "cana-de-a\u{00e7}\u{00fa}car": return .cana
        case "wheat", "trigo": return .trigo
        case "rice", "arroz": return .arroz
        case "bean", "feijao", "feij\u{00e3}o": return .feijao
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

    nonisolated enum CodingKeys: String, CodingKey {
        case message
        case crop
        case cropConfidence = "crop_confidence"
        case idArray = "id_array"
        case predictions
        case enrichment
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        message = try container.decodeIfPresent(String.self, forKey: .message)
        crop = try container.decodeIfPresent(String.self, forKey: .crop)
        cropConfidence = try container.decodeIfPresent(Double.self, forKey: .cropConfidence)
        idArray = try container.decodeIfPresent([AgrioPrediction].self, forKey: .idArray)
        predictions = try container.decodeIfPresent([AgrioPrediction].self, forKey: .predictions)
        enrichment = try container.decodeIfPresent(AgrioEnrichment.self, forKey: .enrichment)
    }

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

    nonisolated enum CodingKeys: String, CodingKey {
        case id
        case confidence
        case commonName = "common_name"
        case scientificName = "scientific_name"
        case category
        case type
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        if let c = try? container.decode(Double.self, forKey: .confidence) {
            confidence = c
        } else if let c = try? container.decode(String.self, forKey: .confidence), let d = Double(c) {
            confidence = d
        } else {
            confidence = 0
        }
        commonName = try container.decodeIfPresent(String.self, forKey: .commonName)
        scientificName = try container.decodeIfPresent(String.self, forKey: .scientificName)
        category = try container.decodeIfPresent(String.self, forKey: .category)
        type = try container.decodeIfPresent(String.self, forKey: .type)
    }
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

    nonisolated enum CodingKeys: String, CodingKey {
        case namePt = "name_pt"
        case nameEs = "name_es"
        case description
        case descriptionEs = "description_es"
        case causes
        case causesEs = "causes_es"
        case symptoms
        case symptomsEs = "symptoms_es"
        case chemicalTreatment = "chemical_treatment"
        case chemicalTreatmentEs = "chemical_treatment_es"
        case biologicalTreatment = "biological_treatment"
        case biologicalTreatmentEs = "biological_treatment_es"
        case culturalTreatment = "cultural_treatment"
        case culturalTreatmentEs = "cultural_treatment_es"
        case prevention
        case preventionEs = "prevention_es"
        case severity
        case lifecycle
        case economicImpact = "economic_impact"
        case monitoring
        case favorableConditions = "favorable_conditions"
        case resistanceInfo = "resistance_info"
        case recommendedProducts = "recommended_products"
        case relatedPests = "related_pests"
        case actionThreshold = "action_threshold"
        case mipStrategy = "mip_strategy"
    }
}

nonisolated struct AgrioProduct: Codable, Sendable, Identifiable {
    var id: String { name }
    let name: String
    let activeIngredient: String?
    let dosage: String?
    let interval: String?
    let safetyPeriod: String?
    let toxicClass: String?

    nonisolated enum CodingKeys: String, CodingKey {
        case name
        case activeIngredient = "active_ingredient"
        case dosage
        case interval
        case safetyPeriod = "safety_period"
        case toxicClass = "toxic_class"
    }
}
