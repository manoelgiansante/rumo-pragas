import Foundation
import SwiftUI

enum CropType: String, Codable, Sendable, CaseIterable, Identifiable {
    case soja = "soja"
    case milho = "milho"
    case cafe = "cafe"
    case algodao = "algodao"
    case cana = "cana"
    case trigo = "trigo"
    case arroz = "arroz"
    case feijao = "feijao"
    case batata = "batata"
    case tomate = "tomate"
    case mandioca = "mandioca"
    case citros = "citros"
    case uva = "uva"
    case banana = "banana"
    case sorgo = "sorgo"
    case amendoim = "amendoim"
    case girassol = "girassol"
    case cebola = "cebola"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .soja: "Soja"
        case .milho: "Milho"
        case .cafe: "Café"
        case .algodao: "Algodão"
        case .cana: "Cana-de-açúcar"
        case .trigo: "Trigo"
        case .arroz: "Arroz"
        case .feijao: "Feijão"
        case .batata: "Batata"
        case .tomate: "Tomate"
        case .mandioca: "Mandioca"
        case .citros: "Citros"
        case .uva: "Uva"
        case .banana: "Banana"
        case .sorgo: "Sorgo"
        case .amendoim: "Amendoim"
        case .girassol: "Girassol"
        case .cebola: "Cebola"
        }
    }

    var apiName: String {
        switch self {
        case .soja: "Soybean"
        case .milho: "Corn"
        case .cafe: "Coffee"
        case .algodao: "Cotton"
        case .cana: "Sugarcane"
        case .trigo: "Wheat"
        case .arroz: "Rice"
        case .feijao: "Bean"
        case .batata: "Potato"
        case .tomate: "Tomato"
        case .mandioca: "Cassava"
        case .citros: "Citrus"
        case .uva: "Grape"
        case .banana: "Banana"
        case .sorgo: "Sorghum"
        case .amendoim: "Peanut"
        case .girassol: "Sunflower"
        case .cebola: "Onion"
        }
    }

    var icon: String {
        switch self {
        case .soja: "leaf.fill"
        case .milho: "laurel.leading"
        case .cafe: "cup.and.saucer.fill"
        case .algodao: "cloud.fill"
        case .cana: "leaf.arrow.triangle.circlepath"
        case .trigo: "wind"
        case .arroz: "drop.fill"
        case .feijao: "smallcircle.filled.circle.fill"
        case .batata: "square.stack.3d.up.fill"
        case .tomate: "circle.fill"
        case .mandioca: "tree.fill"
        case .citros: "sun.max.fill"
        case .uva: "circles.hexagongrid.fill"
        case .banana: "leaf.fill"
        case .sorgo: "chart.bar.fill"
        case .amendoim: "capsule.fill"
        case .girassol: "sun.min.fill"
        case .cebola: "target"
        }
    }

    var accentColor: Color {
        switch self {
        case .soja: Color(red: 0.18, green: 0.55, blue: 0.24)
        case .milho: Color(red: 0.85, green: 0.68, blue: 0.15)
        case .cafe: Color(red: 0.55, green: 0.33, blue: 0.16)
        case .algodao: Color(red: 0.75, green: 0.75, blue: 0.78)
        case .cana: Color(red: 0.30, green: 0.65, blue: 0.30)
        case .trigo: Color(red: 0.78, green: 0.64, blue: 0.20)
        case .arroz: Color(red: 0.40, green: 0.70, blue: 0.55)
        case .feijao: Color(red: 0.60, green: 0.35, blue: 0.20)
        case .batata: Color(red: 0.72, green: 0.58, blue: 0.30)
        case .tomate: Color(red: 0.85, green: 0.22, blue: 0.18)
        case .mandioca: Color(red: 0.50, green: 0.40, blue: 0.25)
        case .citros: Color(red: 0.90, green: 0.60, blue: 0.10)
        case .uva: Color(red: 0.50, green: 0.20, blue: 0.55)
        case .banana: Color(red: 0.90, green: 0.82, blue: 0.20)
        case .sorgo: Color(red: 0.65, green: 0.45, blue: 0.22)
        case .amendoim: Color(red: 0.72, green: 0.52, blue: 0.28)
        case .girassol: Color(red: 0.95, green: 0.75, blue: 0.10)
        case .cebola: Color(red: 0.68, green: 0.42, blue: 0.55)
        }
    }
}
