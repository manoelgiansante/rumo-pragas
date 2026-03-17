import Foundation
import SwiftUI

@Observable
@MainActor
class AIChatViewModel {
    var messages: [ChatMessage] = []
    var inputText = ""
    var isSending = false
    var errorMessage: String?
    var suggestions: [String] = []

    private let suggestedQuestions = [
        "Como identificar ferrugem asiática na soja?",
        "Quais pragas atacam milho no verão?",
        "Manejo biológico da broca-do-café",
        "Controle de cigarrinha na cana",
        "Quando aplicar defensivo no algodão?",
        "Como prevenir percevejos na soja?"
    ]

    init() {
        refreshSuggestions()
    }

    func refreshSuggestions() {
        suggestions = Array(suggestedQuestions.shuffled().prefix(3))
    }

    private let maxMessages = 100

    func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }

        let userMessage = ChatMessage(role: .user, content: text)
        messages.append(userMessage)
        inputText = ""
        isSending = true
        errorMessage = nil

        if messages.count > maxMessages {
            messages.removeFirst(messages.count - maxMessages)
        }

        do {
            let recentMessages = Array(messages.suffix(20))
            let apiMessages = recentMessages.map { msg -> [String: String] in
                ["role": msg.role.rawValue, "content": msg.content]
            }

            // TODO: Injetar token de autenticacao via AuthViewModel/Environment
            let response = try await AIChatService.shared.sendMessage(messages: apiMessages, token: nil)

            let assistantMessage = ChatMessage(role: .assistant, content: response)
            messages.append(assistantMessage)
        } catch {
            errorMessage = "Não foi possível obter resposta. Tente novamente."
        }

        isSending = false
    }

    func sendSuggestion(_ text: String) async {
        inputText = text
        await sendMessage()
    }

    func clearChat() {
        messages.removeAll()
        errorMessage = nil
        refreshSuggestions()
    }
}
