import Foundation

nonisolated enum Config {
    private static func value(for key: String) -> String {
        Bundle.main.infoDictionary?[key] as? String ?? ""
    }

    static let supabaseURL = value(for: "SUPABASE_URL")
    static let supabaseAnonKey = value(for: "SUPABASE_ANON_KEY")
    static let stripePublishableKey = value(for: "STRIPE_PUBLISHABLE_KEY")
    static let googleClientID = value(for: "GOOGLE_CLIENT_ID")
    static let toolkitURL = value(for: "TOOLKIT_URL")
    static let rorkAPIBaseURL = value(for: "RORK_API_BASE_URL")
    static let projectID = value(for: "RORK_PROJECT_ID")
    static let teamID = value(for: "RORK_TEAM_ID")
    static let rorkAuthURL = value(for: "RORK_AUTH_URL")
    static let rorkAppKey = value(for: "RORK_APP_KEY")
    static let rorkDBEndpoint = value(for: "RORK_DB_ENDPOINT")
    static let rorkDBNamespace = value(for: "RORK_DB_NAMESPACE")
    static let rorkDBToken = value(for: "RORK_DB_TOKEN")

    // Aliases para compatibilidade com codigo existente
    static let EXPO_PUBLIC_SUPABASE_URL = supabaseURL
    static let EXPO_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey
    static let EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = stripePublishableKey
    static let EXPO_PUBLIC_GOOGLE_CLIENT_ID = googleClientID
    static let EXPO_PUBLIC_TOOLKIT_URL = toolkitURL
    static let EXPO_PUBLIC_RORK_API_BASE_URL = rorkAPIBaseURL
    static let EXPO_PUBLIC_PROJECT_ID = projectID
    static let EXPO_PUBLIC_TEAM_ID = teamID
    static let EXPO_PUBLIC_RORK_AUTH_URL = rorkAuthURL
    static let EXPO_PUBLIC_RORK_APP_KEY = rorkAppKey
    static let EXPO_PUBLIC_RORK_DB_ENDPOINT = rorkDBEndpoint
    static let EXPO_PUBLIC_RORK_DB_NAMESPACE = rorkDBNamespace
    static let EXPO_PUBLIC_RORK_DB_TOKEN = rorkDBToken
}
