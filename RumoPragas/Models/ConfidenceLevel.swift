import SwiftUI

enum ConfidenceLevel: String, Codable, Sendable {
    case high
    case medium
    case low
    case veryLow = "very_low"

    var displayName: String {
        switch self {
        case .high: "Alta"
        case .medium: "Média"
        case .low: "Baixa"
        case .veryLow: "Muito Baixa"
        }
    }

    var color: Color {
        switch self {
        case .high: Color(red: 0.18, green: 0.55, blue: 0.24)
        case .medium: .yellow
        case .low: .orange
        case .veryLow: .red
        }
    }

    var percentage: String {
        switch self {
        case .high: "85%+"
        case .medium: "60-84%"
        case .low: "40-59%"
        case .veryLow: "<40%"
        }
    }
}
