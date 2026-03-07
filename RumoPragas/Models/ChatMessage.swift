import Foundation

nonisolated struct ChatMessage: Identifiable, Sendable {
    let id: UUID
    let role: ChatRole
    let content: String
    let timestamp: Date

    init(id: UUID = UUID(), role: ChatRole, content: String, timestamp: Date = Date()) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = timestamp
    }
}

nonisolated enum ChatRole: String, Sendable {
    case user
    case assistant
}
