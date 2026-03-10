import SwiftUI

enum SeverityLevel: String, Codable, Sendable, CaseIterable {
    case critical
    case high
    case medium
    case low
    case none

    var displayName: String {
        switch self {
        case .critical: "Crítico"
        case .high: "Alto"
        case .medium: "Médio"
        case .low: "Baixo"
        case .none: "Nenhum"
        }
    }

    var color: Color {
        switch self {
        case .critical: .red
        case .high: .orange
        case .medium: .yellow
        case .low: Color(red: 0.18, green: 0.55, blue: 0.24)
        case .none: .gray
        }
    }

    var icon: String {
        switch self {
        case .critical: "exclamationmark.triangle.fill"
        case .high: "exclamationmark.circle.fill"
        case .medium: "info.circle.fill"
        case .low: "checkmark.circle.fill"
        case .none: "minus.circle.fill"
        }
    }
}
