import SwiftUI

@Observable
@MainActor
class SettingsViewModel {
    var userName = "Produtor"
    var userEmail = ""
    var userRole = "produtor"
    var userCrops: [String] = []
    var userCity = ""
    var userState = ""
    var isDarkMode = true
    var language = "pt"
    var pushEnabled = true
    var currentPlan: SubscriptionPlan = .free
    var showEditProfile = false
    var showPaywall = false

    func loadProfile(user: SupabaseUser?) {
        guard let user else { return }
        userEmail = user.email ?? ""
        userName = user.userMetadata?.fullName ?? "Produtor"
    }
}
