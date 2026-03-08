import Foundation
import SwiftUI

@Observable
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

    func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }

        let userMessage = ChatMessage(role: .user, content: text)
        messages.append(userMessage)
        inputText = ""
        isSending = true
        errorMessage = nil

        do {
            let apiMessages = messages.map { msg -> [String: String] in
                ["role": msg.role.rawValue, "content": msg.content]
            }

            let response = try await AIChatService.shared.sendMessage(messages: apiMessages)

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
