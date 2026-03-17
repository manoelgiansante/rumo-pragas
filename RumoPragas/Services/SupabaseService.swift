import Foundation

nonisolated final class SupabaseService: Sendable {
    static let shared = SupabaseService()

    private let supabaseURL: String
    private let supabaseKey: String

    private init() {
        self.supabaseURL = Config.EXPO_PUBLIC_SUPABASE_URL
        self.supabaseKey = Config.EXPO_PUBLIC_SUPABASE_ANON_KEY
    }

    private var baseURL: String { supabaseURL }

    private func makeRequest(
        path: String,
        method: String = "GET",
        body: Data? = nil,
        token: String? = nil,
        additionalHeaders: [String: String] = [:]
    ) -> URLRequest? {
        guard let url = URL(string: "\(baseURL)\(path)") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(supabaseKey, forHTTPHeaderField: "apikey")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        } else {
            request.setValue("Bearer \(supabaseKey)", forHTTPHeaderField: "Authorization")
        }
        for (key, value) in additionalHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        request.httpBody = body
        return request
    }

    func signUp(email: String, password: String, fullName: String) async throws -> AuthResponse {
        let payload: [String: Any] = [
            "email": email,
            "password": password,
            "data": ["full_name": fullName]
        ]
        let body = try JSONSerialization.data(withJSONObject: payload)
        guard let request = makeRequest(path: "/auth/v1/signup", method: "POST", body: body) else {
            throw APIError.invalidURL
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw parseAuthError(data: data)
        }
        return try JSONDecoder().decode(AuthResponse.self, from: data)
    }

    func signIn(email: String, password: String) async throws -> AuthResponse {
        let payload = ["email": email, "password": password]
        let body = try JSONEncoder().encode(payload)
        guard let request = makeRequest(
            path: "/auth/v1/token?grant_type=password",
            method: "POST",
            body: body
        ) else {
            throw APIError.invalidURL
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw parseAuthError(data: data)
        }
        return try JSONDecoder().decode(AuthResponse.self, from: data)
    }

    func resetPassword(email: String) async throws {
        let payload = ["email": email]
        let body = try JSONEncoder().encode(payload)
        guard let request = makeRequest(path: "/auth/v1/recover", method: "POST", body: body) else {
            throw APIError.invalidURL
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw parseAuthError(data: data)
        }
    }

    func signOut(token: String) async throws {
        guard let request = makeRequest(path: "/auth/v1/logout", method: "POST", token: token) else {
            return
        }
        let _ = try await URLSession.shared.data(for: request)
    }

    func refreshToken(_ refreshToken: String) async throws -> AuthResponse {
        let payload = ["refresh_token": refreshToken]
        let body = try JSONEncoder().encode(payload)
        guard let request = makeRequest(
            path: "/auth/v1/token?grant_type=refresh_token",
            method: "POST",
            body: body
        ) else {
            throw APIError.invalidURL
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw parseAuthError(data: data)
        }
        return try JSONDecoder().decode(AuthResponse.self, from: data)
    }

    func getUser(token: String) async throws -> SupabaseUser {
        guard let request = makeRequest(path: "/auth/v1/user", token: token) else {
            throw APIError.invalidURL
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw parseAuthError(data: data)
        }
        return try JSONDecoder().decode(SupabaseUser.self, from: data)
    }

    private func parseAuthError(data: Data) -> APIError {
        if let errorObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let msg = errorObj["error_description"] as? String ?? errorObj["msg"] as? String ?? errorObj["error"] as? String ?? errorObj["message"] as? String {
                return .serverError(msg)
            }
        }
        return .authFailed
    }

    func fetchDiagnoses(token: String, userId: String, limit: Int = 50) async throws -> [DiagnosisResult] {
        let encodedUserId = userId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? userId
        guard let request = makeRequest(
            path: "/rest/v1/pragas_diagnoses?user_id=eq.\(encodedUserId)&order=created_at.desc&limit=\(limit)",
            token: token,
            additionalHeaders: ["Prefer": "return=representation"]
        ) else {
            throw APIError.invalidURL
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.networkError
        }
        return try JSONDecoder().decode([DiagnosisResult].self, from: data)
    }

    func fetchDiagnosisCount(token: String, userId: String) async throws -> Int {
        let encodedUserId = userId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? userId
        guard var request = makeRequest(
            path: "/rest/v1/pragas_diagnoses?user_id=eq.\(encodedUserId)&select=id",
            token: token,
            additionalHeaders: ["Prefer": "count=exact"]
        ) else {
            throw APIError.invalidURL
        }
        request.httpMethod = "HEAD"
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.networkError
        }
        if let range = http.value(forHTTPHeaderField: "Content-Range"),
           let total = range.split(separator: "/").last,
           let count = Int(total) {
            return count
        }
        return 0
    }

    func deleteDiagnosis(token: String, id: String) async throws {
        let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
        guard let request = makeRequest(
            path: "/rest/v1/pragas_diagnoses?id=eq.\(encodedId)",
            method: "DELETE",
            token: token
        ) else {
            throw APIError.invalidURL
        }
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.networkError
        }
    }

    func updateProfile(token: String, userId: String, profile: [String: Any]) async throws {
        let encodedUserId = userId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? userId
        let body = try JSONSerialization.data(withJSONObject: profile)
        guard let request = makeRequest(
            path: "/rest/v1/pragas_profiles?id=eq.\(encodedUserId)",
            method: "PATCH",
            body: body,
            token: token,
            additionalHeaders: ["Prefer": "return=representation"]
        ) else {
            throw APIError.invalidURL
        }
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.networkError
        }
    }

    func fetchProfile(token: String, userId: String) async throws -> UserProfile? {
        let encodedUserId = userId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? userId
        guard let request = makeRequest(
            path: "/rest/v1/pragas_profiles?id=eq.\(encodedUserId)&limit=1",
            token: token
        ) else {
            throw APIError.invalidURL
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.networkError
        }
        let profiles = try JSONDecoder().decode([UserProfile].self, from: data)
        return profiles.first
    }

    func callEdgeFunction(
        name: String,
        body: Data?,
        token: String
    ) async throws -> Data {
        guard let url = URL(string: "\(baseURL)/functions/v1/\(name)") else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(supabaseKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = body
        request.timeoutInterval = 180

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch let urlError as URLError {
            switch urlError.code {
            case .timedOut:
                throw APIError.serverError("Tempo esgotado. A análise demorou demais. Tente com uma imagem menor.")
            case .notConnectedToInternet, .networkConnectionLost:
                throw APIError.serverError("Sem conexão com a internet. Verifique sua rede.")
            default:
                throw APIError.networkError
            }
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.networkError
        }

        #if DEBUG
        print("[EdgeFunction] \(name) -> HTTP \(http.statusCode), \(data.count) bytes")
        #endif

        if (200...299).contains(http.statusCode) {
            return data
        }

        #if DEBUG
        let rawBody = String(data: data, encoding: .utf8) ?? "(empty)"
        print("[EdgeFunction] Error body: \(rawBody.prefix(1000))")
        #endif

        if let errorObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let errMsg = errorObj["error"] as? String {
                throw APIError.serverError(errMsg)
            }
            if let msg = errorObj["message"] as? String {
                throw APIError.serverError(msg)
            }
            if let msg = errorObj["msg"] as? String {
                throw APIError.serverError(msg)
            }
        }

        if http.statusCode == 404 {
            throw APIError.serverError("Função '\(name)' não encontrada no servidor. Verifique se a Edge Function está publicada.")
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw APIError.serverError("Sessão expirada. Faça login novamente.")
        }
        if http.statusCode == 500 {
            throw APIError.serverError("Erro interno do servidor. Tente novamente em alguns instantes.")
        }
        throw APIError.serverError("Erro do servidor (HTTP \(http.statusCode))")
    }
}

nonisolated struct EdgeFunctionError: Codable, Sendable {
    let error: String
}

nonisolated struct AuthResponse: Codable, Sendable {
    let accessToken: String?
    let tokenType: String?
    let refreshToken: String?
    let user: SupabaseUser?

    nonisolated enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case tokenType = "token_type"
        case refreshToken = "refresh_token"
        case user
    }
}

nonisolated struct SupabaseUser: Codable, Sendable {
    let id: String
    let email: String?
    let userMetadata: UserMetadata?

    nonisolated enum CodingKeys: String, CodingKey {
        case id
        case email
        case userMetadata = "user_metadata"
    }
}

nonisolated struct UserMetadata: Codable, Sendable {
    let fullName: String?

    nonisolated enum CodingKeys: String, CodingKey {
        case fullName = "full_name"
    }
}

nonisolated enum APIError: LocalizedError, Sendable {
    case invalidURL
    case networkError
    case authFailed
    case decodingError
    case serverError(String)
    case subscriptionRequired

    var errorDescription: String? {
        switch self {
        case .invalidURL: "URL inválida"
        case .networkError: "Erro de conexão. Verifique sua internet."
        case .authFailed: "Falha na autenticação"
        case .decodingError: "Erro ao processar resposta"
        case .serverError(let msg): msg
        case .subscriptionRequired: "Assinatura necessária para usar o diagnóstico por IA."
        }
    }
}
