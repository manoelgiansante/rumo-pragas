import Foundation

nonisolated enum SubscriptionPlan: String, Codable, Sendable, CaseIterable {
    case free
    case basico
    case pro

    var displayName: String {
        switch self {
        case .free: "Gratuito"
        case .basico: "Básico"
        case .pro: "Pro"
        }
    }

    var price: String {
        switch self {
        case .free: "R$ 0"
        case .basico: "R$ 29/mês"
        case .pro: "R$ 69/mês"
        }
    }

    var diagnosisLimit: Int {
        switch self {
        case .free: 3
        case .basico: 10
        case .pro: 50
        }
    }

    var features: [String] {
        switch self {
        case .free:
            ["3 diagnósticos/mês", "Biblioteca de pragas", "Mapa de surtos (visualizar)"]
        case .basico:
            ["10 diagnósticos/mês", "Chat IA (30 msgs/dia)", "Previsão de risco", "MIP básico", "Comunidade completa", "Histórico 90 dias"]
        case .pro:
            ["50 diagnósticos/mês", "Chat IA ilimitado", "Previsão de risco", "MIP avançado", "Comunidade completa", "Histórico ilimitado", "Relatórios PDF", "Suporte prioritário"]
        }
    }
}
