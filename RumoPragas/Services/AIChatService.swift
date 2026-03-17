import Foundation

nonisolated final class AIChatService: Sendable {
    static let shared = AIChatService()

    private let toolkitURL: String

    private init() {
        self.toolkitURL = Config.EXPO_PUBLIC_TOOLKIT_URL
    }

    func sendMessage(messages: [[String: String]], token: String? = nil) async throws -> String {
        let endpoint = "\(toolkitURL)/agent/chat"
        guard let url = URL(string: endpoint) else {
            throw APIError.invalidURL
        }

        let systemMessage: [String: String] = [
            "role": "system",
            "content": """
            Você é o Agro IA, assistente especializado em pragas agrícolas e manejo integrado de pragas (MIP) do app Rumo Pragas. \
            Você ajuda produtores rurais, agrônomos e técnicos agrícolas brasileiros. \
            Responda sempre em português brasileiro, de forma clara e prática. \
            Suas especialidades: identificação de pragas, doenças de plantas, recomendações de manejo (cultural, convencional e orgânico), \
            prevenção, monitoramento, condições climáticas favoráveis a pragas, e boas práticas agrícolas. \
            Seja direto, use linguagem acessível e, quando relevante, sugira o diagnóstico por foto do app. \
            Culturas principais: soja, milho, café, algodão, cana-de-açúcar e trigo.
            """
        ]

        var allMessages = [systemMessage]
        allMessages.append(contentsOf: messages)

        let payload: [String: Any] = ["messages": allMessages]
        let body = try JSONSerialization.data(withJSONObject: payload)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Config.EXPO_PUBLIC_SUPABASE_ANON_KEY, forHTTPHeaderField: "apikey")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = body
        request.timeoutInterval = 60

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.serverError("Erro ao se comunicar com a IA")
        }

        if let result = try? JSONDecoder().decode(ChatAPIResponse.self, from: data) {
            return result.text
        }

        if let result = try? JSONDecoder().decode(ChatAPIResponseAlt.self, from: data) {
            for msg in result.messages {
                for part in msg.parts {
                    if part.type == "text", let text = part.text {
                        return text
                    }
                }
            }
        }

        if let raw = String(data: data, encoding: .utf8), !raw.isEmpty {
            return raw
        }

        throw APIError.decodingError
    }
}

nonisolated struct ChatAPIResponse: Codable, Sendable {
    let text: String
}

nonisolated struct ChatAPIResponseAlt: Codable, Sendable {
    let messages: [ChatAPIMessage]
}

nonisolated struct ChatAPIMessage: Codable, Sendable {
    let role: String
    let parts: [ChatAPIPart]
}

nonisolated struct ChatAPIPart: Codable, Sendable {
    let type: String
    let text: String?
}
