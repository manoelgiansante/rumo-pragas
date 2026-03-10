import Foundation

nonisolated struct UserProfile: Codable, Sendable, Identifiable {
    var id: String
    var fullName: String?
    var email: String?
    var city: String?
    var state: String?
    var role: String
    var crops: [String]
    var language: String
    var darkMode: Bool
    var pushEnabled: Bool
    var onboardingDone: Bool

    nonisolated enum CodingKeys: String, CodingKey {
        case id
        case fullName = "full_name"
        case email
        case city
        case state
        case role
        case crops
        case language
        case darkMode = "dark_mode"
        case pushEnabled = "push_enabled"
        case onboardingDone = "onboarding_done"
    }
}
