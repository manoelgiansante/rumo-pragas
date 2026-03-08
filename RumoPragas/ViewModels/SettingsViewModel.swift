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
    var isDarkMode: Bool = UserDefaults.standard.bool(forKey: "isDarkMode") {
        didSet { UserDefaults.standard.set(isDarkMode, forKey: "isDarkMode") }
    }
    var language = "pt"
    var pushEnabled = true
    var currentPlan: SubscriptionPlan = .free
    var showEditProfile = false
    var showPaywall = false
    var isSavingProfile = false
    var saveError: String?
    var saveSuccess = false

    func loadProfile(user: SupabaseUser?) {
        guard let user else { return }
        userEmail = user.email ?? ""
        userName = user.userMetadata?.fullName ?? "Produtor"
    }

    func saveProfile(token: String?, userId: String?) async {
        guard let token, let userId else { return }
        isSavingProfile = true
        saveError = nil
        saveSuccess = false
        let profile: [String: Any] = [
            "full_name": userName,
            "role": userRole,
            "city": userCity,
            "state": userState,
            "crops": userCrops,
            "language": language,
            "dark_mode": isDarkMode,
            "push_enabled": pushEnabled
        ]
        do {
            try await SupabaseService.shared.updateProfile(token: token, userId: userId, profile: profile)
            saveSuccess = true
        } catch {
            saveError = "Não foi possível salvar o perfil."
        }
        isSavingProfile = false
    }
}
