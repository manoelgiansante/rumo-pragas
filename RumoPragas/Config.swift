import Foundation

nonisolated enum Config {
    // Supabase
    static let supabaseURL = ""
    static let supabaseAnonKey = ""

    // Serviços externos
    static let toolkitURL = ""
    static let stripePublishableKey = ""
    static let googleClientID = ""

    // Compatibilidade (manter referências existentes)
    static let EXPO_PUBLIC_SUPABASE_URL = supabaseURL
    static let EXPO_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey
    static let EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = stripePublishableKey
    static let EXPO_PUBLIC_GOOGLE_CLIENT_ID = googleClientID
    static let EXPO_PUBLIC_TOOLKIT_URL = toolkitURL
}
